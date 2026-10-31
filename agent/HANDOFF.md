# Handoff

state: SPEC_1_SPECIFIED — spec #21 "Walking skeleton" published (grilled 2026-10-31); no tickets yet
spec: #21 · integration branch: none yet · tickets in flight: none
closed (map #1): #2–#20 — decisions indexed on the map; specs and post-M1 order in docs/GATE.md "Specs in build order"
next exact action (architect + owner): `/to-tickets` for #21 — owner approves the breakdown and the `obs-id` list of the observation kit
spec 1 decisions (#21): full formatVersion 1 schema, other box kinds → `unsupported-box-kind`; flat XSD with one required field; observation kit ticket + 6–8 grouped requests; `po-owner-local` in spec 5; owner protects main after first green CI; empty udf modules with PIT `failWhenNoMutations=false`; `PW_CHROMIUM_EXECUTABLE`; 4 seams
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
