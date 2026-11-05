# Handoff

state: RUNNING — /run-spec #89 (spec 4 "structures in full"), started 2026-11-05; status comment 6656160285 on #89
integration branch: spec/89-structures from main a1572bb
tickets: #90 T1 resolver port (C) · #91 T2 fingerprint at compile, one-pass compile (B, corpus) · #92 T3 refused fields (C) · #93 T4 XSD files and names (B) · #94 T5 XSD model groups (B, corpus) · #95 T6 XSD derivation (B, corpus) · #96 T7 WSDL (B) · #97 T8 JSON Schema reader (B) · #98 T9 JSON input runtime+export (B, corpus, differential) · #99 T10 refresh (B) · #100 T11 gate structures + @stack (B, corpus) · #86 oracle sweep (B, differential) · #87 mutation ratchet (A) · #102 T12 attributes as source and target fields (C, corpus, differential; added in the run) · #103 timeout trace test race (A; added in the run)
edges: #92←#91 · #93←#90,#91 · #94←#92,#93 · #95←#92,#93 · #96←#93 · #97←#90,#91 · #98←#97 · #99←#90,#91 · #100←#94,#95,#98,#99,#86,#87,#102,#103 · #102←#91. First frontier: #90, #91, #86, #87 (three writers at most).
in flight: #90 t/90-resolver-port 1f19f6b (ticket gate, then class-C review; must merge 88e4ea5) · #103 t/103-timeout-trace-race 2630ee6 red (implementer; allowed --add-opens in engine/api surefire argLine) · #92 t/92-refused-fields (designer)
merged: #87 444d1cc (ADR-0019 a67a893) · #86 f5932da (F-23: replaceValue fixed in the ticket) · #91 88e4ea5
blocked chain: none
grilling (spec 4, 2026-11-05): 3 rounds, all recommendations accepted. Recorded in ADR-0006 (no ContentType in M1), ADR-0008 (closed bundle + import fallback, refused fields, JSON input, all load errors at once, WSDL selector), ADR-0009 (refresh reports orphans + stage-3 diagnostics, compile checks fingerprint, fingerprint pin), ADR-0010 (Save byte-faithful), ADR-0014 (resolver port, closes F-12 on #90's merge), ADR-0015 (/refresh result), ADR-0016 (ArchUnit rule D), ADR-0024 (package-reference pattern); GLOSSARY: Root selector, Fingerprint, Package reference, Reference resolver, Refused field.
observed (2026-11-05): Saxon-HE 12.5 `json-to-xml` keeps number spelling (1.50, 1e2, -0.0, 20-digit decimal) and retains duplicate keys by default; the export passes duplicates: reject.
next action: resume /run-spec #89: reconcile the in-flight branches above, then refill from the frontier (#102 designer next)
carried: spec-2 items by target spec in #48 comment 6595876651 (spec-4 items now in #89/#91); spec-3 items in #70 comment 6639200141 (ContentType closed by the ADR-0006 amendment).
carried to spec review: trailer exceptions for the PR range: 0dab704 (wrong Co-authored-by form), 4386740 and ac18f47 (owner settings edits from the GitHub web editor, CRLF trailers fail `Ticket:`) · code comments still say "spec 6" for the editor (ui/src/api/client.ts:16, MappingsResource.java:218) · json-sKema undeclared at test scope in service/pom.xml · MappingRunException javadoc says codes are RuntimeErrors (true after #72) · #72 adds RuntimeErrors FORG0001/FOAR0001 with corpus cases (ruling on #72/#74/#80) · carried per ticket in the evidence comments of #72–#79 ("Carried to the spec review") · #83 contract: openapi TraceEntryDto gains {atomic} · #83 Standards judgement calls in evidence comment 6637478756 · #80 run-time truncation to millis (evidence comment 6638545337)
spec 1: merged to main 3bf9747 (#46); carried #21 comment 6582060566. spec 2: merged 86bf5ed (#66); carried #48 comment 6595876651. spec 3: merged 7dcc540 (#84); carried #70 comment 6639200141.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-20 (divide scale, ADR-0005 amended) · F-12 (resolver port → #90) · F-13 (gate budget → spec 6) · F-15 (split per family before spec 3) · F-16 (PIT timeouts → spec 6) · F-18 (export laziness → export spec) · F-21 (generating function = single-value result, ADR-0006 amended, closed by wording) · F-22 (single-value calls evaluate every input; ADR-0006 amended) · F-23 (replaceValue skipped its value input; fixed in #86)
retro (spec 3): trailers checked in the ticket gate (row 2c) · SPEC_DONE handoff rides the spec PR · memory written by the architect from `Worth recording:` blocks · tickets #86 (oracle sweep, erroring inputs) and #87 (mutation ratchet sees one mutant) for spec 4
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 editor · 6 speed · 7 UDFs (owner swapped 5/6, 2026-11-03).
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11.
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/

settings (owner, ac18f47): permissions allow Bash/Read/Edit/Write/WebFetch, deny force push, reset --hard, rm -rf /. Takes effect in a new session.
