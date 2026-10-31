#!/usr/bin/env bash
# Ticket gate (docs/WORKFLOW.md section 6, ADR-0017, ADR-0019). Run from any directory; it changes to the
# repository root of the worktree it lives in.
#
#   scripts/gate-ticket.sh <ticket> <modules> [integration-ref]
#
# <ticket>           ticket number, used in the log names (.logs/<ticket>-<check>.log)
# <modules>          touched module directories, comma-separated (engine/xdm,engine/ir); `service` for the service
# [integration-ref]  e.g. origin/spec/21-walking-skeleton. When given, the ui/ steps run only if ui/ or contract/
#                    changed against it; without it they always run.
#
# Every step runs even if an earlier one failed. Each prints an evidence word (VERIFIED_PASS, EXECUTED_FAIL, NOT_RUN)
# and its log. Exit 1 if any step failed.
set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: scripts/gate-ticket.sh <ticket> <modules> [integration-ref]" >&2
  exit 2
fi
ticket=$1
modules=$2
base=${3:-}

cd "$(dirname "$0")/.."
mkdir -p .logs ui/.logs
status=0

# step <name> <log> <command...>: run, send all output to the log, print the evidence word
step() {
  local name=$1 log=$2
  shift 2
  if "$@" > "$log" 2>&1; then
    echo "VERIFIED_PASS  $name  ($log)"
  else
    echo "EXECUTED_FAIL  $name  ($log)"
    status=1
  fi
}

skipped() { echo "NOT_RUN         $1  ($2)"; }

# 1: touched and upstream modules, plus the oracle (which pulls in the whole engine)
step "1 build $modules,engine/oracle" ".logs/${ticket}-build.log" \
  ./mvnw -B -pl "${modules},engine/oracle" -am verify

# 2: the whole reactor compiles; Spotless, enforcer, licences
step "2 compile-all" ".logs/${ticket}-compile-all.log" \
  ./mvnw -B -q -DskipTests verify

# 3: the build writes contract/openapi.json; it must equal the committed one. Cheap, so it always runs.
step "3 contract diff" ".logs/${ticket}-contract.log" \
  git diff --exit-code contract/

# 4: ui/
ui_changed=true
if [ -n "$base" ]; then
  if git diff --quiet "$base"...HEAD -- ui contract && git diff --quiet HEAD -- ui contract; then
    ui_changed=false
  fi
fi
if [ "$ui_changed" = true ] && [ -f ui/package.json ]; then
  if [ ! -d ui/node_modules ]; then
    step "4 ui npm ci" "ui/.logs/${ticket}-npm-ci.log" bash -c 'cd ui && npm ci'
  fi
  for check in typecheck lint test test:browser e2e; do
    step "4 ui $check" "ui/.logs/${ticket}-${check/:/-}.log" bash -c "cd ui && npm run $check"
  done
  step "4 ui gen:types diff" "ui/.logs/${ticket}-gen-types.log" \
    bash -c 'cd ui && npm run gen:types && git diff --exit-code src/generated'
else
  skipped "4 ui" "ui/ and contract/ unchanged, or no ui/"
fi

# 5: the ratchet
step "5 ratchet" ".logs/${ticket}-ratchet.log" \
  java scripts/ratchet.java check

exit "$status"
