# Handoff

state: PHASE_0_HITL — #17 closed (interpreter first, bytecode after M1, JMH targets; ADR-0021); #19 is the last map ticket
spec: none · integration branch: none · tickets in flight: none
closed: #18 · #9 · #7 · #20 · #2 · #15 · #3 · #4 · #5 · #8 · #6 · #10 · #11 · #12 · #13 layout + build · #14 oracles + ratchet (ADR-0018/19) · #16 UDFs (ADR-0020) · #17 interpreter/bytecode + speed (ADR-0021)
frontier (map order, unassigned): #19 final gate and the milestone's specs (grilling) — all 7 blockers closed
next exact action (architect + owner): #19 (grilling); re-check the frontier via REST; read every "carry into #19" line and the carry-over comments on #19
owner action pending: paste deploy/claude-cloud/setup.sh (v3, Maven mirror + MVNW_REPOURL) into the cloud environment setup script; until then scratch settings.xml
carry into #19 (from #13, #12, #11): build skeleton = first ticket (ADR-0017); gate checks 1, 2, 3, 8, 9 updated; JSON output first spec after M1 (Saxon xml-to-json number normalisation); release to Central = fog
carry into #19 (from #14): skeleton adds engine/oracle, scripts/ratchet.java, JaCoCo + PIT config, surefire phrased-name reporter, Vitest per-glob thresholds, nightly.yml scope; measure the 30 s / 60 s ticket-gate budget; first spec opens the observation requests (ADR-0018 list) early — GATE check 4 needs them answered; GATE checks 4, 5, 8 updated
carry into #19 (from #16): skeleton adds engine/udf-api and engine/udf (class C, floors 90/80, PIT now on nine modules in nightly + spec gate 1b); `POST /api/mappings/{id}/udfs/scan`, trace `messages`, `flottila:UDF-ERROR`; corpus/udfs/ with deterministic-fold and call-order witnesses, a looping UDF (TIMEOUT) and a forbidden-API UDF; observation requests: single-value UDF on missing/SUPPRESS input (#2 §7.15) and shared box with state; GATE checks 3, 6, 8 updated
carry into #19 (from #17): M1 = closure-compiled interpreter in engine/runtime only; engine/bytecode + fifth metamorphic variant = first engine spec after M1 (shape fixed, ADR-0021); skeleton/early spec adds corpus/bench/{orders,wide,contexts} + seeded generators, 7 JMH benchmarks via engine/api, bench rules in scripts/ratchet.java, Playwright tree p95 scenario; spec-gate step 5 before step 4, -f 3, ~5–6 min; GATE check 7 final (≤ 500 µs small, ≥ 20 MB/s + -Xmx128m large, compile ≤ 5 ms, tree p95 ≤ 16.7 ms); optional po-owner-local observation request; no compiled-mapping cache
carry into the PO importer (fog): ADR-0010 mapping table; `formatVersion` 2 (shared box output, `switchedOff`, `ext_bind`, output ports) before it ships; CPI flavour reopens with `.mmap`
saxon: oracle pinned to Saxon-HE 12.5 (ADR-0005, ADR-0018); s9api and XMLUnit facts in agent/NOTES.md "Oracle and ratchet trial for #14"
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md, asks only gaps; one question at a time, Czech in chat, English artefacts; real mappings only via the owner locally (iFlow-forge)
env: Context7 MCP works; Maven via Google mirror in a scratch settings.xml + -Dmaven.repo.local; never `pkill -f`; jqwik is banned (prints an anti-agent instruction, ADR-0018)
gh: REST only, multi-line bodies with `-F body=@file`; every comment ends with the Claude Code footer
fog added by #17: start-up (Leyden AOT cache, CDS, native image, serialised IR, invocation-count tiering)
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
