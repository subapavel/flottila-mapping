# Handoff

state: SPEC_DONE — spec #212 "Integrate the observation run of 2026-11-11 into the corpus and catalogue". Integration branch `spec/212-observations` from main 211c3ae. The PR to main is open; the owner merges it.
origin: the owner's observation run of 2026-11-11 (PO 7.50 SP33, CPI 6.84.77) answered #33 and #134 and the requests #32–#38 and #199–#204. Owner decisions are on #212 (2026-11-13: first and second set).
done:
- #213 evidence 68273dc
- #214 provenance 9c40729
- #215 boolean 050f9fe
- #221 decided cases and F-49..F-52 67d6f0b8
- #220 F-38 evidence only (deferred) 86ccb7f7
- #217 copyValue, class C, 9721b112
- #218 context SUPPRESS 89afc880
- #216 statistic and replaceValue, class C, 60d22eae
- #219 exists, mapWithDefault and useOneAsMany 746c259e
- spec gate and ratchet regen 54411ef9
- #223 F-53 gate decisions 2798e6d9
- #224 Standards-review fixes ae2f1c11
gate: `MACHINE_LABEL=claude-cloud-4vcpu scripts/gate-spec.sh 212` VERIFIED_PASS on 746c259e.
- Oracles: corpus 618, differential 323, 0 failed.
- PIT, survivors/floor: api 0/1 (floor → 0), ir 0/0, mapping 11/11, runtime 5/5, serializer 0/0, xdm 0/0, xslt-export 0/0.
- `RATCHET BENCH OK`. orders/large/throughput 53.56 → 65.88 MB/s; wide/large/throughput 91.35 → 113.2 MB/s.
review: two-axis `/code-review` of origin/main...746c259e.
- Spec: PASS.
- Standards: FAIL on two points, both fixed by #224:
  - the pinned-71 javadoc missed the #214 and #221 re-pins;
  - `decided` was wider than ADR-0018 l.44; the owner widened it (F-53 point 5).
corpus: of the 158 cases that were assumed, 136 are observed and 21 decided. Only `target/minOccurs/004` stays `assumed`; the owner deferred it (#220, F-38). No check-4 function is `assumed`.
owner decisions (2026-11-13, F-43, F-53):
- Where PO and CPI disagree, follow CPI and make the PO difference a catalogue deviation. A CPI simulator artefact is not a disagreement (trim/001).
- Time zone, counter, jsonNull and currentDate are decided.
- The isNil, inv, formatNum, fixValues, copyValue, sort and sortByKey deviations stand.
- replaceValue was fixed in class C (now a context function).
- F-38 is deferred.
- #222 holds every new assumed reading and is deferred past milestone 1. GATE check 4 now says so.
- The ADR-0026 `generating` amendment is approved.
- collapseContexts/004 and sortByKey/008 are decided.
- The re-pin rule is codified in ADR-0026 after the gate.
open:
- #222: observation request after milestone 1 (owner).
- #191: optional.
- #129: ADR wording (owner).
- #33 and #134: their remaining partial items are now listed in #222. Close them once the owner agrees.
carried (cleanup ticket after the gate):
- ADR-0026 re-pin rule (F-53 point 4).
- SingleValueBindingTest:99 name.
- LiftVerifierTest:41 and StatisticFunctionsTest:148: stale comments.
- statistic.xsl counter header says "assumed" (F-43 says decided).
- F-45:173 "node (context) functions".
- averageDividesTheTotalByTheCount needs a value-only generator.
- No export test for average raising on a SUPPRESS-only context.
- conversions.json fixValues note: plain behaviour first (ADR-0028).
- ADR-0006 Status line (15 amendments) → a dated Amendments list.
- Node.Repeat uses a null block as a kind flag → a sealed pair (JMH decides).
- FidelityAgreesWithTheCasesTest: the accepted half of its witness never runs now.
- BooleanFunctionsTest:199 has a hard-coded skip(10).
- The FunctionCatalogue.Entry 3-arg constructor is used by tests only.
- F-44:59 "queue functions".
- engine/mapping PIT sits at its floor, and ModelCheck:79 flips between runs.
- Plus the earlier carried list of #205, still open.
rule (owner, 2026-11-10): every grilling round goes through the `grilling-adviser` (Fable 5.2) before the owner (`AGENTS.md`).
next action:
1. Owner: merge the spec #212 PR.
2. Architect: run `/gate` milestone 1 on the new main commit with the F-40/F-41 procedure (`gate/m1` for RESULTS; the verifier's `.logs/gate-9.log`).
3. Then the cleanup ticket above.
4. Then the next spec from GATE "After milestone 1" (JSON output, ADR-0008), via grilling.
Owner notes for after the gate:
- The rename to Rail8 (R8, rail8.dev): docs only first; packages at embedding (ADR).
- jq becomes part of Rail8. Shared layers with jqj are to be grilled: limits/host SPI, the Class-File tier, the JSON tokenizer, tooling; and where XPath 3.1 lives.
