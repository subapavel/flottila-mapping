# One structure model, normalised at import to fields with effective occurrences

Status: accepted (2026-10-30, grilling #8); amended by F-1 (json-sKema also validates mapping models, ADR-0011)

This ADR records `docs/FOUNDING-ARCHITECTURE.md` §6 ("one structure model with types and
cardinalities, shared by editor and compiler") for milestone 1 and fills its gaps. XSD, WSDL and
JSON Schema load into one model of **fields** only. Model groups disappear at import, because PO's
queues see fields, not groups.

- The module `structure` holds records only and has no dependencies. A `Structure` is a finite
  graph of types. Fields resolve lazily by field path (ADR-0007), so recursion is never
  expanded. `children(path)` returns attributes first, then elements in output order.
- A field has a kind (element, attribute, JSON property), an **effective occurrence**, an
  optional value type, `nillable`, and display data. Display data (facets, default, fixed,
  enumeration, documentation) is shown in the editor and never read by the compiler.
- Effective occurrence is the product of the occurrences of every enclosing particle. A branch
  of a choice with two or more branches has minimum 0. ADR-0006's rules for unmapped fields and
  `TargetSlots(min, max)` use the effective occurrence.
- A value type is one of ADR-0004's seven atomic types, chosen by built-in ancestry or by JSON
  `type`/`format`, and otherwise `xs:string`. A list type is one value, and a union is a string.
- A **structure field** (one with child fields and no value) puts one `""` per occurrence into
  its queue (#2 §1). A **leaf field** puts its value. This corrects ADR-0004:
  `SourceQueue` is `array:join(context ! [field ! ''])` for a structure field, and the export
  uses the same rule.

## XSD

- `sequence` and `all` keep the declared order. The branches of a `choice` become sibling
  fields. `group` and `attributeGroup` references are inlined. An extension gives the base
  content, then its own content. A restriction gives its own content.
- A reference to a substitution-group head becomes a choice of the non-abstract members. The
  members are found transitively and across namespaces, head first and then ordered by QName.
- A recursive path may repeat one type at most 16 times.
- Accepted with no effect:
  - `any`/`anyAttribute`: projection skips them, and they are never written;
  - mixed text;
  - `default` and `fixed`, because PO ignores XSD defaults (#2 §2);
  - an instance `xsi:type`: only the fields of the declared type are read;
  - facets: they are shown, never validated;
  - identity constraints.
- `xsi:nil` reads as `""` and is never written (ADR-0004).
- Refused when the schema loads: `xs:redefine`, `xs:override` and XSD 1.1.

## JSON Schema and WSDL

- JSON Schema is read in draft 2020-12 only. An absent `$schema` counts as 2020-12.
  - Properties keep their declared order, and `required` gives minimum 1.
  - An array property is one repeated field, with `minItems`/`maxItems`.
  - `$ref`/`$defs` resolve through named types.
  - `allOf` merges its subschemas. `oneOf`/`anyOf` give the union of the properties, each with
    minimum 0.
  - A type list `[T, "null"]` marks the field nillable. JSON `null` reads as `""`.
  - `additionalProperties`, `patternProperties`, `if`/`then`/`else` and `not` are ignored.
  - Refused: other drafts, `$dynamicRef`, a root that is not an object, an array of arrays, and
    a merged property with two shapes.
- WSDL 1.1 and 2.0 are read by our own code over `java.xml` DOM. It hands every inline schema to
  the XSD reader.
  - The root is the element of the chosen operation's input, output or fault.
  - Refused: RPC `part@type` and messages with several parts.

## Readers

The module `structure-import` is the only module that uses the reader libraries to read
structures, behind `StructureReader.read(SchemaBundle, RootSelector)`. The mapping-model module
uses json-sKema to validate mapping models (F-1, ADR-0011). XSD uses Apache XmlSchema 2.3.3
(Apache-2.0), and JSON Schema uses json-sKema 0.32.0 (MIT). Loading is offline: references
resolve inside the schema bundle. A namespace-only import resolves to the one bundle file with
that `targetNamespace`. Load errors carry file, line and column.

## JSON as a target

In milestone 1, JSON runs as a source. Its values stay strings in their input spelling: numbers
as written, and booleans as `true`/`false`. A JSON Schema also loads and shows as a target
structure, but compiling a mapping with a JSON target is a design-time error. JSON output is the
first spec after milestone 1. It adds constructor records (object, array, member, scalar) under
`TargetSlots`/`TargetRepeat`, as ADR-0006 allows. That spec must also settle the export, because
Saxon-HE 12.5's `xml-to-json` normalises numbers (`1.50` → `1.5`, observed).

## Refused when a mapping uses the field

These are design-time errors, raised only for a field that a mapping refers to or must create:

- two sibling declarations with the same step;
- in a target:
  - an abstract element type;
  - a repeated group of two or more particles, unless it is a choice of single elements,
    because streamed output cannot interleave it;
  - a path beyond the recursion cap.

## Considered options

- **Model groups as nodes of the tree**: rejected. PO's queues see fields only, and every
  consumer would have to fold the groups itself.
- **A tree expanded to a fixed depth**: rejected. The tree is either too shallow or explodes on
  large schemas.
- **Two models (XML and JSON)**: rejected. Projection and the target walk would exist twice.
- **Declared `minOccurs` for the unmapped rules**: rejected. A mandatory leaf in a choice would
  force mapping every branch.
- **Readers**:
  - Xerces: rejected. It fails on the module path (split packages).
  - XSOM, Eclipse XSD and XMLBeans: rejected for licence, dependency or completeness reasons (#7).
  - WSDL4J (CPL-1.0) and Woden (last release 2015): rejected.
  - everit (drafts 4–7): deferred. It can be added as a second JSON Schema reader behind
    `StructureReader` when a corpus case needs draft-07 or OpenAPI 3.0.

## Consequences

- Changing a reader changes no other module. The fingerprint (ADR-0009) detects when a reader
  upgrade produces a different structure.
- On the module path, json-sKema needs `--add-modules kotlin.stdlib`: observed on Java 25. It
  runs without it on the class path. This is input for #12. FOUNDING §11's single "structure
  import" module becomes `structure` plus `structure-import`.
- OData metadata (FOUNDING §6) is not in milestone 1. It can be added later as another reader.
- Assumed readings until observed cases confirm them (ADR-0002, #14):
  - a branch of a choice counts as optional for the unmapped rules and for `po:MINOCCURS`;
  - `xsi:nil` and JSON `null` read as `""`.
