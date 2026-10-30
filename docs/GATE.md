# Milestone 1 gate — "a graphical mapping runs, end to end" (draft)

Draft written 2026-10-30. The Phase 0 map finalises each check (marked _(Phase 0)_ where a
decision is pending) before the first spec starts. The gate-reviewer (`/gate`) verifies every check
on one commit of `main`; each check names the command and the evidence it needs.

## Checks

1. **Import.** Two XSDs (and one JSON Schema) from `corpus/structures/` load as source and target
   structures; the editor shows both trees with types and cardinalities.
2. **Edit.** In the editor a person maps fields by drag and drop, inserts standard functions and
   constants, and saves; the mapping model passes its schema and round-trips unchanged.
3. **Run.** `POST /mappings/{id}/test` with an input returns the target message; the editor's test
   panel shows it, and the display queue at any function shows contexts and SUPPRESS.
4. **Semantics.** Context functions (`removeContexts`, `splitByValue`, `collapseContexts`,
   `useOneAsMany`, `createIf`, `exists`) and the standard function families agreed in Phase 0 pass
   their golden-corpus cases.
5. **Export.** Every corpus mapping exports to XSLT 3.0; the differential run (our runtime vs
   Saxon-HE on the exported XSLT) agrees on every corpus input.
6. **UDF.** A Java UDF of each kind (single value, context, queue) compiles, runs and shows in the
   display queue.
7. **Speed.** JMH on the corpus: compiled-mapping latency and throughput for a small (≤ 10 kB)
   and a large (≥ 10 MB) message, recorded in `bench/RESULTS.md` with machine, date and commit.
   _(Phase 0: targets)_
8. **Quality.** Coverage and mutation floors on the class-C modules met on the gate commit, by
   CI _(Phase 0: floors)_; ratchet green; every spec of the milestone merged through `/run-spec`
   with its review.
9. **Hand-over.** `HANDOVER.md`: how to start the stack, how to draw and run a mapping, how to run
   the tests and the benchmarks, open findings, ADRs to revisit, the next three specs.

## Out of the gate

XSLT front end, XPath front end beyond what the exporter needs, PO import, streaming / burst
mode, Flottila integration, authentication, multi-user editing.
