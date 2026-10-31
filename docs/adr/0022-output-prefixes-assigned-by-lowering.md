# Output prefixes are assigned by lowering from the target structure's namespaces

Status: accepted (2026-10-31, #26 design)

The structure keeps no prefixes (ADR-0007), but our runtime and the exported XSLT must write
byte-identical prefixes for `checkForIdentical` (ADR-0018). Someone has to choose them.

- Lowering assigns prefixes and carries them in the IR's element constructors:
  - the target root's namespace is `ns0`;
  - each further namespace gets `ns1`, `ns2` … in target field order;
  - a name without a namespace has no prefix;
  - no default namespace is ever declared.
- The serializer declares a binding on the first element that needs it and never invents one.
- Output starts with `<?xml version="1.0" encoding="UTF-8"?>`, has no indentation and no trailing
  newline, and is UTF-8. In text, `&`, `<` and `>` are escaped and CR is written `&#13;`.
- The exporter emits the same prefixes.

## Considered options

- **A default namespace**: rejected. A schema without `elementFormDefault`, like
  `corpus/structures/skeleton/order.xsd`, has unqualified children, which would need `xmlns=""`.
- **Prefixes from the schema files**: rejected. Import loses them, and the files of a bundle may
  disagree.
- **Prefixes chosen by the serializer**: rejected. Every back end, including the XSLT export and
  the bytecode tier, would have to copy its choice.

## Consequences

- This binds the serializer, the exporter and the bytecode tier.
- `ns0` matches PO's output for a single namespace. With two or more namespaces it is an assumed
  reading until an observed case confirms it.
