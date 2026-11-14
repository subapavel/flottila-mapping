# Handoff

state: SPEC_DONE — spec #228 "Post-milestone-1 cleanup". Integration branch `spec/228-m1-cleanup` from main 1818a439 (milestone 1 gate met, #226). The PR to main is open; the owner merges it.
done:
- #229 re-pin rule, `/gate` step order (F-54), PR #210 trailer exception (F-55), F-12 status, FOUNDING pointers, ADR-0006 Amendments list: a61e5e83
- #232 ModelCheck determinism; engine/mapping PIT 11 → 9: 798291f7
- #233 engine/api optimiser mutant (added mid-spec to unblock #231): efc97491
- #231 the #212 review carry list: d4dc2d23
- #230 F-51, removeContexts over a constant is a generating block (class C), catalogue member `generatingOverSingleValue`: eeed4832
- ratchet regen: a2ed91f5
gate: `MACHINE_LABEL=claude-cloud-4vcpu scripts/gate-spec.sh 228` VERIFIED_PASS on eeed4832.
- Oracles: corpus 620, differential 324, 0 failed.
- PIT, survivors/floor: api 0/0, ir 0/0, mapping 9/11 (floor → 9), runtime 5/5, serializer 0/0, xdm 0/0, xslt-export 0/0.
- `RATCHET BENCH OK`, with 7 gains:
  - orders/large/throughput 65.88 → 82.95 MB/s;
  - orders/small/latency 166.6 → 103.7 µs;
  - wide/large/throughput 113.2 → 138.4 MB/s.
review: two-axis `/code-review` of origin/main...a2ed91f5. Spec: PASS. Standards: PASS. #230 had its own two-axis review: PASS and PASS.
owner decisions (2026-11-14):
- F-51 covers only the observed cases. removeContexts over copyValue, and over removeContexts(Constant), stays as before; those runs are in #222.
- `concat(removeContexts(Constant), x)` is refused, as a catalogue deviation.
- A catalogue member `generatingOverSingleValue` is used instead of a function name in Lowering. ADR-0025 gets no exception.
- ADR-0026: a pinned-71 re-pin is also allowed whenever an entry gains or loses a catalogue member. The owner confirmed the general rule.
- After this spec, the mapping moves into the main project (Rail8), with the package rename, BEFORE JSON output, the jq/jqj grilling and the XSLT prototype. The move waits until the owner has renamed the main repository.
open: #222 (observation request, deferred), #191 (optional), #129 (ADR wording, owner).
carried (next cleanup ticket):
- From the #230 and #228 reviews:
  - GLOSSARY "constant form" is missing; "Generating block" and the context.json deviation say "constant" where ADR-0006 says "single value".
  - `FunctionCatalogue.Entry`: two booleans → one enum.
  - FunctionBoxLoweringTest: :409 `doesNotThrowAnyException`; :461 loop → parameterised; the "…StaysAsToday" names; the concat test matches "r1" in a message (ADR-0015).
  - EngineFacadeTraceTest:436 should say "since #230".
  - ADR-0006 Amendments: the dates are out of order and some bullets have no finding.
  - obs-lift-reuse meta.json lift-4 has `case: null`; it should be `fn/removeContexts/004`.
  - The ModelCheck path-order javadoc is stronger than its test.
  - `EngineFacade.compiledIr` is a test-only seam for an equivalent mutant: write a finding.
  - StatisticFunctionsTest `valuesOnly` duplicates `seeded`.
  - LiftVerifierTest:46 `REPLACE_VALUE` name.
  - handover-test.sh matches fixed sentences.
- From #232 and #233:
  - SchemaStage `SCHEMAS` static init cannot be reached by PIT (7 survivors).
  - Lowering walks targetFieldMappings in hash order; check for ties.
  - The EngineFacadeTraceTest race tests fail under PIT now and then: reproduce, then write a finding.
- The earlier carried lists of #205 and #212 that are still open (Node.Repeat sealed pair; the F-44/F-45 remainder).
- GATE check 8: add the nightly run id of 53415fbf to #226 when it lands.
rule (owner, 2026-11-10): every grilling round goes through the `grilling-adviser` (Fable 5.2) before the owner (`AGENTS.md`).
next action:
1. Owner: merge the spec #228 PR.
2. Architect, while waiting for the main repository: a read-only inventory of everything named `flottila` (packages `io.flottila`, Maven coordinates, properties such as `flottila.mapping.workspace`, docs, CI), and a draft ADR for embedding into Rail8. No move yet.
3. Once the owner names the renamed main repository: a grilling round on the move (history, issues, process files, build), then the move spec.
4. After the move: JSON output (ADR-0008), the jq/jqj shared-layer grilling, and the XSLT prototype (the IR sequence model).
