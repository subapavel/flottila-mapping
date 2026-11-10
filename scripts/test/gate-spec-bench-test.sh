#!/usr/bin/env bash
# Script test for spec-gate step 5 of scripts/gate-spec.sh (#184): the machine label, the re-run of the regressed
# scenarios and what step 4 writes, in a scratch root with stubbed mvnw and scripts/pit-summary.sh. A java stub
# plays benchmarks.jar (it copies the canned JSON of its n-th call to the -rff file) and runs the real
# scripts/ratchet.java otherwise. A nproc stub prints $NPROC.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
real_java=$(command -v java)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
check() { if [ "$2" != "$3" ]; then echo "FAIL $1: expected '$3' got '$2'"; fails=1; else echo "ok   $1"; fi; }
lines() { echo "$1" | grep -cF -- "$2"; }

mkdir -p "$tmp/scripts" "$tmp/ratchet/oracle" "$tmp/bin" "$tmp/engine" "$tmp/bench/jmh/target" "$tmp/canned"
cp "$here/../gate-spec.sh" "$here/../ratchet.java" "$tmp/scripts/"
: > "$tmp/bench/jmh/target/benchmarks.jar"
: > "$tmp/ratchet/oracle/corpus.txt"; : > "$tmp/ratchet/oracle/differential.txt"
: > "$tmp/ratchet/mutation.tsv"; : > "$tmp/ratchet/coverage.tsv"
printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/mvnw"
printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/scripts/pit-summary.sh"
printf '#!/usr/bin/env bash\necho "$NPROC"\n' > "$tmp/bin/nproc"
cat > "$tmp/bin/java" <<EOF
#!/usr/bin/env bash
root=\$(cd "\$(dirname "\$0")/.." && pwd)
if [ "\$1" = -jar ]; then
  echo "\$*" >> "\$root/jmh-calls"
  n=\$(wc -l < "\$root/jmh-calls")
  out=; prev=
  for a in "\$@"; do [ "\$prev" = -rff ] && out=\$a; prev=\$a; done
  cp "\$root/canned/jmh-\$n.json" "\$out"
  exit 0
fi
exec "$real_java" "\$@"
EOF
chmod +x "$tmp/mvnw" "$tmp/scripts/pit-summary.sh" "$tmp/bin/nproc" "$tmp/bin/java"

B=io.flottila.mapping.bench
M=claude-cloud-4vcpu
latency() { printf '[{"benchmark":"%s.OrdersBench.smallLatency","mode":"avgt","primaryMetric":{"score":0,"scoreUnit":"us/op","rawData":[[%s]]},"secondaryMetrics":{}},{"benchmark":"%s.OrdersBench.compile","mode":"avgt","primaryMetric":{"score":0,"scoreUnit":"ms/op","rawData":[[2]]},"secondaryMetrics":{}}]\n' "$B" "$2" "$B" > "$tmp/canned/jmh-$1.json"; }
row="orders/small/latency	$M	100	us/op"
# gate [<label>] [<nproc>]: the gate's output; the bench.tsv row, the calls and the logs reset first
gate() {
  printf '%s\n' "$row" > "$tmp/ratchet/bench.tsv"
  rm -rf "$tmp/jmh-calls" "$tmp/.logs"
  (cd "$tmp" && MACHINE_LABEL=${1:-} NPROC=${2:-4} PATH="$tmp/bin:$PATH" scripts/gate-spec.sh 1 2>&1)
}
calls() { if [ -f "$tmp/jmh-calls" ]; then wc -l < "$tmp/jmh-calls"; else echo 0; fi; }
regex='^(?:io\.flottila\.mapping\.bench\.OrdersBench\.smallLatency)$'

# no label: measured and printed, nothing judged, bench.tsv and bench/RESULTS.md untouched
latency 1 105
out=$(gate)
check "no label: one JMH run" "$(calls)" 1
check "no label: fail on error" "$(sed -n 1p "$tmp/jmh-calls" | grep -c -- '-foe true')" 1
check "no label: measured" "$(lines "$out" 'VERIFIED_PASS  5 jmh  (.logs/1-jmh.log)')" 1
check "no label: judgement NOT_RUN" "$(echo "$out" | grep -c '^NOT_RUN  *5 bench judgement')" 1
check "no label: bench.tsv untouched" "$(cat "$tmp/ratchet/bench.tsv")" "$row"
check "no label: no RESULTS.md" "$(test -e "$tmp/bench/RESULTS.md" && echo written || echo none)" none
out=$(gate other-label)
check "other label: judgement NOT_RUN" "$(echo "$out" | grep -c '^NOT_RUN  *5 bench judgement')" 1

# the label but not 4 CPUs: the cross-check fails, nothing judged or written
out=$(gate $M 2)
check "nproc 2: fail" "$(lines "$out" 'EXECUTED_FAIL  5 bench judgement  (MACHINE_LABEL=claude-cloud-4vcpu, but nproc is 2)')" 1
check "nproc 2: bench.tsv untouched" "$(cat "$tmp/ratchet/bench.tsv")" "$row"

# the label, a pass: one JMH run, judged, step 4 writes the new compile/orders row
out=$(gate $M)
check "pass: one JMH run" "$(calls)" 1
check "pass: judged" "$(lines "$out" 'VERIFIED_PASS  5 bench judgement  (.logs/1-bench.log)')" 1
check "pass: written" "$(cat "$tmp/ratchet/bench.tsv")" "$(printf '%s\n' "compile/orders	$M	2	ms/op" "$row")"

# the label, a regression, then a pass on the re-run of the regressed scenario only
latency 1 130
latency 2 110
out=$(gate $M)
check "re-run: two JMH runs" "$(calls)" 2
check "re-run: only the regressed" "$(sed -n 2p "$tmp/jmh-calls" | grep -cF -- "-rff .logs/1-jmh-2.json $regex")" 1
check "re-run: fail on error" "$(sed -n 2p "$tmp/jmh-calls" | grep -c -- '-foe true')" 1
check "re-run: first judgement kept" "$(grep -c 'is worse than the baseline' "$tmp/.logs/1-bench.log")" 1
check "re-run: judged again" "$(lines "$out" 'VERIFIED_PASS  5 bench judgement after the re-run  (.logs/1-bench-2.log)')" 1
check "re-run: no failed judgement" "$(lines "$out" 'EXECUTED_FAIL  5 bench')" 0
check "re-run: written" "$(cat "$tmp/ratchet/bench.tsv")" "$(printf '%s\n' "compile/orders	$M	2	ms/op" "$row")"

# the label, a regression twice: the gate fails, step 4 writes nothing
latency 2 125
out=$(gate $M)
check "twice: two JMH runs" "$(calls)" 2
check "twice: fail" "$(lines "$out" 'EXECUTED_FAIL  5 bench judgement after the re-run  (.logs/1-bench-2.log)')" 1
check "twice: regen refuses" "$(lines "$out" 'EXECUTED_FAIL  4 ratchet regen')" 1
check "twice: bench.tsv untouched" "$(cat "$tmp/ratchet/bench.tsv")" "$row"

# the label, a missed target and no regression: no re-run, the gate fails
row="orders/small/latency	$M	550	us/op"
latency 1 600
out=$(gate $M)
check "target: one JMH run" "$(calls)" 1
check "target: fail" "$(lines "$out" 'EXECUTED_FAIL  5 bench judgement  (.logs/1-bench.log)')" 1
exit "$fails"
