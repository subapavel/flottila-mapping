# Milestone 1 gate — "a graphical mapping runs, end to end" (draft)

Draft written 2026-10-30. The Phase 0 map finalises each check (marked _(Phase 0)_ where a
decision is pending) before the first spec starts. The gate-reviewer (`/gate`) verifies every check
on one commit of `main`; each check names the command and the evidence it needs.

## Checks

1. **Import.** Two XSDs and one JSON Schema (draft 2020-12) from `corpus/structures/` load as
   source and as target structures; the editor shows the trees
   with types and effective occurrences. A mapping with a JSON source runs; compiling one with a
   JSON target is a design-time error in milestone 1 (ADR-0008). A schema construct ADR-0008
   refuses gives an error with file, line and column. The schemas are read from the service's
   workspace through `POST /api/structures`, and a load error is a diagnostic with a
   `{file, line, column}` location (ADR-0014, ADR-0015).
2. **Edit.** In the editor (ADR-0012: structure overview on top, function editor below) a
   person maps fields by drag and drop, inserts standard functions and constants, and saves;
   the mapping model passes its schema (ADR-0011) and round-trips byte-identical in canonical
   form (ADR-0010). Save writes `<id>.mapping.json` in the workspace and returns the canonical
   model; a save over a file changed on disk answers 409 (ADR-0014). Shown by the `@stack`
   Playwright suite against the service (ADR-0013).
3. **Run.** `POST /api/mappings/{id}/test` with an input returns the target message; the editor's
   test panel shows it. The display queue at any function shows contexts and SUPPRESS. At a
   target field it also shows the occurrences created per parent slot (ADR-0012). The test runs
   on the unsaved working copy; shown by the `@stack` Playwright suite (ADR-0013). A runtime
   error (`po:MINOCCURS`) returns its QName, the `AuthoringId` and the trace up to the error,
   and diagnostics carry their stable codes (ADR-0015). `openapi.json` and the generated
   `ui/src/generated/` types have an empty diff. A UDF box shows in the display queue like any
   function box, with its `run.log` messages; a UDF exception returns `flottila:UDF-ERROR` with the
   `AuthoringId` (ADR-0020).
4. **Semantics.** The milestone-1 functions of issue #3 (ADR-0002, ADR-0003) pass their
   golden-corpus cases: all PO 7.5 node functions (`removeContexts`, `splitByValue` in all three
   modes, `collapseContexts`, `useOneAsMany`, `createIf`, `exists`, `mapWithDefault`,
   `formatByExample`, `sort`, `sortByKey`, `replaceValue`), statistics, arithmetic, `FormatNum`,
   text, boolean, `Constant`, `CopyValue`, `FixValues` and date functions. No shipped function has
   fidelity _assumed_; every _deviation_ is in the function catalogue and shown in the editor.
   Evidence (ADR-0018): every corpus case of these functions is in `ratchet/oracle/corpus.txt`
   on the gate commit, passing in all metamorphic variants, and none has `provenance: assumed`.
   The observation requests for the assumed readings of ADR-0004, ADR-0006, ADR-0008 and #2 §7
   are answered, and their cases are `observed`.
5. **Export.** Every corpus mapping whose functions are all portable exports to XSLT 3.0
   (portable profile); the differential run (our runtime vs
   Saxon-HE 12.5 on the exported XSLT, XMLUnit identical) agrees on every corpus input: every
   such case id is in `ratchet/oracle/differential.txt` (ADR-0018).
6. **UDF.** Java UDFs from `corpus/udfs/` of each kind (single value, context, queue) and one
   stateful UDF (`MappingRun`) compile in-process, run and pass their golden-corpus cases, which are
   in `ratchet/oracle/corpus.txt` (all metamorphic variants, including the deterministic-fold and
   call-order witnesses). The `@stack` suite shows a UDF box with its messages in the display queue
   and adds a UDF through the scan endpoint. A looping UDF in the corpus ends in `flottila:TIMEOUT`
   within the timeout, and a UDF calling a forbidden API fails to compile with `udf-forbidden-api`
   (ADR-0020).
7. **Speed.** The seven JMH benchmarks of ADR-0021 run on the gate commit in spec-gate step 5
   on `claude-cloud-4vcpu`, in the closure-compiled interpreter (milestone 1 has no bytecode
   tier). They cover the `corpus/bench/` mappings `orders`, `wide` and `contexts`, end to end,
   and are recorded in `bench/RESULTS.md` with machine, date and commit. Targets:
   - every small message (8–10 kB) at ≤ 500 µs/op;
   - every large message (≥ 10 MB) at ≥ 20 MB/s, and it completes in a fork with `-Xmx128m`;
   - `compile/orders` at ≤ 5 ms/op warm.

   No scenario is worse than `ratchet/bench.tsv` beyond its tolerance (ADR-0019). The
   20,128-field tree scenario has a p95 frame time of ≤ 16.7 ms. The optional PO observation
   request (`po-owner-local`) is informative only.
8. **Quality.** The CI run of the gate commit is green in all three required jobs, `backend`,
   `ui` and `stack` (ADR-0017). That covers the build with `-Xlint:all -Werror`, Spotless, the
   enforcer bans, the licence check with only the per-artifact exceptions of ADR-0017, the
   ArchUnit rules A–C (ADR-0016) and an empty `contract/` diff. The spec gate
   (`scripts/gate-spec.sh`) passes on the VM. Floors on the gate commit (ADR-0019): JaCoCo lines
   ≥ 90 % and branches ≥ 80 % on `xdm`, `ir`, `runtime`, `serializer`, `mapping`, `xslt-export`,
   `api`, `udf-api`, `udf`, lines ≥ 80 % on `structure`, `structure-import`, `service` (CI `backend`), and PIT
   ≥ 80 % on the nine class-C modules (the nightly run of the gate commit). The ratchet is green
   (`java scripts/ratchet.java check` on the gate commit). The drift tests (ADR-0011, ADR-0015),
   the workspace-escape test (ADR-0014) and the diagnostic-catalogue test (ADR-0018) are green. Every spec of the milestone was merged through `/run-spec` with its review. `ui/` (ADR-0013): typecheck, lint with the import-boundary rules, Vitest
   (node and browser), Playwright e2e on the fake API and the `@stack` suite green; line
   coverage of `ui/src/model/` and `ui/src/editor/store/` ≥ 90 % each (per-glob Vitest
   thresholds, ADR-0019); generated types with an empty diff; the 20,128-field tree scenario within its
   check-7 target. No mutation testing on `ui/` in milestone 1.
9. **Hand-over.** `HANDOVER.md` covers:
   - starting the stack from a clean clone with only JDK 25 and Node 22 installed:
     `./mvnw -pl service -am quarkus:dev` with `npm run dev` for development, and the `-Pui` jar
     for one origin (ADR-0017). The Quarkus service runs over a workspace and is bound to
     `127.0.0.1` (ADR-0014);
   - how to draw and run a mapping;
   - how to run the ticket gate, the spec gate and the benchmarks (`-Pbench`);
   - open findings, ADRs to revisit and the next three specs.

   The gate-reviewer follows the start instructions on a fresh worktree and records the result.

## Out of the gate

XSLT front end, XPath front end beyond what the exporter needs, PO import, streaming / burst
mode, Flottila integration, authentication, multi-user editing, shared-package references
(a design-time error until a host resolver exists), the transport export, an XSLT export
endpoint (ADR-0015).
