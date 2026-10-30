# A mapping stores its schema bundle; the structure is re-derived and guarded by a fingerprint

Status: accepted (2026-10-30, grilling #8)

A mapping stores three things for each side:

- the **schema bundle**: the XSD, WSDL or JSON Schema files the structure was read from,
  verbatim;
- the **root selector**: an XML root element, a WSDL operation with its direction (and fault),
  or the JSON root;
- a **fingerprint**: SHA-256 over a canonical form of exactly what the compiler reads. That is
  the field paths, kinds, effective occurrences, value types and order. It leaves out display
  data, prefixes and whitespace.

Compiling at deploy re-reads the stored bundle and never a live schema, so a deploy is
reproducible. A fingerprint mismatch means a reader change produced a different structure. It
is a design-time error, and the author re-opens and re-saves the mapping.

Re-importing a new schema version compares the two structures by field path (ADR-0007):

- A path that is gone becomes an **orphaned reference**. It stays in the mapping model and the
  editor marks it. Compiling raises a design-time error with the `AuthoringId` of the box that
  uses it.
- A changed occurrence or value type is a warning.

How the bundle sits inside the mapping model (inline, side files or by hash) is decided by #6.

## Considered options

- **Reading the live schema at compile time**: rejected. Deploys would not be reproducible, and
  a schema edit would silently change running mappings.
- **Persisting the normalised structure as a snapshot**: rejected. It is a second format to
  version, and it would hide reader changes instead of detecting them.
