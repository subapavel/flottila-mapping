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

## Interpreter and bytecode trial (grilling #17, ADR-0021)

Machine `claude-cloud-4vcpu` (4 vCPU Xeon 2.10 GHz, 15 GB), 2026-10-31, JDK 25.0.5, JMH 1.37.
Scratch reactor (`proto` with a toy queue block, StAX projector, hand-written UTF-8 writer and one
`orders`-shaped mapping: 1:1, two-input `Lift` concat, `removeContexts`, `splitByValue` + one-input
`Lift` with a UDF, unbounded targets), not a repo commit. Back ends: **a** tree-walking `switch`
interpreter, **b** closure-compiled interpreter, **c** Class-File API hidden class. JMH
`-f 1 -wi 3 -i 5 -w 1s -r 1s -prof gc`, three rounds; cells give the range of the three scores.
Toy numbers: the shapes and ratios inform ADR-0021, they are not baselines.

| Benchmark | a | b | c | Unit |
| --- | --- | --- | --- | --- |
| small 8.1 kB, parse + map + serialise | 111–123 | 109–112 | 96–104 | µs/op |
| small, map + serialise | 34.4–37.6 | 27.7–29.3 | 14.3–15.4 | µs/op |
| small, parse + map + serialise, alloc | 142,121 | 123,153 | 122,153 | B/op |
| small, map + serialise, alloc | 35,312 | 16,344 | 15,344 | B/op |
| large 10.54 MB, map + serialise | 64–73 | 43–46 | 32–39 | ms/op |
| large, map + serialise, alloc | 45.8 M | 21.1 M | 19.7 M | B/op |
| large, parse + map + serialise, 4 s iterations, one round | 323 ± 279 | 273 ± 317 | 183 ± 45 | ms/op |

| Measurement | Result |
| --- | --- |
| c with a no-op tracer compiled in / without interruption checks / default, small map-only | 13.5–15.1 / 13.4–14.4 / 14.3–15.4 µs/op (within noise) |
| UDF call, trivial body: direct / generated `invokeExact` on class-data condy / interpreter `invokeExact` on a field | 0.54–0.61 / 0.73–0.84 / 3.07–3.42 ns/op |
| UDF call, 80 B allocating body with guard loop: all call paths | 30–39 ns/op (the body dominates) |
| JMH noise: c small full, 3 runs back to back | 105.8 ± 31.4 / 112.0 ± 79.3 / 122.5 ± 129.3 µs/op (15.8 % spread) |
| bytecode compile, cold (first in a fresh JVM) / warm, median of 10 JVMs × 20 | 32.0 ms (26.3–46.7) / 2.3 ms |
| closure compile, warm | 0.05 ms |
| hidden class (no `STRONG`) unloaded after dropping references | after 1 `System.gc()` in 100/100, 7.4–19 ms |
| start to first mapped output, fresh JVM, median of 5: a / b / c | 98–109 / 122–124 / 129–136 ms |
| same with `-XX:AOTCache` (JEP 514 one-step training, 1.25 s, 13.2–13.6 MB cache) | 69 / 75 / 85 ms |
| five-variant byte-identity test (5 small seeds, 2 large 10.5 MB), surefire / `mvn -pl proto verify` wall | 2.1–3.7 s / 5.1–5.6 s |

Parsing takes about 85 % of the small message end to end. The large parse + map + serialise run
is GC-bound (bimodal iterations), so its error stays large even with 4 s iterations.

## Build skeleton (#22, ADR-0017, ADR-0019)

Machine `claude-cloud-4vcpu` (4 vCPU, JDK 25.0.5, Maven 3.9.11 via `./mvnw`, warm `~/.m2`), 2026-10-31.
Built from branch `t/22-build-skeleton` on top of `16ca7c2`; the skeleton has no production code, so
these are build-overhead baselines (plugins, Spotless, enforcer, licences, JaCoCo, Quarkus augmentation),
not test times. The first real tests will move them. Wall seconds, `-B -q`.

| Command | Time |
| --- | --- |
| ticket gate step 1, engine: `-pl engine/xdm,engine/oracle -am verify` (whole engine), single | 8.9, 9.6 |
| same, 3 copies of the repo in parallel (3 worktrees) | 21.0, 21.8, 21.8 |
| ticket gate step 1, service: `-pl service,engine/oracle -am verify`, single | 20.2, 20.8 |
| same, 3 copies in parallel | 53.6, 54.3, 54.3 |
| ticket gate step 2: `-DskipTests verify` (whole reactor incl. Quarkus build) | 14.8, 15.4 |
| full `-Pbench clean verify` | 19.6, 20.6 |
| `java scripts/ratchet.java check` | 0.9, 0.9 |
| `scripts/gate-spec.sh` end to end (all steps, JMH not run) | 99.9 |

Budget (ADR-0019): engine ticket gate under 30 s with three in parallel: 21.8 s, met. Service ticket gate
under 60 s with three in parallel: 54.3 s, met with 6 s to spare and with no `@QuarkusTest` yet, so the first
service tickets will probably break it. Step 2 is 15 s, not the "about 8 s" of ADR-0019: the real reactor has
13 modules and a Quarkus augmentation (about 10 s of it).

## Playwright 1.63.0 and the cloud image's Chromium (#22)

Checked 2026-10-31 on `claude-cloud-4vcpu` (and on the GitHub runner, see below).

| | Expected by `playwright-core` 1.63.0 (`browsers.json`) | Installed in `/opt/pw-browsers` |
| --- | --- | --- |
| chromium | build 1243 (Chrome for Testing 153.0.8010.12) | `chromium-1243` (153.0.8010.12) |
| chromium headless shell | build 1243 | `chromium_headless_shell-1243` (153.0.8010.12) |
| ffmpeg | 1011 | `ffmpeg-1011` |

Playwright 1.63.0 and the image match. The "mismatch" seen in the #14 trial (Vitest browser mode wanting
build 1248) came from a second Playwright copy: `@vitest/browser-playwright` 5.0.5 takes `playwright` as a
peer dependency (`*`), and with only `@playwright/test` 1.63.0 declared npm resolved the peer to **1.64.1**
and hoisted it, so the Vitest provider launched the 1248 headless shell. Observed in `npm ls playwright-core`
and in the CI log of the first run (`npx playwright install` fetched 1243, Vitest looked for 1248).

Resolution: `ui/package.json` declares `playwright` 1.63.0 as an exact devDependency, so there is one
Playwright copy. Then Vitest browser mode, `npm run e2e` and `npm run e2e:stack` all find the image's
Chromium with no path and no environment variable, and CI's `npx playwright install chromium` fetches the
same 1243. The optional `PW_CHROMIUM_EXECUTABLE` that #22 allowed for a mismatch is therefore not needed and
not added; `deploy/claude-cloud/setup.sh` is unchanged. Playwright is not downgraded.
