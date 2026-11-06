# Handoff

state: RUNNING — spec #135 "the editor looks like the chosen prototype", integration branch `spec/135-editor-look` from main 4ad242e (2026-11-06).
spec #135 tickets: #136 skeleton (B, frontier) · #140 diagnostics paths (A, frontier) · #137 trees (B), #138 function editor + inspector (A), #139 Test tab + Model JSON (B), #141 mapping list (A) — all blocked by #136.
spec #135 origin: owner ran spec 5 locally; the look of the prototype (#10, branch prototype/mapping-editor @ 3a5ed86) was never carried into ADR-0012 or spec 5. Owner decisions 2026-11-06: page tabs Editor/Test/Diagnostics/Model JSON, header bar, tree search, Model JSON, mapping list, local paths in diagnostics, screenshots + review as the visual check.
in flight: none yet.
previous: SPEC_DONE — spec 5 (#104) merged in PR #130 (86a3515); Windows case-collision fix #131 in PR #132 (4ad242e). Status comment 6673105155.
spec gate on 7fb5576 VERIFIED_PASS (JMH NOT_RUN, spec 6); ratchet deb5ad8. 20 tickets merged (#105-#117, #121-#127).
review: round 1 FAIL both axes (#104 comment 6683228224) → fixes field-path d0dfe19, keyboard 20a17a8, layout 213cd6c; round 2 spec PASS, standards FAIL on test witnesses → fix/104-tests f478380; round 3 PASS.
open owner questions: #128 (GATE 7 tree p95 at the 60 Hz floor, F-26), #129 (ADR wording for F-27, F-28, stale If-Match lines). Neither blocks spec 5.
next action: run-spec #135 — implementers on #136 and #140; then #137, #138, #139 after #136 merges; #141 last. /retro for spec 5 is deferred by the owner to next week (implementer MEMORY.md over 120 lines).
spec 5 tickets: #105-#117 (editor) and #121-#127 (spec-4 retro process tickets).
grilling (spec 5, 2026-11-05): 26 decisions in 3 rounds, all recommendations accepted. Recorded in ADR-0027 (conditional save with If-Match and 409 mapping-changed, PUT without the header unconditional, no Overwrite; refusals on /api/structures; the compile endpoint with unreachable-box; refresh on open as one undo step; the packed function catalogue committed in contract/). ADR-0027 refines ADR-0008, 0010, 0015, 0024 and 0026 without amending them. GLOSSARY: Palette, Quick insert, Field status, Orphaned target field mapping, Remap, Diagnostics panel, Stale trace, Save conflict.
blocked chain: none
spec 4 (#89): 15 tickets (#86, #87, #90-#100, #102, #103, #118). Spec gate 2 on 44fd349 VERIFIED_PASS except JMH NOT_RUN (spec 6); ratchet add0ca7. Review round 1 FAIL on every axis (comment 6670934613), 3 fix branches; round 2 PASS (comment 6671857589). Carried judgement calls are in those two comments and in the per-ticket evidence comments (#90, #92, #94-#98, #100, #102, #118). Spec 5 owns: /api/structures does not show the array marker (#118).
spec gate note: call `scripts/gate-spec.sh <spec> <pit-modules>` with the modules that have a row in `ratchet/mutation.tsv`; the default list includes engine/udf-api and engine/udf, which hold only module-info.java until spec 7.
dirty worktrees kept (staged index of an older tree, branch already merged; remove with `git worktree remove --force` once checked): agent-a1a89bc1001ee6a42 (t/102), agent-a6dcea9a206253e3c (t/90), agent-abd6711aa59758182 (t/118), agent-abf149608f1607396 (t/92). Worktrees do not survive a session.
observed (2026-11-05): Saxon-HE 12.5 `json-to-xml` keeps number spelling and retains duplicate keys by default (the export passes duplicates: reject); `unparsed-text` raises FOUT1190 for a raw U+FFFE/U+FFFF and drops a leading BOM.
carried: spec-2 items by target spec in #48 comment 6595876651; spec-3 items in #70 comment 6639200141; spec-4 items in #89 comments 6670934613 and 6671857589.
carried from spec 3 (still open): code comments still say "spec 6" for the editor (ui/src/api/client.ts:16, MappingsResource.java:218) · json-sKema undeclared at test scope in service/pom.xml · #83 contract: openapi TraceEntryDto gains {atomic} · #80 run-time truncation to millis (evidence comment 6638545337)
spec 1: merged to main 3bf9747 (#46); carried #21 comment 6582060566. spec 2: merged 86bf5ed (#66); carried #48 comment 6595876651. spec 3: merged 7dcc540 (#84); carried #70 comment 6639200141. spec 4: merged 8052dc1 (#119); carried #89 comments 6670934613, 6671857589.
grilling (#48): ifWithoutElse → spec 3 · no editor change · splitByValue 3 modes · Java sort order
grilling (#48), cont.: the export uses a po-runtime.xsl helper · windows required
findings open: F-20 (divide scale, ADR-0005 amended) · F-13 (gate budget → spec 6) · F-15 (split per family before spec 3) · F-16 (PIT timeouts → spec 6) · F-18 (export laziness → export spec) · F-21 (generating function = single-value result, ADR-0006 amended, closed by wording) · F-22 (single-value calls evaluate every input; ADR-0006 amended) · F-25 (json-sKema all-or-nothing load: JSON walk refusals only after earlier errors are fixed; ADR-0008 note). Closed in spec 4: F-12 (#90), F-23 (#86).
retro (spec 3): trailers checked in the ticket gate (row 2c) · SPEC_DONE handoff rides the spec PR · memory written by the architect from `Worth recording:` blocks · tickets #86 (oracle sweep, erroring inputs) and #87 (mutation ratchet sees one mutant) for spec 4
owner: observation requests #31–#38 · protect main #47 (windows required) · po URI veto · §11 trailers on old commits accepted · no approval prompts: agent packets use no python, single plain commands with `git -C`, no `&&` chains or heredocs (one `bash -c` for a gate), files via Write/Edit, commit messages via Write + `git commit -F`.
owner on Windows: `$env:QUARKUS_HTTP_PORT=8090`, `.\mvnw.cmd -pl service -am quarkus:dev`, `cd ui; npm run dev`.
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 editor · 6 speed · 7 UDFs (owner swapped 5/6, 2026-11-03).
rule (#19): a function ticket carries runtime + export + corpus + differential. Requests never block a spec.
spec gate order: 1, 1b, 2, 5, 4, 3 (ADR-0017, WORKFLOW §6). Merge trailers per WORKFLOW §11. Trailer checks take a range: `scripts/check-trailers.sh origin/<integration>..HEAD`. Gates always in a fresh verify worktree (stale jacoco.exec fails service coverage).
env: JDK 25 /opt/temurin-25 · never `pkill -f` · jqwik banned · Playwright pinned · keep worktrees until the ticket merges · GitHub sometimes rejects a push with "fatal error in commit_refs_rules": retry with backoff, never force.
gh: REST only, `-F body=@file`, Claude Code footer on every comment.
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md · docs/findings/

settings (owner, ac18f47): permissions allow Bash/Read/Edit/Write/WebFetch, deny force push, reset --hard, rm -rf /. Takes effect in a new session.
