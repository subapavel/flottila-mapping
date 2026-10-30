# Handoff

state: PHASE_0_RESEARCH_DONE — every AFK research ticket of map #1 is closed; the rest of the map is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 env · #9 frontend stack · #7 schema readers · #20 Context7 key · #2 PO queue semantics (research/po-mapping-semantics @ 4b1087a) · #15 XSLT export (research/xslt-export-po-semantics @ 98dab50)
frontier (map order, open blockers 0, unassigned): #3 milestone-1 functions (grilling) · #4 XDM contract + queue representation (grilling) · #8 structure model (grilling) · #10 editor (prototype)
next exact action (architect + owner): HITL grilling #3 with the owner — call skills "grilling" and "domain-modeling"; inputs: #2 note §7 (10 ambiguities need a PO run) and #15 function table (8 clean / 9 helper / 1 hard)
carry into #4: #15 recommends queue = `array(item()*)`, SUPPRESS = marker map; numbers (float vs BigDecimal) and string order (UTF-16 vs code points) are open
carry into #14: helpers share the engine's readings of #2 ambiguities → only golden-corpus cases from PO runs catch them, not the differential oracle
env: Context7 MCP works; help.sap.com reachable; community.sap.com (Cloudflare), www.w3.org, saxonica.com, learning.sap.com blocked (agent/NOTES.md)
gh: REST only, multi-line bodies with `-F body=@file` (never `-f`)
pointers: CLAUDE.md · AGENTS.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
