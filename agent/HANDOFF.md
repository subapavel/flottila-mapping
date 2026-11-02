# Handoff

state: RUNNING — /run-spec #48 "Spec 2: queues, contexts and node functions"
integration branch: spec/48-queues-node-functions (from main 3bf9747), tip 4658186
merged: #49 housekeeping (6513644) · #54 service (107524a) · #62 nested XSD (3840154, fix 99a9efd, ratchet 4658186)
in flight: #50 removeContexts tracer C, implementer on t/50-remove-contexts (red @ cef58b8); test-author worktree kept
blocked chain: #51 SUPPRESS+Lift C ← #50 · #52 target fields C ← #51 · #53 trace C ← #52 · #60 editor e2e A ← #53
blocked on #50: #55 splitByValue B · #56 collapseContexts+useOneAsMany B · #58 formatByExample B · #59 sort B
blocked others: #57 exists+mapWithDefault B ← #51 · #61 obs requests A ← #55, #59
next action: take the #50 hand-back: ticket gate, then class-C two-axis review, merge, ratchet regen, record; then fill #55 #56 #58 #59 and #51.
spec 1: merged to main 3bf9747 (#46). Carried items: #21 comment 6582060566; the spec-2 lines are in #48.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-12 (resolver port → spec 4), F-13 (gate budget → spec 5), F-14 (nested XSD, done by #62)
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
