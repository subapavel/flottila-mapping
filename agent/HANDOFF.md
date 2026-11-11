# Handoff

state: SPEC_DONE — spec #205 "Gate fixes" (milestone 1 gate #198 NOT_MET → fixes a–d, owner 2026-11-11). Integration branch `spec/205-gate-fixes` from main 7b4fadd; PR to main open, the owner merges.
origin: gate #198 verdict NOT_MET (check 4 NOT_MET, check 9 NOT_VERIFIED, check 7 record-only); the owner approved fixes a) to d) on #198.
done: #208 76b3769 · #206 ba0ee15 · #207 3c19d3a · review fix #209 287f1d9 · spec gate + ratchet regen 26d7faa.
gate: `MACHINE_LABEL=claude-cloud-4vcpu scripts/gate-spec.sh 205` VERIFIED_PASS on 287f1d9 (Xeon 2.10 GHz, 4 CPUs, 16,472,084 kB); oracle corpus 626, differential 322; every bench scenario ok, `RATCHET BENCH OK`, no re-run; bench.tsv unchanged; corpus and differential +6 (fn/createIf/004..009), mutation engine/xdm 495 → 501.
review: two-axis `/code-review` of 7b4fadd...3c19d3a: Spec PASS; Standards FAIL (#206 reused corpus case fn/createIf/002, ADR-0018) → #209 restored 002 (now po:CREATEIF at C1) and moved FALSE/1/True to fn/createIf/009.
owner decisions (2026-11-11, #198, #207): a) integrate #31 spec-2 answers and fix #133 (#206), trailer exception for eight imported commits 020419d, 31d5a4e, ad8bdfa, a9d91bd, 073d0f9, e706a0c, 2b58a23, 36af7e1, `agent/prompts/fix-findings-F23-F24.md` deleted; b) no visual fidelity mark: exact and assumed show nothing, a deviation shows its note in the tooltip only (Add node and a placed box), eight notes reworded for readers who do not know SAP PO (#207); c) the gate run's `bench/RESULTS.md` section goes on `gate/<milestone>` (F-40); d) the verifier runs check 9 into `.logs/gate-9.log` and `ratchet check` before the clean (F-41); GATE check 2 cites ADR-0028 (F-42).
open: #191 (optional, ready-for-human); #129 (ADR wording, owner); observation requests #32–#38, #134, #199–#204 (owner, answers promised for 2026-11-12).
carried to the next spec (from the reviews):
- record the owner's tooltip-only rule in ADR-0028 and fix GLOSSARY Palette/Inspector and ADR-0012 l.19 "fidelity and deviation badge" (needs owner approval for the ADR edit).
- `target/max/002` is `observed` from PO only (CPI skipped in `obs-target-creation/meta.json`); ADR-0018 asks PO 7.5 and CPI: observe it on CPI in #134 or say so in the case.
- `ContextFunctions.truth` calls `toLowerCase(Locale.ROOT)` per slot in the runtime loop: an ASCII compare that allocates nothing, or a JMH number.
- `castable(String, boolean, String, String)` is copied in `EngineFacadeTraceTest`, `NestedSlotsAgreementTest` and `TargetSlotsInterpreterTest`; the name reads like a predicate. `ContextFunctionsSuppressTest.cast` recomputes `truth`.
- `TargetSlotsInterpreterTest:489` hand-builds IR for behaviour corpus 005/006 cover and runs the same input twice.
- `gate-reviewer.md` does not name `gate/<milestone>` for `bench/RESULTS.md` (step 4 of `/gate` passes the path).
- the #209 ticket named engine/mapping for the corpus red; the corpus tests live in engine/oracle.
- `Canvas.browser.test.tsx` asserts a class name (`.pf-v6-c-label`); "Node function" in `MappingNode.tsx` is a term GLOSSARY says to avoid; other Canvas polls may need the visibility wait #207 added.
- `EngineFacadeTraceTest.aTimeoutTraceIsAPrefixOfTheFullTrace` was flaky under load once (#207 ticket gate).
- `[Fatal Error] Invalid byte 2 of 2-byte UTF-8 sequence` on stderr: the JDK default error reporter behind `XmlProjection`; the service may print it for every malformed message.
- pin the heap of `smallLatency` and `compile` forks too (changes baselines, so it is a spec-gate change).
- `gate-ticket.sh` cannot build `bench/jmh` (no `-Pbench`; the root-only `corpus-bench-format` Spotless check does not run there).
- the small `wide` differential input has one record; the large output is checked at its ends only.
- bench classes, states and tests are near-copies; `wide()`/`contexts()` live outside `BenchMapping`.
- step 5 could write the host line (CPU, MemTotal) into its log.
- smaller: two-file later-wins in `ratchet.java` is unused; `FormatDate` per-value component lookup; glossary drift ("segment", "attribute") in the wide corpus; ADR-0021's 2026-11-10 note on a second heap invocation is stale; no test for #188's `rm -f`; the `orders/small/alloc` factor reading in #194.
- F-38 open, waits for #134; `target/minOccurs/004` marked contradicted. That PO's case folding is `Locale.ROOT` lower-case is assumed (#133).
rule (owner, 2026-11-10): every grilling round goes through the `grilling-adviser` (Fable 5.2) before the owner (`AGENTS.md`).
next action: owner — merge the spec #205 PR; answer the observation requests. Then architect — `oracle:corpus` tickets turn the answered cases and catalogue fidelity to observed (findings and fixes for divergences); then `/gate` milestone 1 again on the new main commit with the F-40/F-41 procedure (`gate/m1` for RESULTS, verifier's `.logs/gate-9.log`); retro for spec 5, #135, #145, #152, #181, #205 (deferred); after the gate, the next spec from GATE "After milestone 1" (JSON output, ADR-0008) via grilling.
