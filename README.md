# Flottila Mapping

Open-source mapping engine and editor for enterprise integration. Draw a mapping between two
message structures the way SAP PO graphical mappings work — queues, contexts, standard functions,
Java UDFs — and run it compiled on Java 25. One intermediate representation will also carry
XSLT 3.0 / XPath 3.1, so a drawn mapping exports to readable XSLT and a stylesheet runs on the
same engine. The editor is React + PatternFly.

Status: **Milestone 1 — spec 1 (walking skeleton) built: one field link from the editor through
the engine, the service and the XSLT export.** See `docs/wayfinder/phase-0-map.md` and
`docs/GATE.md` (milestone 1).

Built AI-first: agents write the code under the rules in `CLAUDE.md`, `AGENTS.md` and
`docs/WORKFLOW.md`; work is tracked in GitHub Issues.

Licence: Apache 2.0 (`LICENSE`). Third-party notices: `NOTICE`.
