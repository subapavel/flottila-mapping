# Prompt: act on findings F-23 and F-24 (owner observation #31, spec-2 part)

You are the architect (AGENTS.md). Read `CLAUDE.md`, `AGENTS.md`, `docs/WORKFLOW.md` §7 and the
two findings before anything else.

## State

- Branch `claude/sharp-hypatia-hkhf88` (based on `main` a1572bb, pushed, **not merged**) holds:
  - the owner's PO 7.5 / CPI outputs for the spec-2 part of `obs-target-creation`
    (`corpus/observations/obs-target-creation/{po75,cpi}/`, `probes/`, `meta.json` notes);
  - the draft findings `docs/findings/F-23.md` and `docs/findings/F-24.md`.
- Issue #31 is closed; its last comment summarises the results. PO 7.5 and CPI agree on every run.
- Precedent: the first part of #31 produced F-17 (accepted on the spec-2 integration branch,
  ADR-0004 and GLOSSARY amended in 30507ea, cases and fix in #64). Follow the same path.

## What to do

1. Get the branch into the current integration branch (or `main`) the usual way (merger, or a PR
   if the owner asks for one). Keep the owner's output files byte-for-byte; they are evidence.
2. **F-23 — `createIf` boolean cast.** Observed: `true`/`1` create, `false`/`0` give SUPPRESS (any
   case); `""`, `no`, `skip` end the run with "Cannot cast ... to boolean" on both systems.
   ADR-0006 assumes SUPPRESS for those, and `engine/xdm/.../ContextFunctions.createIf` implements
   that assumption.
   - Accept the finding: fix the status line, amend ADR-0006's assumed truth rule in the same merge
     as the fix (WORKFLOW §7), and choose the error code for a value that is not a boolean.
   - Correct the case inputs `max-002.xml`, `a2.xml` (its spec-2 use) and `suppress-001.xml`
     (`false` in place of `no` / `skip`) and their cases: probe-bool-b answers `target/max/002`,
     probe-bool-d answers `target/suppress/001`, a2 of create-a answers `target/minOccurs/002`.
     Add a case for the cast error itself (probe-bool-c, `""`).
   - Open the fix ticket (class by AGENTS.md; `oracle:corpus` if the cases are the red). It starts
     red from those cases. Never weaken an existing case to go green.
   - Do not assume the other boolean functions behave the same: list them in the ADR as open, or
     ask the owner for an observation.
3. **F-24 — a missing context for a mandatory child reuses the last value.** Do **not** change the
   `min` rule yet: the two runs (minOccurs-004 vs d1) do not separate the readings.
   - Open an owner observation request (`owner: observation request ...`, `ready-for-human`, same
     shape as #31) for the follow-up F-24 proposes: the spec2-nested-grp-row-remove-contexts
     mapping with `Row` 0..2 and with `Row` 2..2 (new synthetic target XSDs), input
     `minOccurs-004.xml`, plus one input where the queue has fewer contexts and the last context is
     empty. State the question each run decides.
   - Mark `target/minOccurs/004` as contradicted by the observation in its case (not `observed`
     until the rule is known), and link F-24 to the new request.
4. Side observation (no finding yet): a complex target node with a mapped value and no mapped
   child gets the value as text (`<Row>a</Row>`). Note it where target creation is documented, or
   in the new observation request.

## Rules that bind this work

- Red before green; evidence words only; no hand edits in `ratchet/`.
- The owner is not available for PO/CPI runs in this session; anything that needs PO goes into
  an observation request, not a guess.
- Hand back at most 40 lines: issues opened, ADR changes, branches, evidence.
