# obs-constant

Notation, what to return and the ESR / CPI naming: `../README.md`. Source of all mappings:
`src-orders.xsd` (root `Orders`). Target of all mappings: `tgt-list.xsd` (root `Out`). The one
request of the constant family (spec #70, #79). Every mapping maps `Orders/Order` -> `Out/Item`
(node to node), so `Item` *i* is order *i* and the queue of `V` belongs to it by context. One run
of an input answers every case that names it. Each case id is a directory under `corpus/cases/`.
`CopyValue`'s parameter is the position the editor asks for; write it as the request gives it.

## Mapping copy-value

| Box | Function | Inputs |
| --- | --- | --- |
| S2 | source | `Orders/Order/Line/Sku` with context `Order` |
| F1 | `CopyValue{1}` | in1 = S2 |

Target wires: `Orders/Order` -> `Out/Item`; F1 -> `Out/Item/V`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/copyValue/001` | `copyValue-001.xml` | Which value position 1 copies, and what a context too short for it gives: Sku in context Order is a, b, c \| d \| e, f. Assumed: the position counts from 0 in each context, and a context without that position gives no value, so V is b, (none), f. Return F1's display queue too. Counting from 1 gives a, d, e; counting across the whole queue gives b in o1 only; an error or an empty V in o2 differs too. |

## Mapping copy-value-default

| Box | Function | Inputs |
| --- | --- | --- |
| S2 | source | `Orders/Order/Line/Sku` with context `Order` |
| F1 | `CopyValue` (parameter left as the editor proposes it) | in1 = S2 |

Target wires: `Orders/Order` -> `Out/Item`; F1 -> `Out/Item/V`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/copyValue/002` | `copyValue-001.xml` | The default position: assumed 0, the first value of each context, so V is a, d, e. Return the default the editor shows, and whether it lets the box be saved without one. |

## Mapping copy-value-beyond

| Box | Function | Inputs |
| --- | --- | --- |
| S2 | source | `Orders/Order/Line/Sku` with context `Order` |
| F1 | `CopyValue{3}` | in1 = S2 |

Target wires: `Orders/Order` -> `Out/Item`; F1 -> `Out/Item/V`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/copyValue/003` | `copyValue-001.xml` | A position beyond every context: assumed an empty context each, so no Item has a V and the run succeeds. Return F1's display queue. If PO raises an error (an index exception), return its text exactly. |

## Mapping copy-value-suppress

| Box | Function | Inputs |
| --- | --- | --- |
| S2 | source | `Orders/Order/Tag` (default context `Order`) |
| C1 | `createIf` | in1 = S2 |
| F1 | `CopyValue{1}` | in1 = C1 |

Target wires: `Orders/Order` -> `Out/Item`; F1 -> `Out/Item/V`.

| Case | Input | Question it decides and the assumed reading |
| --- | --- | --- |
| `fn/copyValue/004` | `copyValue-004.xml` | C1 is "", SUPPRESS, "" \| SUPPRESS, "" \| (empty). Assumed: SUPPRESS counts as a position and is copied, so F1 is SUPPRESS \| "" \| (empty) and only o2's Item has a V, empty. Return C1's and F1's display queues. If SUPPRESS is skipped, F1 is "" \| (empty) \| (empty) and only o1's Item has a V. |
