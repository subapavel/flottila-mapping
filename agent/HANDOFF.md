# Handoff

state: SPEC PR OPEN. Spec #21 "Walking skeleton" goes to main through the spec PR from `spec/21-walking-skeleton`, merge commit only.
tickets (#21), all closed: #22–#30, #40, #41, review fixes, #42 Windows build, #43 dev port, #44 Windows ids, #45 Swagger $ref.
spec gate: VERIFIED_PASS @68c81fc, ratchet 4c954c4. #42–#45 merged after it, each with a green ticket gate. jmh is NOT_RUN (no harness until spec 5).
next action: watch spec-PR CI, including the first `windows` job. When it is green, merge, open "owner: protect main", and cut spec 2 (/to-spec).
carried out of spec 1, by spec: #21 comment 6582060566. Each spec picks up its lines when it is cut.
findings open: F-12 (resolver port, timeout → spec 4/2), F-13 (gate budget missed → spec 5).
owner: observation requests #31–#38 open (GATE checks 4, 6). Owner may veto the po URI. §11 trailers missing on old commits, accepted unless vetoed.
owner tries spec 1 on Windows: `$env:QUARKUS_HTTP_PORT=8090` (Docker holds 8080), `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 speed · 6 editor · 7 UDFs.
rule (#19): a function ticket carries runtime + export + corpus + differential cases. There is no export spec. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3. Step 3's `clean` deletes the reports regen needs (ADR-0017, WORKFLOW §6).
merge trailers: WORKFLOW §11 (`Ticket: #n`, Co-authored-by, `Signed-off-by: subapavel <subapav@gmail.com>`, Claude-Session).
after M1: JSON output → bytecode tier → formatVersion 2 + PO importer → XSLT front end.
owner rules: grill from FOUNDING-ARCHITECTURE, gaps only. One question at a time. Czech chat, English artefacts. Real mappings only via the owner.
env: JDK 25 /opt/temurin-25. Never `pkill -f`. jqwik banned. Playwright pinned, never `playwright install`. Keep worktrees until the ticket merges.
gh: REST only, multi-line bodies with `-F body=@file`. Every comment ends with the Claude Code footer.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/
