#!/usr/bin/env bash
# Spec gate (docs/WORKFLOW.md section 6, ADR-0017, ADR-0019, ADR-0021). Run by the verifier on the integration
# branch, one at a time. Changes to the repository root of the worktree it lives in.
#
#   scripts/gate-spec.sh <spec> [pit-modules]
#
# <spec>         spec issue number, used in the log names (.logs/<spec>-<check>.log)
# [pit-modules]  class-C module directories PIT runs on (step 1b), comma-separated. Default: the nine class-C
#                modules. The verifier narrows it to the modules the spec touched.
#
# Order: 1, 1b, 2, 5, 4, 3. Step 5 writes the JMH JSON that step 4 reads. Step 4 reads the reports of steps 1, 1b
# and 2, and step 3 must run after it: -Pui needs clean (ADR-0017), and that clean deletes the JaCoCo and PIT
# reports of service and its upstream modules. Every step runs even if an earlier one failed; each prints an
# evidence word and its log. Exit 1 if any step failed. The script leaves ratchet/ modified; the verifier
# commits it. The last lines are the PIT summary, one per module (`module killed/generated score% floor N% ok|DROP`),
# then the corpus and differential case counts.
set -uo pipefail

if [ $# -lt 1 ]; then
  echo "usage: scripts/gate-spec.sh <spec> [pit-modules]" >&2
  exit 2
fi
spec=$1
pit_modules=${2:-engine/xdm,engine/ir,engine/runtime,engine/serializer,engine/mapping,engine/xslt-export,engine/api,engine/udf-api,engine/udf}

cd "$(dirname "$0")/.."
mkdir -p .logs ui/.logs
status=0

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

# 1: everything, oracles and JaCoCo floors included, bench compiles
step "1 verify -Pbench" ".logs/${spec}-build.log" \
  ./mvnw -B clean verify -Pbench
step "1 contract diff" ".logs/${spec}-contract.log" \
  git diff --exit-code contract/

# 1b: PIT on the class-C modules (floor 80 %, ADR-0019). test-compile first: PIT needs the classes of a clean tree;
# -am puts upstream modules in the reactor, and modules without a mutation floor set pit.skip.
# One PIT run per module, each section preceded by `=== PIT <module> ===` in the log (#87).
IFS=, read -ra pit_list <<< "$pit_modules"
step "1b pit $pit_modules" ".logs/${spec}-pit.log" \
  scripts/pit-summary.sh --run ".logs/${spec}-pit.log" "${pit_list[@]}"

# 1b summary: per module against the floors in ratchet/ as committed (step 4 rewrites them). Printed last, with the
# oracle case counts of step 1 (step 3's clean deletes the reports).
pit_summary=$(scripts/pit-summary.sh ratchet/mutation.tsv "${pit_list[@]}") || {
  echo "EXECUTED_FAIL  1b pit floor  (ratchet/mutation.tsv)"
  status=1
}
# oracle_count <class-name-part>: "<tests> cases, <failed> failed or skipped" over the engine/oracle surefire reports
oracle_count() {
  local tests=0 bad=0 file attr v
  for file in engine/oracle/target/surefire-reports/TEST-*"$1"*.xml; do
    [ -f "$file" ] || continue
    for attr in tests failures errors skipped; do
      v=$(grep -m1 -o "<testsuite [^>]*" "$file" | grep -o " $attr=\"[0-9]*\"" | grep -o '[0-9]*')
      if [ "$attr" = tests ]; then tests=$((tests + ${v:-0})); else bad=$((bad + ${v:-0})); fi
    done
  done
  echo "$tests cases, $bad failed or skipped"
}
oracle_summary="corpus: $(oracle_count Corpus)
differential: $(oracle_count Differential)"

# 2: ui/
if [ -f ui/package.json ]; then
  step "2 ui npm ci" "ui/.logs/${spec}-npm-ci.log" bash -c 'cd ui && npm ci'
  for check in licences typecheck lint test test:browser e2e; do
    step "2 ui $check" "ui/.logs/${spec}-${check/:/-}.log" bash -c "cd ui && npm run $check"
  done
  step "2 ui gen:types diff" "ui/.logs/${spec}-gen-types.log" \
    bash -c 'cd ui && npm run gen:types && git diff --exit-code src/generated'
  step "2 ui build" "ui/.logs/${spec}-build.log" bash -c 'cd ui && npm run build'
else
  skipped "2 ui" "no ui/"
fi

# 5: JMH (ADR-0021), before step 4. The benchmarks arrive with the speed spec; until then there is no jar.
if [ -f bench/jmh/target/benchmarks.jar ]; then
  step "5 jmh" ".logs/${spec}-jmh.log" \
    java -jar bench/jmh/target/benchmarks.jar -f 3 -wi 3 -i 5 -w 1s -r 1s -prof gc -rf json -rff ".logs/${spec}-jmh.json"
else
  skipped "5 jmh" "bench/jmh/target/benchmarks.jar does not exist yet (speed spec)"
fi

# 4: ratchet regeneration, before step 3. Needs every report; refuses a drop. The verifier commits ratchet/.
step "4 ratchet regen" ".logs/${spec}-ratchet.log" \
  java scripts/ratchet.java regen --all

# 3: the stack, one jar serving UI and /api. Last: its clean deletes the reports step 4 read.
step "3 stack package -Pui" ".logs/${spec}-stack-package.log" \
  ./mvnw -B -Pui -pl service -am clean package -DskipTests
if [ -f ui/package.json ]; then
  step "3 stack e2e" "ui/.logs/${spec}-e2e-stack.log" bash -c 'cd ui && npm run e2e:stack'
fi

echo "$pit_summary"
echo "$oracle_summary"
exit "$status"
