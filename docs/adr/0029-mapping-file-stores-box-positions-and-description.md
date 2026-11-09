# The mapping file stores box positions and a description; the engine ignores both

Status: accepted (2026-11-09, owner, spec #152).

This ADR supersedes ADR-0010's "the file holds no editor layout" and its rejected option "Layout in the file". It also supersedes ADR-0012's "positions are browser state only".

## Decision

- `MappingModel` gains an optional `description` (a string of at most 4,000 characters).
- `TargetFieldMapping` gains an optional `layout`:
  - its form is `{ "target": {x, y}?, "boxes": { <authoringId>: {x, y} }? }`;
  - `x` and `y` are integers. The studio rounds before it writes, so a sub-pixel drag never changes the diff.
- A position whose box no longer exists is dropped by the canonical writer. A box without a position is placed by the studio next to its consumer.
- **"Lay Out Mapping"** runs dagre on the selected target field mapping and writes the positions, as one undo step.
- **Opening a file without `layout`** runs the same dagre layout in memory. The working copy is not marked unsaved, so old files stay byte-identical until edited.
- **The engine ignores both fields.** Compile, test and portable export give the same result with or without them. Stage-1 validation accepts them, and stages 2 and 3 do not read them.
- `formatVersion` stays 1. Both fields are optional additions, and no reader outside this repo exists yet.
- **API changes.** `MappingSummary` gains:
  - `package`, the folder of the id;
  - `description`;
  - `source` and `target`, the root element names.

  `CreateMappingRequest` gains an optional `description`.

## Consequences

- A drag is a model edit: it enters undo and marks the mapping unsaved, as in the prototype. Diffs show moved boxes. The owner accepts that cost for a stable layout.
- The Java records, the schema, `gen:types` and `openapi.json` change in one ticket. The contract empty-diff check guards them.

## Considered options

- **Browser-only positions (ADR-0012)**: rejected by the owner. A colleague opening the mapping sees a different picture.
- **A sibling layout file**: rejected. Two files per mapping must move, rename and merge together.
- **formatVersion 2**: rejected for now. That bump is reserved for the semantic additions ADR-0010 lists.
