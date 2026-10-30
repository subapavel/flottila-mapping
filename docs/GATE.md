# Milestone 1 gate — "a graphical mapping runs, end to end" (draft)

Draft written 2026-10-30. The Phase 0 map finalises each check (marked _(Phase 0)_ where a
decision is pending) before the first spec starts. The gate-reviewer (`/gate`) verifies every check
on one commit of `main`; each check names the command and the evidence it needs.

## Checks

1. **Import.** Two XSDs and one JSON Schema (draft 2020-12) from `corpus/structures/` load as
   source and as target structures; the editor shows the trees
   with types and effective occurrences. A mapping with a JSON source runs; compiling one with a
   JSON target is a design-time error in milestone 1 (ADR-0008). A schema construct ADR-0008
   refuses gives an error with file, line and column.
2. **Edit.** In the editor (ADR-0012: structure overview on top, function editor below) a
   person maps fields by drag and drop, inserts standard functions and constants, and saves;
   the mapping model passes its schema (ADR-0011) and round-trips byte-identical in canonical
   form (ADR-0010). Shown by the `@stack` Playwright suite against the service (ADR-0013).
3. **Run.** `POST /mappings/{id}/test` with an input returns the target message; the editor's test
   panel shows it. The display queue at any function shows contexts and SUPPRESS. At a target
   field it also shows the occurrences created per parent slot (ADR-0012). The test runs on the
   unsaved working copy; shown by the `@stack` Playwright suite (ADR-0013).
4. **Semantics.** The milestone-1 functions of issue #3 (ADR-0002, ADR-0003) pass their
   golden-corpus cases: all PO 7.5 node functions (`removeContexts`, `splitByValue` in all three
   modes, `collapseContexts`, `useOneAsMany`, `createIf`, `exists`, `mapWithDefault`,
   `formatByExample`, `sort`, `sortByKey`, `replaceValue`), statistics, arithmetic, `FormatNum`,
   text, boolean, `Constant`, `CopyValue`, `FixValues` and date functions. No shipped function has
   fidelity _assumed_; every _deviation_ is in the function catalogue and shown in the editor.
5. **Export.** Every corpus mapping whose functions are all portable exports to XSLT 3.0
   (portable profile); the differential run (our runtime vs
   Saxon-HE on the exported XSLT) agrees on every corpus input.
6. **UDF.** A Java UDF of each kind (single value, context, queue) compiles, runs and shows in the
   display queue.
7. **Speed.** JMH on the corpus: compiled-mapping latency and throughput for a small (≤ 10 kB)
   and a large (≥ 10 MB) message, recorded in `bench/RESULTS.md` with machine, date and commit.
   _(Phase 0: targets)_
8. **Quality.** Coverage and mutation floors on the class-C modules met on the gate commit, by
   CI _(Phase 0: floors)_; ratchet green; every spec of the milestone merged through `/run-spec`
   with its review. `ui/` (ADR-0013): typecheck, lint with the import-boundary rules, Vitest
   (node and browser), Playwright e2e on the fake API and the `@stack` suite green; line
   coverage of `ui/src/model/` and `ui/src/editor/store/` at its floor _(Phase 0, #14: proposed
   ≥ 90 %)_; generated types with an empty diff; the 20,128-field tree scenario within its
   `bench/RESULTS.md` threshold. No mutation testing on `ui/` in milestone 1.
9. **Hand-over.** `HANDOVER.md`: how to start the stack, how to draw and run a mapping, how to run
   the tests and the benchmarks, open findings, ADRs to revisit, the next three specs.

## Out of the gate

XSLT front end, XPath front end beyond what the exporter needs, PO import, streaming / burst
mode, Flottila integration, authentication, multi-user editing.
