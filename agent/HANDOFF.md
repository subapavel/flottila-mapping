# Handoff

state: RUNNING — spec #181 "Speed" (milestone 1, spec 6; started 2026-11-10). Integration branch `spec/181-speed` from main a5ceafd.
origin: grilling 2026-11-10, two rounds via the `grilling-adviser` (record on #181). Owner: tree target p95 < 33.3 ms (#128); heap proved in a separate 128 MB fork; measure first, optimise only misses; F-13/F-16 out of spec 6; HANDOVER with Linux `./mvnw` and unverified PowerShell `mvn`.
tickets: #182 A docs · #183 B jar + orders small (tracer) · #184 B step-5 judgement → #185 B orders large (←183) → #186 B wide, #187 B contexts (←185) · #188 A tree p95 (←184) → #189 A first measurement (←184,186,187,188) → #190 A HANDOVER (←189). Optimisation tickets only after #189.
done: none.
in flight: see the #181 status comment.
after #183: the architect opens the optional `po-owner-local` observation request (ADR-0021).
before: PR #179 (grilling-adviser) and PR #180 (#177 Display Queue) merged.
rule (owner, 2026-11-10): every grilling round goes through the `grilling-adviser` (Fable 5.2) before the owner (`AGENTS.md`).
next action: architect — `/run-spec 181`: fill the writer slots from the frontier (#182, #183, #184). Retro for spec 5, #135, #145, #152 deferred.
