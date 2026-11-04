# obs-boolean

Notation, what to return and the ESR / CPI naming: `../README.md`. Source of all mappings:
`src-orders.xsd` (root `Orders`). Target of all mappings: `tgt-list.xsd` (root `Out`). The one
request of the boolean family (spec #70, #77). Every mapping maps F1 -> `Out/All`; S1 is
`Orders/Order/Line/Sku`, S2 `Orders/Order/Line/Qty` and S3 `Orders/Order/Tag`, all with context
`Orders`, so All has one value per Line. One run of an input answers every case that names it.
Each case id is a directory under `corpus/cases/`. The open question of the whole family: is
only the exact text `true` true, and are results written `true` / `false`? Assumed: yes. Return
what PO writes if it differs (for example `TRUE`, `1` or the empty string read as true, or a
result written `1` / `0`). `ifWithoutElse` is in `obs-ifwithoutelse` (#35), not here.

## Mapping boolean-and

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| S2 | source | `Orders/Order/Line/Qty` with context `Orders` |
| F1 | `and` | in1 = S1, in2 = S2 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/and/001` | `and-001.xml` | Lines (Sku, Qty): (true, true), (true, false), (TRUE, true), (empty, true), (1, 1). Assumed All: `true`, `false`, `false`, `false`, `false`: only the exact text `true` is true, so `TRUE` and `1` are false. |

## Mapping boolean-or

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| S2 | source | `Orders/Order/Line/Qty` with context `Orders` |
| F1 | `or` | in1 = S1, in2 = S2 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/or/001` | `or-001.xml` | Lines: (true, true), (false, true), (false, false), (TRUE, 1), (empty, true). Assumed All: `true`, `true`, `false`, `false`, `true`. The fourth line decides whether `TRUE` or `1` counts as true in `or`. |

## Mapping boolean-not

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| F1 | `not` | in1 = S1 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/not/001` | `not-001.xml` | Lines: true, false, TRUE, 1, empty. Assumed All: `false`, `true`, `true`, `true`, `true`: anything but the exact text `true` is false, so `not` of it is true. If PO reads `TRUE` or `1` as true, `not` gives `false` there. |

## Mapping boolean-equals

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| S2 | source | `Orders/Order/Line/Qty` with context `Orders` |
| F1 | `equals` | in1 = S1, in2 = S2 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/equals/001` | `equals-001.xml` | Lines: (keep, keep), (keep, Keep), (empty, empty), (a, empty), (1, 1.0). Assumed All: `true`, `false`, `true`, `false`, `false`: the values are compared as case-sensitive text, so `1` and `1.0` differ. If PO compares numbers as numbers, the last is `true`. |

## Mapping boolean-notEquals

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| S2 | source | `Orders/Order/Line/Qty` with context `Orders` |
| F1 | `notEquals` | in1 = S1, in2 = S2 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/notEquals/001` | `notEquals-001.xml` | The same lines as equals. Assumed All: `false`, `true`, `false`, `true`, `true`, the negation of `equals`. |

## Mapping boolean-if

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| S2 | source | `Orders/Order/Line/Qty` with context `Orders` |
| S3 | source | `Orders/Order/Tag` with context `Orders` |
| F1 | `if` | in1 = S1 (condition), in2 = S2 (then), in3 = S3 (else) |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/if/001` | `if-001.xml` | Lines (Sku, Qty) with Tags e1 to e4 in the order: (true, q1), (false, q2), (TRUE, q3), (empty, q4). Assumed All: `q1`, `e2`, `e3`, `e4`: the then value only for the exact text `true`. |

## Mapping boolean-isNil

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| F1 | `isNil` | in1 = S1 |

Target wire: F1 -> `Out/All`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/isNil/001` | `isNil-001.xml` | Four lines: `x`, `<Sku xsi:nil="true"/>`, `<Sku></Sku>`, `<Sku> </Sku>` (a space). Assumed All: `false`, `true`, `true`, `false`. Our engine reads `xsi:nil` as the empty string (ADR-0008, `obs-structures` nil.xml), so it cannot tell a nil field from an empty one. If PO gives `false` for the empty element, or `false` for the nil field, return both results. |
