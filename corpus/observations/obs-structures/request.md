# obs-structures

Notation, what to return and the ESR / CPI naming: `../README.md`.

## Mapping str-choice-1 (source `src-orders.xsd`, target `tgt-choice.xsd`, root `Choice`)

`Choice/Pick` is 1..1 and holds a choice of `A` or `B`; each branch is declared 1..1.

| Box | Function | Inputs |
| --- | --- | --- |
| C1 | `Constant{A}` | none |
| E1 | `equalsS` | in1 = `Orders/Order/Id` with context `Orders`; in2 = C1 |
| X1 | `ifWithoutElse`, Else = SUPPRESS | in1 = E1; in2 = `Orders/Order/Id` with context `Orders` |
| C2 | `Constant{B}` | none |
| E2 | `equalsS` | in1 = `Orders/Order/Id` with context `Orders`; in2 = C2 |
| X2 | `ifWithoutElse`, Else = SUPPRESS | in1 = E2; in2 = `Orders/Order/Id` with context `Orders` |

Target wires: X1 -> `Choice/Pick/A`; X2 -> `Choice/Pick/B`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `ch1.xml` | Id `A`: `A` is written, `B` is SUPPRESS. Does the suppressed branch `B` (declared `minOccurs` 1) raise a shortfall? Assumed: no, a branch of a choice counts as optional. Output `<Pick><A>A</A></Pick>`. Record the error text if PO fails. | ADR-0008 bullet 1 |
| `ch2.xml` | Id `B`: mirror of ch1. | ADR-0008 bullet 1 |
| `ch3.xml` | Id `C`: both branches SUPPRESS. Assumed: no error from either branch, `Pick` is written empty. Record the output or the error. | ADR-0008 bullet 1 |

## Mapping str-choice-2 (same structures)

Only X1 and its chain (C1, E1) are drawn; `Choice/Pick/B` stays unmapped. Target wire: X1 ->
`Choice/Pick/A`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `ch1.xml` | Is an unmapped branch `B` (declared 1..1, inside a choice) a design-time error? Assumed: no, it counts as optional. Record the editor message, if any, and the run output. | ADR-0008 bullet 1 |
| `ch2.xml` | Id `B`, `A` suppressed and `B` unmapped: output `<Pick/>`, or an error? | ADR-0008 bullet 1 |

## Mapping str-nil (source `src-nil.xsd`, root `Nil`; target `tgt-list.xsd`, root `Out`)

`Nil/Item/Val` is 0..1 and `nillable`.

| Box | Function | Inputs |
| --- | --- | --- |
| K0 | `Constant{!}` | none |
| K1 | `concat` | in1 = `Nil/Item/Val` (default context `Item`); in2 = K0 |
| E1 | `exists` | in1 = `Nil/Item/Val` (default context `Item`) |

Target wires: `Nil/Item` -> `Out/Item` (node to node); K1 -> `Out/Item/V`; E1 -> `Out/Item/W`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `nil.xml` | Four items: `<Val>x</Val>`, `<Val xsi:nil="true"/>`, `<Val/>`, no `Val`. Does a nil element read as the empty string? Assumed: item 2 behaves like item 3, `V` = `!` (an empty string value), not like item 4 (no `V`). Assumed output `V`: `x!`, `!`, `!`, none; `W`: `true`, `true`, `true`, `false` (the `exists` result for item 2 is the open part; record it). | ADR-0008 bullet 2 |
| `nil.json` | The same four items as JSON (`"x"`, `null`, `""`, missing key), validated against `nil.schema.json`. Convert with the CPI JSON to XML converter (root element name `Nil`, no namespace) and, on PO 7.5, the REST adapter's JSON to XML conversion (root `Nil`). Run the same mapping on the converted XML. Return the converted XML (before the mapping) and the output. Assumed: `null` reads as the empty string, so `V` = `x!`, `!`, `!`, none. If the converted XML does not use the root `Nil` and the elements `Item` / `Val`, return it unchanged and stop; do not adapt the mapping. | ADR-0008 bullet 2 |
