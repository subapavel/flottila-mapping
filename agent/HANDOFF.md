# Handoff

state: PHASE_0_HITL — #16 closed (UDFs, ADR-0020); the map frontier is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 · #9 · #7 · #20 · #2 · #15 · #3 · #4 · #5 · #8 · #6 · #10 · #11 · #12 · #13 layout + build · #14 oracles + ratchet (ADR-0018/19) · #16 UDFs (ADR-0020)
frontier (map order, unassigned): #17 interpreter/bytecode + speed (grilling); #19 final gate waits on #17
next exact action (architect + owner): #17 (grilling); re-check the frontier via REST; read the carry lines
owner action pending: paste deploy/claude-cloud/setup.sh (v3, Maven mirror + MVNW_REPOURL) into the cloud environment setup script; until then scratch settings.xml
carry into #17 (from #13, #12, #11): JMH in bench/jmh (profile bench, JMH 1.37, licence exception there only), measured in spec gate, label claude-cloud-4vcpu, bench.yml informative; bytecode = own engine module; editor runs unoptimised IR in the interpreter with a tracer; bytecode emits tracer hooks only in a traced compile; no compile cache decided; 20,128-field tree threshold
carry into #17 (from #14): interpreter ≡ bytecode = a fifth metamorphic variant in engine/oracle (byte-identical output over every corpus case) plus box-level `po:show` diff via trace; `ratchet/bench.tsv` format is `scenario\tlabel\tscore\tunit` — #17 sets scenarios, units, tolerance (JMH and the UI tree scenario)
carry into #17 (from #16): UDF calls are `MethodHandle`s linked in the back end from the symbolic `FunctionRef`, through the runtime adapter (`Context`/`Queue` views over queue blocks, `ContextOut`, `MappingRun`); inlining UDFs into generated code is #17's; the interruption guard is inserted at every UDF method entry and back edge always (interrupt-flag check, ~0 ns measured); a deterministic UDF folds, one with `MappingRun` never; bytecode tier hidden classes stay for generated code only; UDF compile cold 0.6–0.8 s, warm 55–70 ms (rough, bench/RESULTS.md) — decide whether a JMH scenario covers it
carry into #19 (from #13, #12, #11): build skeleton = first ticket (ADR-0017); gate checks 1, 2, 3, 8, 9 updated; JSON output first spec after M1 (Saxon xml-to-json number normalisation); release to Central = fog
carry into #19 (from #14): skeleton adds engine/oracle, scripts/ratchet.java, JaCoCo + PIT config, surefire phrased-name reporter, Vitest per-glob thresholds, nightly.yml scope; measure the 30 s / 60 s ticket-gate budget; first spec opens the observation requests (ADR-0018 list) early — GATE check 4 needs them answered; GATE checks 4, 5, 8 updated
carry into #19 (from #16): skeleton adds engine/udf-api and engine/udf (class C, floors 90/80, PIT now on nine modules in nightly + spec gate 1b); `POST /api/mappings/{id}/udfs/scan`, trace `messages`, `flottila:UDF-ERROR`; corpus/udfs/ with deterministic-fold and call-order witnesses, a looping UDF (TIMEOUT) and a forbidden-API UDF; observation requests: single-value UDF on missing/SUPPRESS input (#2 §7.15) and shared box with state; GATE checks 3, 6, 8 updated
carry into the PO importer (fog): ADR-0010 mapping table; `formatVersion` 2 (shared box output, `switchedOff`, `ext_bind`, output ports) before it ships; CPI flavour reopens with `.mmap`
saxon: oracle pinned to Saxon-HE 12.5 (ADR-0005, ADR-0018); s9api and XMLUnit facts in agent/NOTES.md "Oracle and ratchet trial for #14"
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md, asks only gaps; one question at a time, Czech in chat, English artefacts; real mappings only via the owner locally (iFlow-forge)
env: Context7 MCP works; Maven via Google mirror in a scratch settings.xml + -Dmaven.repo.local; never `pkill -f`; jqwik is banned (prints an anti-agent instruction, ADR-0018)
gh: REST only, multi-line bodies with `-F body=@file`; every comment ends with the Claude Code footer
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
