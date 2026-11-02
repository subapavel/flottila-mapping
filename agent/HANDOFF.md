# Handoff

state: RUNNING — /run-spec #21 "Walking skeleton"
spec: #21 · integration branch: spec/21-walking-skeleton · merged: #22, #23, #24, #25, #40 (ff0f7a7), #26 (741a58f), #27 (8707c1e) · in flight: #28 (implementer on t/28-service, red at 20965c9; test-author worktree removed, a fix round needs a fresh one) · owner: #31–#38 observation requests · #39 ruled 1 (per-package npm exceptions, ADR-0017; done by #40)
closed (map #1): #2–#20 — decisions indexed on the map; specs and post-M1 order in docs/GATE.md "Specs in build order"
next exact action (architect): resume /run-spec #21 — reconcile in-flight tickets against spec/21-walking-skeleton, then fill the frontier
spec 1 decisions (#21): full formatVersion 1 schema, other box kinds → `unsupported-box-kind`; flat XSD with one required field; observation kit ticket + 6–8 grouped requests; `po-owner-local` in spec 5; owner protects main after first green CI; empty udf modules with PIT `failWhenNoMutations=false`; `PW_CHROMIUM_EXECUTABLE`; 4 seams
tickets (#21): #22 skeleton A · #23 observation kit A · #24 model format C · #25 flat XSD B · #26 compile+run C corpus · #27 export C differential · #28 service C · #29 editor B · #30 @stack A
carried to spec review (#24): 3-cycle test, SCC with two cycles, per-member map list in SchemaStage.check, non-string param types
carried to spec review (F-12, spec 4/2): reference resolver port, package-ref code, schema-unreadable absolute path, 10 s test timeout
carried to spec review (#27): XsltExporter:170 empty-element side unreached; end-tag javadoc wording; `misplaced` origin via toString; attribute() leaves tab/CR/LF in a URI; output prefix colliding with xs/po/s0
carried to spec review (#26): untested target `orphaned-reference`; no run with unreached non-source boxes; ns0 without root namespace unpinned; slot-loop interrupt test does not assert an early stop; QueueBlockTest witness weak; XmlSerializer:148 unreached; 19 PIT survivors in #24 code
merge trailers: use WORKFLOW §11 (`Ticket: #n`, Co-authored-by, `Signed-off-by: subapavel <subapav@gmail.com>`); #40 and #26 merges lack them (recorded on #26)
spec order: 1 walking skeleton · 2 queues + node functions · 3 standard functions · 4 structures · 5 speed · 6 editor · 7 UDFs
rule (#19): a function ticket carries runtime + export + corpus + differential cases; no export spec; requests never block a spec
after M1: JSON output → bytecode tier → formatVersion 2 + PO importer → XSLT front end
owner action (from spec 1): answer observation requests on PO 7.5 + CPI; /gate waits for them (checks 4, 6)
PO importer: ADR-0010 table; `formatVersion` 2 (shared box output, `switchedOff`, `ext_bind`, output ports); CPI reopens with `.mmap`
saxon: oracle pinned to Saxon-HE 12.5 (ADR-0005, ADR-0018); s9api and XMLUnit facts in agent/NOTES.md "Oracle and ratchet trial for #14"
owner rules: grill from docs/FOUNDING-ARCHITECTURE.md, gaps only; one question at a time, Czech chat, English artefacts
owner rules: real mappings only via the owner locally (iFlow-forge)
env: setup.sh v3 in the cloud env (JDK 25 /opt/temurin-25, Google mirror in ~/.m2, MVNW_REPOURL); never `pkill -f`; jqwik banned (ADR-0018)
gh: REST only, multi-line bodies with `-F body=@file`; every comment ends with the Claude Code footer
pointers: CLAUDE.md · AGENTS.md · docs/GATE.md · docs/FOUNDING-ARCHITECTURE.md · docs/WORKFLOW.md · docs/agents/issue-tracker.md · agent/NOTES.md
