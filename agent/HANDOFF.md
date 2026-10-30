# Handoff

state: PHASE_0_HITL — #14 closed (oracles + ratchet, ADR-0018, ADR-0019); the map frontier is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 · #9 · #7 · #20 · #2 · #15 · #3 · #4 · #5 · #8 · #6 · #10 · #11 · #12 · #13 layout + build · #14 oracles + ratchet (ADR-0018/19)
frontier (map order, unassigned): #16 UDFs (grilling) · #17 interpreter/bytecode + speed (grilling); #19 final gate waits on both
next exact action (architect + owner): #16 UDFs (grilling + domain-modeling) unless the owner picks #17; re-check the frontier via REST; read the carry lines
owner action pending: paste deploy/claude-cloud/setup.sh (v3, Maven mirror + MVNW_REPOURL) into the cloud environment setup script; until then scratch settings.xml
carry into #16 (from #13, #12, #11, #10): UDF module/class loader → ADR-0016 table; -Xlint:all -Werror, no preview; licence exceptions per artifact; test timeout 10 s → `flottila:TIMEOUT`, cooperative cancel, runaway UDF isolation (ADR-0014); sources via `ReferenceResolver`; model `udfs.{name}: {executionKind, inputs, params, source: "File.java#method"}` (ADR-0010); `deterministic` flag; single-value UDFs lifted (SUPPRESS never reaches the body); lazy target order
carry into #16 (from #14): UDFs are never portable → golden corpus only (ADR-0018); export stub `po:UDF-NOT-EXPORTED` + optional hand-written XSLT body (#15 §6); where a UDF corpus case keeps its Java source is #16's; observation requests cover single-value UDF null/SUPPRESS input (#2 §7.15) and shared-box evaluation (`counter`, state)
carry into #17 (from #13, #12, #11): JMH in bench/jmh (profile bench, JMH 1.37, licence exception there only), measured in spec gate, label claude-cloud-4vcpu, bench.yml informative; bytecode = own engine module; editor runs unoptimised IR in the interpreter with a tracer; bytecode emits tracer hooks only in a traced compile; no compile cache decided; 20,128-field tree threshold
carry into #17 (from #14): interpreter ≡ bytecode = a fifth metamorphic variant in engine/oracle (byte-identical output over every corpus case) plus box-level `po:show` diff via trace; `ratchet/bench.tsv` format is `scenario\tlabel\tscore\tunit` — #17 sets scenarios, units, tolerance (JMH and the UI tree scenario)
carry into #19 (from #13, #12, #11): build skeleton = first ticket (ADR-0017); gate checks 1, 2, 3, 8, 9 updated; JSON output first spec after M1 (Saxon xml-to-json number normalisation); release to Central = fog
carry into #19 (from #14): skeleton adds engine/oracle, scripts/ratchet.java, JaCoCo + PIT config, surefire phrased-name reporter, Vitest per-glob thresholds, nightly.yml scope; measure the 30 s / 60 s ticket-gate budget; first spec opens the observation requests (ADR-0018 list) early — GATE check 4 needs them answered; GATE checks 4, 5, 8 updated
carry into the PO importer (fog): ADR-0010 mapping table; `formatVersion` 2 (shared box output, `switchedOff`, `ext_bind`, output ports) before it ships; CPI flavour reopens with `.mmap`
saxon: oracle pinned to Saxon-HE 12.5 (ADR-0005, ADR-0018); s9api and XMLUnit facts in agent/NOTES.md "Oracle and ratchet trial for #14"
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md, asks only gaps; one question at a time, Czech in chat, English artefacts; real mappings only via the owner locally (iFlow-forge)
env: Context7 MCP works; Maven via Google mirror in a scratch settings.xml + -Dmaven.repo.local; never `pkill -f`; jqwik is banned (prints an anti-agent instruction, ADR-0018)
gh: REST only, multi-line bodies with `-F body=@file`; every comment ends with the Claude Code footer
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
