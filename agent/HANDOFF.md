# Handoff

state: RUNNING — /run-spec #48 "Spec 2: queues, contexts and node functions"
integration branch: spec/48-queues-node-functions (from main 3bf9747), tip 30507ea
merged: #49 #54 #62 #50 #55 #56 #58 #59 #51 #57 #52 #61 (1a9cec4) · owner obs #31 (f6b5d2d) · ratchet regen after #61 running
in flight: #53 test-author (t/53-trace, restarted after container restart) · #63 implementer B · #64 implementer B (F-17)
blocked chain: #60 editor e2e A ← #53
carried to spec review: po:at-least message lacks the target field (po-runtime.xsl:54) · export laziness rests on Saxon 12.5 (ADR-0006)
next action: #61 ratchet → record, close #61; then the #53 reds, #63, #64 in arrival order. #31 reopened only for the 5 spec-2 cases.
spec 1: merged to main 3bf9747 (#46). Carried items: #21 comment 6582060566; the spec-2 lines are in #48.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-12 (resolver port → spec 4) · F-13 (gate budget → spec 5) · F-15 (split per family before spec 3) · F-16 (PIT timeouts → spec 5) · spec 5: po:slots sums earlier contexts per call (#52) · F-17 (one empty context, #31 → #64)
retro: the ticket gate runs no PIT, so mutation drops surface only at the ratchet regen (#62)
carried: UI test panel does not render `error` (spec 6) · wire `error` lacks authoringId (#52/#53) · #49 ns0 test pins only all-mapped
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 speed · 6 editor · 7 UDFs.
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11.
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/
