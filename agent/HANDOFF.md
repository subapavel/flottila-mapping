# Handoff

state: RUNNING — spec #152 "Mapping studio replaces the editor UI" (started 2026-11-09). Integration branch `spec/152-mapping-studio` from main de8314e, tip 5c5332c.
origin: the owner replaced the UI with their prototype (branch `prototype/mapping-studio`, `ui/prototype/mapping-studio/`, scrubbed of company ids). Owner answers: unsupported parts stay preview (mocked), positions stored in the file, our terms, view/edit modes, messages chosen on the Signature tab after create.
tickets: #153 C contract → #154 B shell/list → #155 B overview/signature, #156 B panes → #157 B expression → #158 B test → #159 B functions (preview), #160 B preview features → #161 A remove old editor.
done: #153 4d102c5 · #154 20ad237 · #155 9db8d66 · #156 fe4aa25 · #159 10741ae · #173 b0abf41 · #157 d47eac9 · #158 5c5332c (each ticket gate VERIFIED_PASS, evidence on the issue). Ratchet regen deferred to the spec gate.
in flight: #160 implementer on `t/160-preview-features` from 5c5332c.
preview features: tracked under #162 (#163–#172). Backlog until the Flottila platform model exists: #165, #167, #168, #169, #171.
carried to the spec review: see the #153 evidence comment (Signature tab wording in the contract, fake API vs service, Jackson required members, test shape notes).
carried from #145: owner questions on ADR-0013 (F-29..F-32) and ADR-0012 off-screen links, likely moot under ADR-0028. Retro for spec 5, #135, #145 deferred.
next action: gate and merge #160; then #161 (remove old editor and ?host=dev, port e2e journeys and bench), spec gate, review, PR.
