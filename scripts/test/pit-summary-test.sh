#!/usr/bin/env bash
# Script test for scripts/pit-summary.sh (#67). Builds PIT report fixtures in a temp tree.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tool=$here/../pit-summary.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
check() { if [ "$2" != "$3" ]; then echo "FAIL $1: expected '$3' got '$2'"; fails=1; else echo "ok   $1"; fi; }

# report <module> <killed> <survived> <non-viable>
report() {
  local d=$tmp/$1/target/pit-reports
  mkdir -p "$d"
  {
    echo "<mutations>"
    for ((i = 0; i < $2; i++)); do echo "<mutation detected='true' status='KILLED'><x/></mutation>"; done
    for ((i = 0; i < $3; i++)); do echo "<mutation detected='false' status='SURVIVED'><x/></mutation>"; done
    for ((i = 0; i < $4; i++)); do echo "<mutation detected='false' status='NON_VIABLE'><x/></mutation>"; done
    echo "</mutations>"
  } > "$d/mutations.xml"
}
printf 'engine/low\t90\nengine/good\t80\nengine/exact\t75\nengine/none\t50\n' > "$tmp/mutation.tsv"
report engine/low 17 3 2   # 85 % < floor 90
report engine/good 9 1 0   # 90 % >= 80
report engine/exact 3 1 0  # 75 % == 75
export PIT_ROOT=$tmp

out=$("$tool" "$tmp/mutation.tsv" engine/low); rc=$?
check "below floor: exit" "$rc" 1
check "below floor: line" "$out" "engine/low 17/20 85% floor 90% DROP"
out=$("$tool" "$tmp/mutation.tsv" engine/good engine/exact); rc=$?
check "at/above floor: exit" "$rc" 0
check "at/above floor: lines" "$out" "engine/good 9/10 90% floor 80% ok
engine/exact 3/4 75% floor 75% ok"
out=$("$tool" "$tmp/mutation.tsv" engine/none); rc=$?
check "missing report: exit" "$rc" 1
check "missing report: line" "$out" "engine/none no PIT report DROP"
out=$("$tool" "$tmp/mutation.tsv" engine/good engine/low); rc=$?
check "mixed: exit" "$rc" 1
exit $fails
