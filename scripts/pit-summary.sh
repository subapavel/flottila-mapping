#!/usr/bin/env bash
# PIT summary per module against the ratchet floor (#67, ADR-0019). One line per module:
#   <module> <killed>/<generated> <score>% floor <N>% ok|DROP
# Score = killed / (generated without NON_VIABLE), rounded down, the same count as scripts/ratchet.java.
# Exit 1 if any module is below its floor or has no report. A module without a floor row is only reported.
#
#   scripts/pit-summary.sh <mutation.tsv> <module>...
#
# PIT_ROOT (default: repository root) is where <module>/target/pit-reports/mutations.xml is looked up.
set -uo pipefail
if [ $# -lt 2 ]; then
  echo "usage: scripts/pit-summary.sh <mutation.tsv> <module>..." >&2
  exit 2
fi
tsv=$1
shift
root=${PIT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
rc=0
for m in "$@"; do
  xml=$root/$m/target/pit-reports/mutations.xml
  if [ ! -f "$xml" ]; then
    echo "$m no PIT report DROP"
    rc=1
    continue
  fi
  all=$(grep -c '<mutation ' "$xml")
  nonviable=$(grep '<mutation ' "$xml" | grep -c "status=['\"]NON_VIABLE['\"]")
  killed=$(grep '<mutation ' "$xml" | grep -c "detected=['\"]true['\"]")
  generated=$((all - nonviable))
  if [ "$generated" -eq 0 ]; then score=100; else score=$((killed * 100 / generated)); fi
  floor=$(awk -F'\t' -v m="$m" '$1 == m { print $2 }' "$tsv")
  if [ -z "$floor" ]; then
    echo "$m $killed/$generated ${score}% floor none ok"
  elif [ "$score" -lt "$floor" ]; then
    echo "$m $killed/$generated ${score}% floor ${floor}% DROP"
    rc=1
  else
    echo "$m $killed/$generated ${score}% floor ${floor}% ok"
  fi
done
exit "$rc"
