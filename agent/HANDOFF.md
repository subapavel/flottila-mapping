# Handoff

state: RUNNING — spec #152 "Mapping studio replaces the editor UI" (started 2026-11-09). Integration branch `spec/152-mapping-studio` from main de8314e, tip 4d102c5.
origin: the owner replaced the UI with their prototype (branch `prototype/mapping-studio`, `ui/prototype/mapping-studio/`, scrubbed of company ids). Owner answers: unsupported parts stay preview (mocked), positions stored in the file, our terms, view/edit modes, messages chosen on the Signature tab after create.
tickets: #153 C contract → #154 B shell/list → #155 B overview/signature, #156 B panes → #157 B expression → #158 B test → #159 B functions (preview), #160 B preview features → #161 A remove old editor.
done: #153 merged 4d102c5 (gate VERIFIED_PASS on ea67939; review round 2 PASS). Ratchet regen ENVIRONMENT_BLOCKED (needs full build + PIT); the spec gate regenerates it.
in flight: #154 implementer on `t/154-studio-shell` from 4d102c5.
preview features: tracked under #162 (#163–#172). Backlog until the Flottila platform model exists: #165, #167, #168, #169, #171.
carried to the spec review: see the #153 evidence comment (Signature tab wording in the contract, fake API vs service, Jackson required members, test shape notes).
carried from #145: owner questions on ADR-0013 (F-29..F-32) and ADR-0012 off-screen links, likely moot under ADR-0028. Retro for spec 5, #135, #145 deferred.
next action: gate #154 when it hands back; #155 and #156 start once #154 merges.
