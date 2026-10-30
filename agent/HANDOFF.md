# Handoff

state: PHASE_0_HITL — #4 closed (grilling with the owner); the map frontier is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 env · #9 frontend stack · #7 schema readers · #20 Context7 key · #2 PO queue semantics · #15 XSLT export · #3 milestone-1 functions (ADR-0002, ADR-0003) · #4 XDM + queue block (ADR-0004, ADR-0005, resolution comment on #4)
frontier (map order, open blockers 0, unassigned): #5 IR shape + queue lowering (grilling) · #8 structure model (grilling) · #10 editor (prototype)
next exact action (architect + owner): HITL grilling #5 — designer draft first (IR `sealed Expr`, IR type `Queue`, `SourceQueue`/`QueueToArray`/`ArrayToQueue` from ADR-0004, node ids from FOUNDING §4), then skills "grilling" and "domain-modeling"; start from docs/FOUNDING-ARCHITECTURE.md §4/§6 (confirm, do not re-ask)
carry into #5/#6/#8: IR type `Queue`; `SourceQueue(field, context, origin)` collected into one projection plan; constant stays `Literal`, single-value calls broadcast it; function catalogue as data (name, poName/cpiName, execution kind, parameters, portable, fidelity, pattern letters); mapping model needs an *unresolved function* placeholder (later importer)
carry into #14: oracle cases for decimal division (ADR-0005: 1/3, 2.0/3, scale-dependent 0.00001/3 → 23 digits, 1 div 30000000000000000000001 → 0) and canonical decimal output (4.2−0.2 → 4, 1234567+0 → 1234567, 1.50*1 → 1.5); observed cases = HITL tickets the owner runs on SAP PO 7.5 + CPI trial: one per #2 §7 ambiguity, numeric cases, constant into sum/useOneAsMany (ADR-0004), absent parent with mapWithDefault/count (ADR-0004); only portable functions are under the differential oracle
saxon: Saxon-HE 12.5 runs from `mvn dependency:copy` (net.sf.saxon:Saxon-HE:12.5 + xmlresolver 5.2.2) with `net.sf.saxon.Query '!method=text' -qs:…`; curl to repo1.maven.org got 429
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md and asks only gaps/contradictions; one question at a time, Czech in chat, English artefacts; real-system mappings only via the owner locally (iFlow-forge), repo holds synthetic rewrites
iflow-forge: github.com/subapavel/iflow-forge (public, read via git proxy); po-xray-core parses XI_TRAFO `<mappingtool>` from TPZ and SimpleQuery; no CPI .mmap
env: Context7 MCP works; help.sap.com reachable; community.sap.com (Cloudflare), www.w3.org, saxonica.com, learning.sap.com blocked (agent/NOTES.md)
gh: REST only, multi-line bodies with `-F body=@file` (never `-f`)
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
