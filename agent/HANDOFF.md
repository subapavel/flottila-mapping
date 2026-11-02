# Handoff

state: RUNNING — /run-spec #48 "Spec 2: queues, contexts and node functions" · integration branch spec/48-queues-node-functions (from main 3bf9747)
tickets (#48): #49 housekeeping B · #50 removeContexts tracer C · #51 SUPPRESS+Lift C · #52 target fields C · #53 trace C · #54 service B
tickets (#48): #55 splitByValue B · #56 collapseContexts+useOneAsMany B · #57 exists+mapWithDefault B · #58 formatByExample B · #59 sort B · #60 editor e2e A · #61 obs requests A
in flight: #49 implementer (t/49-housekeeping) · #50 designer · #54 implementer (t/54-service)
next action: take hand-backs in arrival order (run-spec §2); refill slots from the frontier.
spec 1: merged to main 3bf9747 (#46). Carried items are listed in the #21 comment 6582060566; the spec-2 lines are in #48.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order, the export uses a po-runtime.xsl helper · windows required.
findings open: F-12 (resolver port → spec 4; timeout → #54), F-13 (gate budget → spec 5).
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 speed · 6 editor · 7 UDFs.
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11.
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/
