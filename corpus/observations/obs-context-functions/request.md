# obs-context-functions

Notation, what to return and the ESR / CPI naming: `../README.md`. Source of all mappings:
`src-orders.xsd` (root `Orders`). Target of all mappings: `tgt-list.xsd` (root `Out`). Where a
mapping says `Orders/Order` -> `Out/Item` (node to node), `Item` *i* is order *i* and the queue of
`V` belongs to it by context. Where a target is `Out/All`, nothing else is mapped and the whole
result lands under the single root context.

## Mapping ctx-1: `removeContexts` and empty contexts

| Box | Function | Inputs |
| --- | --- | --- |
| R1 | `removeContexts` | in1 = `Orders/Order/Line/Sku` (default context `Line`) |

Target wire: R1 -> `Out/All`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f1.xml` | o1: Sku a. o2: a `Line` with no `Sku` (empty context). o3: no `Line` (empty context at order level). o4: `<Sku/>` (the empty string as a value). o5: Sku b. Does `removeContexts` drop empty contexts? Assumed: `All` = `a`, empty (from o4), `b`. If empty contexts were kept as empty strings there are more empty `All`. | #2 §7.6 |

## Mapping ctx-2: `mapWithDefault` on a SUPPRESS-only context

| Box | Function | Inputs |
| --- | --- | --- |
| C1 | `Constant{0}` | none |
| G1 | `greater` | in1 = `Orders/Order/Line/Qty` with context `Order`; in2 = C1 |
| X1 | `ifWithoutElse`, Else = SUPPRESS | in1 = G1; in2 = `Orders/Order/Line/Qty` with context `Order` |
| M1 | `mapWithDefault{default=D}` | in1 = X1 |

Target wires: `Orders/Order` -> `Out/Item`; M1 -> `Out/Item/V`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f2.xml` | o1: Qty 5 (X1 = `5`). o2: Qty 0 (X1 = a context holding only SUPPRESS). o3: no line (a truly empty context). o4: Qty 0, 3 (X1 = `SUPPRESS,3`). Is a SUPPRESS-only context empty for `mapWithDefault`? No assumed result is fixed: either `V` = `D` in `Item` 2 (counts as empty) or none (does not). Expected for o1 `5`, o3 `D` (SAP), o4 `3`. | #2 §7.6 |

## Mapping ctx-3: `SplitByValue` modes (three variants of one mapping)

| Box | Function | Inputs |
| --- | --- | --- |
| R1 | `removeContexts` | in1 = `Orders/Order/Tag` |
| S1 | `SplitByValue{mode}` | in1 = R1 |
| CC | `collapseContexts` | in1 = S1 |
| R2 | `removeContexts` | in1 = `Orders/Order/Tag` |
| S2 | `SplitByValue{mode}` | in1 = R2 |

Target wires: CC -> `Out/Item`; S2 -> `Out/Item/V`. Variants: `ctx-3-each` (mode Each Value),
`ctx-3-change` (mode Value Change), `ctx-3-empty` (the mode that splits at a tag without a
value). The mode labels are not confirmed on SAP pages (#2 §4): list the labels PO 7.5 and CPI
offer, run every one that exists, and name the variant after its label.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f3.xml` | One order, tags `a`, `a`, `<Tag/>`, `b`, `<Tag/>`. Per mode: how many `Item`, which values in each `V`? In particular, where does the "tag without a value" mode cut: after each `<Tag/>`, and does `<Tag/>` count as a tag without a value? No assumed result; this fixes the meaning. | #2 §7.6 |

## Mapping ctx-4: `exists`

| Box | Function | Inputs |
| --- | --- | --- |
| E1 | `exists` | in1 = `Orders/Order/Line/Sku` with context `Order` |

Target wires: `Orders/Order` -> `Out/Item`; E1 -> `Out/Item/V`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f4.xml` | o1: two lines with Sku a, b. o2: one line without `Sku`. o3: no line. o4: `<Sku/>`. Per value or per context? Candidate: o1 `true`,`true`; o2 `false`; o3 `false`; o4 `true` (per value, false for an empty context, as in the `mapWithDefault` equivalence). Per context would give one `true` for o1. Record the exact output. | #2 §7.7 |

## Mapping ctx-5: `collapseContexts`, first or last value

| Box | Function | Inputs |
| --- | --- | --- |
| CC | `collapseContexts` | in1 = `Orders/Order/Line/Qty` with context `Order` |

Target wires: `Orders/Order` -> `Out/Item`; CC -> `Out/Item/V`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f5.xml` | The SAP figure queue `3,2 \| 10,11,43,2 \| 7` plus an order without lines. The text says the first value (`3`, `10`, `7`), the figure shows the last (`2`, `2`, `7`). Assumed: first value. o4 (empty context): assumed empty string (SAP: empty contexts are replaced by empty strings). | #2 §7.16, §7.6 |

## Mapping ctx-6a: `removeContexts` and SUPPRESS

| Box | Function | Inputs |
| --- | --- | --- |
| C1 | `Constant{0}` | none |
| G1 | `greater` | in1 = `Orders/Order/Line/Qty` (default context `Line`); in2 = C1 |
| X1 | `ifWithoutElse`, Else = SUPPRESS | in1 = G1; in2 = `Orders/Order/Line/Qty` (default context `Line`) |
| R1 | `removeContexts` | in1 = X1 |
| R2 | `removeContexts` | in1 = `Orders/Order/Tag` |
| K1 | `concat` | in1 = R1; in2 = R2 |

Target wire: K1 -> `Out/All`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f6.xml` | Lines (a,5), (b,0), (c,7), tags t1,t2,t3. X1 is `5 \| SUPPRESS \| 7`. Does `removeContexts` keep SUPPRESS? Kept: `All` = `5t1`, `7t3`. Dropped: `5t1`, `7t2`, `7t3`. No assumed result (community sources conflict). | #2 §7.4 |

## Mapping ctx-6b: `collapseContexts` and SUPPRESS

Boxes C2, G2, X2 as C1, G1, X1 above, plus CC = `collapseContexts` with in1 = X2.
Target wire: CC -> `Out/All`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `f6.xml` | Same input. X2 is `5 \| SUPPRESS \| 7` (three contexts). SAP says SUPPRESS becomes an empty string: `All` = `5`, empty, `7`. If SUPPRESS were dropped: `5`, `7`. | #2 §7.4 |
