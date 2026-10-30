# Ratchet

What passes, per oracle and per module. Decided in ADR-0019; the oracles are ADR-0018.
Regenerated and committed only by the verifier, on an integration branch, in spec-gate step 4
(`docs/WORKFLOW.md` §6). Never edited by hand. A drop fails the gate.

## Files

All files are line-based, sorted, UTF-8, LF. Columns are separated by one tab.

| File | One line per | Columns |
| --- | --- | --- |
| `oracle/corpus.txt` | golden-corpus case passing in all metamorphic variants | case id (`fn/removeContexts/001`) |
| `oracle/differential.txt` | case where our runtime agrees with Saxon-HE 12.5 on the exported XSLT | case id |
| `oracle/w3c-<suite>.txt` | passing W3C case (later milestones) | `<suite>:<test-set>/<test-case>` |
| `coverage.tsv` | engine module, `service`, `ui/src/model`, `ui/src/editor/store` | `module`, `lines %`, `branches %` |
| `mutation.tsv` | class-C module | `module`, `mutation score %` |
| `bench.tsv` | benchmark scenario (scenarios and tolerance: #17) | `scenario`, `machine label`, `score`, `unit` |

Percentages are whole numbers, rounded down. Module names are directories (`engine/xdm`).

## Commands

- `java scripts/ratchet.java check` (ticket-gate step 5): exit 1 if a listed case fails, is
  skipped or is missing, or a percentage is below its line. A module the gate did not build
  prints `NOT_RUN`. A rise only prints.
- `java scripts/ratchet.java regen --all` (spec-gate step 4): requires every report, refuses any
  drop, writes the files, prints the diff.

Inputs: `engine/oracle/target/surefire-reports/TEST-*.xml` (test name = case id),
`*/target/site/jacoco/jacoco.csv`, `*/target/pit-reports/mutations.xml`,
`ui/coverage/coverage-summary.json` (summed per directory).

Floors below the ratchet are fixed in the build (ADR-0019): JaCoCo, PIT, Vitest thresholds.
