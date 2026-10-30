# Handoff

state: PHASE_0_HITL — #5 closed (grilling with the owner); the map frontier is HITL
spec: none · integration branch: none · tickets in flight: none
closed: #18 env · #9 frontend stack · #7 schema readers · #20 Context7 key · #2 PO queue semantics · #15 XSLT export · #3 milestone-1 functions (ADR-0002, ADR-0003) · #4 XDM + queue block (ADR-0004, ADR-0005) · #5 IR shape + queue lowering (ADR-0006, resolution comment on #5)
frontier (map order, open blockers 0, unassigned): #8 structure model (grilling) · #10 editor (prototype) · #16 UDFs (grilling) · #17 interpreter/bytecode + speed (grilling); #6 mapping-model format still blocked by #8
next exact action (architect + owner): HITL grilling #8 — designer draft first (structure tree from XSD/JSON Schema, what M1 refuses), then skills "grilling" and "domain-modeling"; start from docs/FOUNDING-ARCHITECTURE.md §6 and #7's research (confirm, do not re-ask); carry the JSON-target question below
carry into #6: every target field mapping, function box and source-field box has a stable `AuthoringId` (opaque string, survives edits and diffs); *unresolved function* placeholder; function catalogue as data (name, poName/cpiName, execution kind, parameters, portable, fidelity, pattern letters, `deterministic`)
carry into #8/#19: is JSON a target in M1? IR has XML constructors only; JSON adds constructor records under `TargetSlots`/`TargetRepeat` (ADR-0006)
carry into #12: display-queue wire format (`po:show` shape); service buffers output (destination undefined on error, ADR-0006)
carry into #16: UDFs run lazily in target document order; `deterministic` flag decides whether the optimiser may fold them; single-value UDFs are lifted like standard functions (SUPPRESS never reaches the body)
carry into #17: bytecode emits tracer hooks only in a traced compile; editor runs unoptimised IR in the interpreter
carry into #14: oracle cases for decimal division and canonical output (ADR-0005); differential `Lift` ≡ `po:lift`, `TargetSlots` ≡ `po:slots` + `po:at-least` (`po:MINOCCURS`); property cases optimised = unoptimised output, tracing does not change output; observed cases (owner, PO 7.5 + CPI) for every assumed reading in ADR-0004 and ADR-0006 (empty/missing context and SUPPRESS in Lift, SUPPRESS vs min/maxOccurs, truncated slot numbers, concat(const,const) on a target and child numbering, unmapped mandatory leaf) and for #2 §7 ambiguities; only portable functions are under the differential oracle
saxon: Saxon-HE 12.5 runs from `mvn dependency:copy` (net.sf.saxon:Saxon-HE:12.5 + xmlresolver 5.2.2) with `net.sf.saxon.Query '!method=text' -qs:…`; curl to repo1.maven.org got 429
owner rules (2026-10-30): grilling starts from docs/FOUNDING-ARCHITECTURE.md and asks only gaps/contradictions; one question at a time, Czech in chat, English artefacts; real-system mappings only via the owner locally (iFlow-forge), repo holds synthetic rewrites
iflow-forge: github.com/subapavel/iflow-forge (public, read via git proxy); po-xray-core parses XI_TRAFO `<mappingtool>` from TPZ and SimpleQuery; no CPI .mmap
env: Context7 MCP works; JDK 25 compiles sealed/record-pattern code (checked in #5); help.sap.com reachable; community.sap.com (Cloudflare), www.w3.org, saxonica.com, learning.sap.com, openjdk.org blocked (agent/NOTES.md)
gh: REST only, multi-line bodies with `-F body=@file` (never `-f`); every comment ends with the Claude Code footer
pointers: CLAUDE.md · AGENTS.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
