# Handoff

state: RUNNING — spec #152 "Mapping studio replaces the editor UI" (2026-11-09). Integration branch `spec/152-mapping-studio` from main de8314e.
origin: the owner replaced the UI with their prototype (branch `prototype/mapping-studio`, `ui/prototype/mapping-studio/`, scrubbed of company ids). Owner answers: unsupported parts stay mocked (preview), positions stored in the file, our terms, view/edit modes. ADR-0028, ADR-0029, glossary on the integration branch.
tickets: #153 C contract → #154 B shell/list → #155 B overview/signature, #156 B panes → #157 B expression → #158 B test → #159 B functions (preview), #160 B preview features → #161 A remove old editor.
in flight: #153 designer.
carried from #145: owner questions on ADR-0013 (F-29..F-32) and ADR-0012 off-screen links, likely moot under ADR-0028. Retro for spec 5, #135, #145 deferred.
next action: approve the #153 design, then test-author on `t/153-contract-layout`.
