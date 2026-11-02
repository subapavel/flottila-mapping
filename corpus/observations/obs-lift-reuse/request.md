# obs-lift-reuse

Notation, what to return and the ESR / CPI naming: `../README.md`. Source of all mappings:
`src-orders.xsd` (root `Orders`). Target of all mappings: `tgt-list.xsd` (root `Out`). In every
mapping `Orders/Order` -> `Out/Item` (node to node), so `Item` *i* is order *i* and the queue
of `V` (or `W`) belongs to it by context.

## Mapping lift-1: reuse and empty contexts

| Box | Function | Inputs |
| --- | --- | --- |
| L1 | `concat` | in1 = `Orders/Order/Tag` (default context `Order`); in2 = `Orders/Order/Line/Sku` with context `Order` |

Target wires: L1 -> `Out/Item/V`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `l1.xml` | Five orders; read `V` per `Item`. o1: Tag t1,t2 and Sku s1 (last value reused inside the context): assumed `t1s1`, `t2s1`. o2: no Tag, Sku s2,s3 (one input has an empty context): assumed no `V`. o3: Tag t3, no Line (the other input empty): assumed no `V`. o4: Tag t4,t5,t6 and Sku s4,s5: assumed `t4s4`, `t5s5`, `t6s5`. o5: `<Tag/>` (a value that is the empty string) and Sku s6: assumed `s6`, not an empty context. | ADR-0006 bullet 1; #2 §7.3 |

## Mapping lift-2: SUPPRESS in a Lift input

Boxes of the X chain (drawn twice, as X1 and X2; no box is shared):

| Box | Function | Inputs |
| --- | --- | --- |
| C1 | `Constant{0}` | none |
| G1 | `greater` | in1 = `Orders/Order/Line/Qty` with context `Order`; in2 = C1 |
| X1 | `ifWithoutElse`, parameter Else = SUPPRESS (the "Keep SUPPRESS Values" choice; record the label PO 7.5 shows) | in1 = G1; in2 = `Orders/Order/Line/Qty` with context `Order` |
| K1 | `concat` | in1 = `Orders/Order/Line/Sku` with context `Order`; in2 = X1 |
| K2 | `concat` | in1 = K1; in2 = `Orders/Order/Tag` (default context `Order`) |
| C2 | `Constant{0}` | none |
| G2 | `greater` | in1 = `Orders/Order/Line/Qty` with context `Order`; in2 = C2 |
| X2 | `ifWithoutElse`, Else = SUPPRESS | in1 = G2; in2 = `Orders/Order/Line/Sku` with context `Order` |
| U1 | `toUpperCase` | in1 = X2 |

Target wires: K2 -> `Out/Item/V`; U1 -> `Out/Item/W`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `l2.xml` | One order, lines (a,5), (b,0), (c,7), tags t1,t2,t3. X1 is `5,SUPPRESS,7`. `K1` is `a5,SUPPRESS,c7`; K2 gives SUPPRESS in slot 2 and consumes `t2`. Assumed `V`: `a5t1`, `c7t3` (if SUPPRESS did not consume the other input: `a5t1`, `c7t2`). `W` assumed `A`, `C` (a single-value function passes SUPPRESS on). Record the display queues of X1, K1, K2, U1. | ADR-0006 bullet 2; #2 §7.4 |

## Mapping lift-3: SUPPRESS as the last value read

Boxes: C1, G1, X1 as in lift-2; L3 = `concat` with in1 = X1, in2 = `Orders/Order/Tag`
(default context `Order`). Target wire: L3 -> `Out/Item/V`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `l3.xml` | o1: line (a,0), tags t1,t2,t3: X1 is a single SUPPRESS, is it reused for each tag (assumed: three SUPPRESS slots, no `V`)? o2: lines (a,5), (b,0), tags t1,t2,t3: X1 is `5,SUPPRESS`; assumed `5t1` only, the last value read (SUPPRESS) is reused for `t3` and gives SUPPRESS. If the reuse skipped SUPPRESS: `5t3` or similar; record it. | #2 §7.3; ADR-0006 bullet 2 |

## Mapping lift-4: constants into context and queue functions

| Box | Function | Inputs |
| --- | --- | --- |
| K1 | `Constant{k}` | none |
| N1 | `count` | in1 = K1 |
| K2 | `Constant{k}` | none |
| R1 | `removeContexts` | in1 = K2 |

Target wires: N1 -> `Out/Item/V`; R1 -> `Out/Item/W`.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `l4.xml` | Three orders. A constant is one context with one value (assumed): `V` is `1` in `Item` 1 and `Item` 2, 3 get none; `W` is `k` in `Item` 1 only. If PO repeated the constant per parent context, every `Item` has `V` = 1 and `W` = k. Display queues of N1, R1. | ADR-0004 bullet 1 |
