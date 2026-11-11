# Handoff

state: SPEC_DONE — spec #181 "Speed" (milestone 1, spec 6; 2026-11-10 to 2026-11-11). Integration branch `spec/181-speed` from main a5ceafd; PR to main open, the owner merges.
origin: grilling 2026-11-10, two rounds via the `grilling-adviser` (record on #181).
done: #182 90eeacb · #184 ff7d1fb · #188 95d201a · #183 67bcb8b · #185 12d1116 · #187 4b0028f · #186 001da99 · #192 5a2515f · #189 a1f59e6 · #193 b023c4a · #195 895c532 · #194 4a800d8 · #190 a7b9c8b · spec gate + ratchet regen 088fe30 · review fix #196 c6daad3.
gate: `MACHINE_LABEL=claude-cloud-4vcpu scripts/gate-spec.sh 181` VERIFIED_PASS on a7b9c8b (Xeon 2.10 GHz, 4 CPUs, 16,472,084 kB); 14 first `bench.tsv` baselines, all targets met, no re-run (`bench/RESULTS.md` "Spec 6 gate (#181)").
review: two-axis `/code-review` FAIL (spec gate not recorded; median rule without a witness; a HANDOVER check that could not fail) → #196 → re-review PASS on both axes.
owner decisions (2026-11-11, ADR-0021 Notes of 2026-11-11, F-36): median of three runs; large target as 10 MB in ≤ 500 ms; no PO comparison for large messages, #191 runtime-only on PO and Integration Suite (`po-owner-local`, `is-owner-local`); baselines only from the spec gate; #194's behaviour changes accepted.
open: #191 (optional, ready-for-human).
carried to the next spec (from the reviews):
- `[Fatal Error] Invalid byte 2 of 2-byte UTF-8 sequence` on stderr: the JDK default error reporter behind `XmlProjection` (seen in runtime `InterpreterTest` bad-UTF-8 case); the service may print it for every malformed message.
- pin the heap of `smallLatency` and `compile` forks too (changes baselines, so it is a spec-gate change).
- `gate-ticket.sh` cannot build `bench/jmh` (no `-Pbench`; the root-only `corpus-bench-format` Spotless check does not run there).
- the small `wide` differential input has one record; the large output is checked at its ends only.
- bench classes, states and tests are near-copies; `wide()`/`contexts()` live outside `BenchMapping`.
- step 5 could write the host line (CPU, MemTotal) into its log.
- smaller: two-file later-wins in `ratchet.java` is unused; `FormatDate` per-value component lookup; glossary drift ("segment", "attribute") in the wide corpus; ADR-0021's 2026-11-10 note on a second heap invocation is stale; no test for #188's `rm -f`; the `orders/small/alloc` factor reading in #194.
- from `claude/sharp-hypatia-hkhf88` (owner observation #31 spec-2 part and fix #133, integrated by #206; findings renumbered F-37..F-39 there): F-37 accepted, `createIf` casts as PO does, `po:CREATEIF` at its box (ADR-0006 amended); F-38 open, waits for owner request #134 (`obs-target-creation-2`), `target/minOccurs/004` marked contradicted; F-39 accepted (ADR-0026 amended: a helper that starts to raise re-pins its block). That PO's case folding is `Locale.ROOT` lower-case is assumed, not observed (#133). Trailer exceptions (owner, 2026-11-11): eight imported commits from the owner's session, history not rewritten: the six #31 commits 020419d, 31d5a4e, ad8bdfa, a9d91bd, 073d0f9, e706a0c and the two Codex-prompt commits 2b58a23, 36af7e1.
rule (owner, 2026-11-10): every grilling round goes through the `grilling-adviser` (Fable 5.2) before the owner (`AGENTS.md`).
next action: owner — review and merge the spec #181 PR (the last spec of milestone 1). Then architect — `/gate` on that main commit (milestone 1, `docs/GATE.md`); retro for spec 5, #135, #145, #152 and #181 (deferred); after the gate, the next spec from GATE "After milestone 1" (JSON output, ADR-0008) via grilling.
