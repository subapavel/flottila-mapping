# Handoff

state: RUNNING — /run-spec #70 "Spec 3: standard functions"
integration branch: spec/70-standard-functions at 57a7dd1 (from main 9fd6fb4; ratchet regenerated after #78), status comment 6613673138
merged: #71 e4322f4 · #73 e461749 (under a docs message, see NOTES) · #75 7ab2275 · #76 89f7550 · #72 a30e71d · #77 05a7c11 · #74 034a4b4 · #79 befa0ea (copyValue only) · #78 cb917db
in flight: #83 class-C implementer (Opus xhigh) on t/83-generating-and-tables from 30b1dc2, state in #83 comment 6628548311 · #80 implementer (Opus high) on t/80-date from a14a588, without currentDate (rulings #80 comment 6628540353)
blocked chain: #83 → #80 (currentDate) · #82 (decimal parser) is frontier now that #72–#75 are closed
carried: spec-2 items by target spec in #48 comment 6595876651
next action: on each hand-back: ticket gate (verifier worktree) → #83 two-axis review at xhigh → merger (one at a time, with a build of the merged tree) → ratchet regen incl. PIT per touched module (pit-summary takes modules space-separated) → record. Then #80 adds currentDate after #83 merges; #82 (class B) after #80 merges; then spec gate, spec review, PR. While a merger runs the architect never writes in the main checkout.
carried to spec review: code comments still say "spec 6" for the editor (ui/src/api/client.ts:16, MappingsResource.java:218) · json-sKema undeclared at test scope in service/pom.xml · MappingRunException javadoc says codes are RuntimeErrors (true after #72) · #72 adds RuntimeErrors FORG0001/FOAR0001 with corpus cases (ruling on #72/#74/#80) · carried per ticket in the evidence comments of #72–#79 ("Carried to the spec review") · #83 contract: openapi TraceEntryDto gains {atomic}
spec 1: merged to main 3bf9747 (#46); carried #21 comment 6582060566. spec 2: merged 86bf5ed (#66); carried #48 comment 6595876651.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-20 (divide scale, ADR-0005 amended) · F-12 (resolver port → spec 4) · F-13 (gate budget → spec 6) · F-15 (split per family before spec 3) · F-16 (PIT timeouts → spec 6) · F-18 (export laziness → export spec)
retro: the ticket gate runs no PIT, so mutation drops surface only at the ratchet regen (#62)
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 editor · 6 speed · 7 UDFs (owner swapped 5/6, 2026-11-03).
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11.
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/
