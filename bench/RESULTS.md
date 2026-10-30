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
