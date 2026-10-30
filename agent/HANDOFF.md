# Handoff

state: PHASE_0_HITL — #3 closed (grilling with the owner); the rest of the map frontier is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 env · #9 frontend stack · #7 schema readers · #20 Context7 key · #2 PO queue semantics · #15 XSLT export · #3 milestone-1 functions (ADR-0002, ADR-0003, resolution comment on #3)
frontier (map order, open blockers 0, unassigned): #4 XDM contract + queue representation (grilling) · #8 structure model (grilling) · #10 editor (prototype)
next exact action (architect + owner): HITL grilling #4 — skills "grilling" and "domain-modeling"; start from docs/FOUNDING-ARCHITECTURE.md §3 (confirm, do not re-ask); inputs: #15 §2/§9 and the #3 carry below
carry into #4: numbers are decimal only (ADR-0002) → decimal representation; strings order by code point; #15 recommends queue = `array(item()*)`, SUPPRESS = marker map
carry into #6/#8: function catalogue as data (name, poName/cpiName, execution kind, parameters, portable, fidelity, pattern letters); mapping model needs an *unresolved function* placeholder (later importer)
carry into #14: observed cases = HITL tickets the owner runs on SAP PO 7.5 + CPI trial (one per #2 §7 ambiguity + numeric cases 4.2−0.2, 1234567+0, 1/3); only portable functions are under the differential oracle
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md and asks only gaps/contradictions; one question at a time, Czech in chat, English artefacts; real-system mappings only via the owner locally (iFlow-forge), repo holds synthetic rewrites
iflow-forge: github.com/subapavel/iflow-forge (public, read via git proxy); po-xray-core parses XI_TRAFO `<mappingtool>` from TPZ and SimpleQuery; no CPI .mmap
env: Context7 MCP works; help.sap.com reachable; community.sap.com (Cloudflare), www.w3.org, saxonica.com, learning.sap.com blocked (agent/NOTES.md)
gh: REST only, multi-line bodies with `-F body=@file` (never `-f`)
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
