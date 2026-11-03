# Handoff

state: SPEC_DONE — spec 2 #48 merged to main 86bf5ed (PR #66)
integration branch: none (spec/48-queues-node-functions merged)
merged: spec 2, tickets #49–#65, review rounds 1–2, ratchet 0f6dca8
in flight: none
blocked chain: none
carried: spec-2 items by target spec in #48 comment 6595876651
next action: owner — /retro on spec 2; then spec 3 (standard functions): F-15 prefactor (split registries per family) first, then /to-spec.
spec 1: merged to main 3bf9747 (#46); carried #21 comment 6582060566. spec 2: merged 86bf5ed (#66); carried #48 comment 6595876651.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-12 (resolver port → spec 4) · F-13 (gate budget → spec 5) · F-15 (split per family before spec 3) · F-16 (PIT timeouts → spec 5) · F-18 (export laziness → export spec)
retro: the ticket gate runs no PIT, so mutation drops surface only at the ratchet regen (#62)
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 speed · 6 editor · 7 UDFs.
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11.
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/
