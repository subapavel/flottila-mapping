# Benchmark results

Every measured number lives here with machine, date, configuration and commit. A number that is
not in this file does not exist. Empty until the first JMH harness ticket.

## Build times (baseline for ADR-0017, grilling #13)

Machine `claude-cloud-4vcpu` (Claude Code cloud VM, 4 vCPU, 15 GB), 2026-10-30, JDK 25.0.5 (Oracle),
Maven 3.9.11, offline with a warm local repo. Scratch reactor (`xdm`, `structure`,
`structure-import`, `service` on Quarkus 3.40.1.1, `bench/jmh`), not a repo commit. Wall seconds,
two runs each.

| Command | Run 1 | Run 2 |
| --- | --- | --- |
| `-q -pl engine/xdm -am verify` | 3.7 | 3.6 |
| `-q -pl engine/structure-import -am verify` | 3.8 | 3.8 |
| `-q -pl service -am verify` | 14.3 | 14.3 |
| `-q verify` (full) | 14.9 | 14.3 |
| `-q -T 4 verify` (full) | 13.7 | 13.7 |
| `-B -q -DskipTests verify` (ticket gate step 2, with Spotless, enforcer, licences) | 8.4 | 8.5 |
| `-B -q verify -Pbench` (full + JMH jar) | 16.1 | 16.0 |
| scoped engine build, 3 copies in parallel | 8.7–9.9 each | |
| `-pl service -am verify`, 3 copies in parallel (`quarkus.http.test-port=0`) | 34.5–35.1 each | |
| `quarkus:dev` via `-pl service -am`, start to first answer | 10.3 | 8.3 |
| `-pl service -am verify` from an empty local repo, 3 in parallel (Google mirror) | 75–76 each | |

Budget: an engine ticket gate under 10 s with three in parallel; one that builds `service` under 40 s.

## Oracle and ratchet trial (grilling #14)

Machine `claude-cloud-4vcpu`, 2026-10-30, JDK 25.0.5, Maven 3.9.11, warm scratch repo. Scratch
reactor with two small modules (`engine/demo`, `engine/oracle`), not a repo commit. Wall seconds,
`clean verify`, not comparable with the table above (that one was without `clean`).

| Command | Time |
| --- | --- |
| `-q -pl engine/demo -am clean verify`, JaCoCo on | 8.5 |
| same, `-Djacoco.skip=true` | 6.9 |
| full `clean verify`, JaCoCo on | 12.5 |
| full `clean verify`, JaCoCo off | 10.5 |
| PIT `mutationCoverage` on `engine/demo` (14 mutants), mvn wall / PIT itself | 9.3 / 5 |
| `java ratchet.java check` (prototype) | 0.9–1.1 |
| `vitest run` vs `vitest run --coverage`, tiny `ui/` project | 1.1–1.2 vs 1.2–1.4 |

Budget (ADR-0019): an engine ticket gate including `engine/oracle` under 30 s with three in
parallel; one that builds `service` under 60 s. Not yet measured on the real modules: the skeleton
ticket measures it here.

## UDF trial (grilling #16, ADR-0020)

Machine `claude-cloud-4vcpu`, 2026-10-30, JDK 25.0.5, scratch reactors (not a repo commit), test
JVMs with `-Xmx512m`. Rough `System.nanoTime` timings, no JMH: these are orders of magnitude, not
baselines.

| Measurement | Result |
| --- | --- |
| in-process javac, first compile in a fresh JVM (engine module path) | 581–780 ms |
| in-process javac, warm, median of compiles 2–10 | 60–71 ms |
| warm compile of a 10-method UDF file | 111–147 ms |
| load a library + link 4 `MethodHandle`s | 1–3 ms |
| single-value UDF call via `invokeExact`, 1M calls warm | ~17 ns/call (direct call ~25 ns, noise) |
| Quarkus 3.40.1.1 fast-jar, first compile after start (server / client wall) | 604 / 655 ms |
| Quarkus fast-jar, warm, median of 10 (server / client wall) | 55 / 76 ms |
| ModuleLayer alternative: resolve + define + link, two layers | 14–22 ms |
| Class-File API instrumentation (guard at entry + back edges), per class | 1.2–1.6 ms |
| tight loop, per iteration: none / interrupt-check guard / ThreadLocal+nanoTime deadline | 0.95 / 0.95 / 28 ns |
| interrupted instrumented loop stops after | 0.6 ms |
| allow-list instruction walk, per class | 28–390 µs |
| child JVM start, run one UDF, exit (median of 5; `TieredStopAtLevel=1` same) | 64–75 ms |
| `destroyForcibly` on a spinning child JVM | 4–6 ms |
| class loader unload after the last reference (5× `System.gc()`) | ~340 ms |
