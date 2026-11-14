#!/usr/bin/env bash
# Script test for HANDOVER.md (#190, GATE check 9): the file exists and names every item of the check.
# From #229 it also checks the process text the m1 gate findings changed (F-53 point 4, F-54, F-55, F-12).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
doc=$here/../../HANDOVER.md
fails=0
check() { if [ "$2" != "$3" ]; then echo "FAIL $1: expected '$3' got '$2'"; fails=1; else echo "ok   $1"; fi; }
has() { if [ -f "$doc" ] && grep -qF -- "$2" "$doc"; then echo "ok   $1"; else echo "FAIL $1: HANDOVER.md lacks '$2'"; fails=1; fi; }

check "HANDOVER.md exists" "$([ -f "$doc" ] && echo yes || echo no)" yes
# start the stack from a clean clone (JDK 25, Node 22)
has "JDK 25" "JDK 25"
has "Node 22" "Node 22"
has "dev service" "./mvnw -pl service -am quarkus:dev"
has "dev UI" "npm run dev"
has "one-origin jar (-Pui)" "-Pui"
has "loopback bind" "127.0.0.1"
has "workspace" "workspace"
has "installed mvn" "installed Maven"
has "Windows section" "Windows PowerShell"
has "not verified by the gate" "not verified by the gate"
has "benchmarks.jar on Windows" 'bench\jmh\target\benchmarks.jar'
# draw and run a mapping
has "New mapping" "New mapping"
has "Signature" "Signature"
has "Definition" "Definition"
has "Test tab" "**Test**"
has "Display Queue" "Display Queue"
# gates and benchmarks
has "ticket gate" "scripts/gate-ticket.sh"
has "spec gate" "scripts/gate-spec.sh"
has "machine label" "MACHINE_LABEL=claude-cloud-4vcpu"
has "-Pbench" "-Pbench"
has "bench results" "bench/RESULTS.md"
# open findings, ADRs to revisit, next three specs
has "open findings" "Open findings"
has "ADRs to revisit" "ADRs to revisit"
has "next three specs" "Next three specs"
has "JSON output" "JSON output"
has "bytecode tier" "bytecode tier"
has "PO importer" "PO importer"

# #229: the process text the m1 gate findings changed. flat <file> joins wrapped lines so a sentence is found
# whatever its line breaks.
root=$here/../..
flat() { tr '\n' ' ' < "$1" | sed 's/  */ /g'; }
in_file() { # in_file <label> <file> <text>
  if [ -f "$2" ] && flat "$2" | grep -qF -- "$3"; then echo "ok   $1"; else echo "FAIL $1: $2 lacks '$3'"; fails=1; fi
}
# F-54: /gate runs the ratchet check after the spec gate's step 2 (ui coverage), before its step 3 clean
in_file "gate step 2 orders ratchet check after step 2" "$root/.claude/skills/gate/SKILL.md" \
  'java scripts/ratchet.java check` after the spec gate'"'"'s step 2 (ui coverage)'
in_file "gate step 2 keeps check before clean" "$root/.claude/skills/gate/SKILL.md" "and before its step 3 \`clean\`"
# F-53 point 4: the ADR-0026 re-pin rule
adr26=$(ls "$root"/docs/adr/0026-*.md 2>/dev/null | head -1)
in_file "ADR-0026 re-pin rule" "${adr26:-$root/docs/adr/0026-missing.md}" \
  "a pinned-71 re-pin is also allowed when an entry's fidelity or execution kind changes"
in_file "ADR-0026 re-pin rule names F-53" "${adr26:-$root/docs/adr/0026-missing.md}" "F-53"
in_file "F-53 next step done" "$root/docs/findings/F-53.md" "**Next step** (done"
# F-54 and F-55 exist; F-55 is accepted
in_file "F-54 exists" "$root/docs/findings/F-54.md" "# F-54"
in_file "F-55 accepted" "$root/docs/findings/F-55.md" "Status: accepted"
# F-12 is resolved (closed by #90) and its status says so
in_file "F-12 status says closed" "$root/docs/findings/F-12.md" "Status: closed (#90"
# FOUNDING sections 1 and 6 point to ADR-0030
pointers=$(grep -cF "Refined by ADR-0030 (UDFs wait for Flottila's data model)" "$root/docs/FOUNDING-ARCHITECTURE.md")
check "FOUNDING pointers to ADR-0030" "$pointers" 2
exit $fails
