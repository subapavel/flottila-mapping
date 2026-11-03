# The published function catalogue: a closed schema, fidelity as a level with a text, the box id by the helper's signature

Status: accepted (2026-11-03, #71 design, spec #70). Refines ADR-0011 (catalogue members) and ADR-0025.

## Decision

- **Schema.** `contract/function-catalogue.schema.json` is the catalogue's contract (JSON Schema 2020-12, closed as in ADR-0011).
  - The root is keyed by function id, `^[a-z][A-Za-z0-9]{0,63}$`, a subset of the model's names. Input, param and family names use the same pattern.
  - An entry has `family`, `executionKind`, `inputs?`, `params?`, `portable` and `fidelity`. `inputs` and `params` have at least one item when present; `constant` has no inputs.
  - A param is `{name, type: "string", default, values?}` or `{name, type: "table", default: {key: value}}`.
  - Adding a member is a schema change.
  - A test in `engine/mapping` validates the packed catalogue with json-sKema. The JDK-only generator keeps only canonical form and one family per name.
- **Fidelity.** It is `{level: "exact"}`, `{level: "assumed"}` or `{level: "deviation", text}`, where `text` is 1–200 characters.
  - A function is `assumed` while one of its corpus cases has `provenance: assumed`; a test checks this against the corpus.
  - The case, not the catalogue, names the observation request that decides it.
- **Endpoint.** `GET /api/catalogue` answers the packed catalogue bytes as `application/json` (ADR-0015). No ETag is set: the catalogue changes only with the build.
  - `EngineFacade.catalogue()` serves the bytes.
  - The OpenAPI response refers to the schema.
  - `ui/src/generated` gains the catalogue type.
  - The UI gets no client method until spec 5 (editor).
- **The box in data errors (F-19).**
  - A `po:` function that can raise a data error declares `box` as its last `xsl:param` and raises through `po:data-error($code, $box, $message)` in `core.xsl`.
  - The exporter reads the helper module's signatures once and appends the FunCall's origin exactly where the declaration ends in `box`. There is no list of names and no IR change.
  - Both back ends start the message with `the function box <id>: `.
  - A single-value binding receives the box as well. #71 widens `SingleValueLibrary`'s binder before the family tickets use it.

## Considered options

- **Fidelity as a string with a sibling `deviation`**: rejected. "A text only with a deviation" needs `if/then`, and the generated types would lose it.
- **The box id on every `po:` function**: rejected. ADR-0025 asks for it only on a function "that can raise one", and the other functions would carry dead params.
- **A list of raising names in the exporter, or a catalogue `raises` member**: rejected. The first is a central list (F-15); the back ends never read the catalogue.
- **The box id as a trailing IR `Literal`**: rejected. It breaks ADR-0025's args contract, and `FunCall` already has an `origin`.
- **Keeping the old arity beside the new one**: rejected. The generator refuses a second declaration with the same name.
- **Validation in the generator, or an ETag**: rejected. The generator would need a JSON Schema library, and no client makes conditional requests.

## Consequences

- The exports, the wire and the UI types carry these shapes. Renaming `box`, a level or the message prefix is a contract change.
- #71 re-pins the two byte fixtures of #69 once, with this ADR as the reason: the context family gains `fidelity`, and five helper declarations gain `box`. The family tickets that follow keep the new pins green.
- Every context function starts as `assumed`. It becomes `exact` when its last assumed case is observed.
