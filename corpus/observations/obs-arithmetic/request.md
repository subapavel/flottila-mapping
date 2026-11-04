# obs-arithmetic

Notation, what to return and the ESR / CPI naming: `../README.md`. Source: `src-orders.xsd` (root
`Orders`). Target: `tgt-list.xsd` (root `Out`). The one request of the arithmetic family (spec #70).

## Mapping arith-inv

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Qty` with context `Orders` |
| A1 | `inv` | in1 = S1 |

Target wire: A1 -> `Out/All`.

The assumed reading is that `inv` is 1 divided by the value (ADR-0005's division rule); the other
reading is the sign change (the value times -1). Return the output, per input.

| Case | Input | Question it decides |
| --- | --- | --- |
| `fn/inv/001` | `i1.xml` | Qty is 4, 3, -2, 0.5, one `Line` each. 1 divided by the value is 0.25, 0.333333333333333333 (or PO's own text for 1/3), -0.5, 2; a sign change would give -4, -3, 2, -0.5. |
