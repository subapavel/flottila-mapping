# obs-useoneasmany

Notation, what to return and the ESR / CPI naming: `../README.md`. Source: `src-orders.xsd` (root
`Orders`). Target: `tgt-list.xsd` (root `Out`).

## Mapping uoam-1

| Box | Function | Inputs |
| --- | --- | --- |
| U1 | `useOneAsMany` | in1 = `Orders/Order/Id` (default context `Order`); in2 = `Orders/Order/Line/Sku` with context `Order`; in3 = `Orders/Order/Tag` with context `Order` |

Target wires: `Orders/Order` -> `Out/Item` (node to node); U1 -> `Out/Item/V`.

In1 is the value to repeat, in2 says how often (the number of values of in2 in the context of
each in1 value), in3 supplies the context changes (#2 §4, SAP figure).

No ADR fixes a reading for the error cases; the question of every input is "what does PO do",
and the assumed reading is "not stated, #2 §7.10". Return the output, or the error text exactly,
per input. Where PO fails, also say at which box.

| Input | Question it decides | Tests |
| --- | --- | --- |
| `u1.xml` | Counts agree. A: Id A, Sku s1,s2,s3, Tag t1,t2,t3. B: Id B, Sku s4, Tag t4. Baseline: A is repeated three times in `Item` 1, B once in `Item` 2. | #2 §7.10 |
| `u2.xml` | in2 has more values than in3 (Sku 3, Tag 2). Error, truncation, or reuse of the last in3 value? | #2 §7.10 |
| `u3.xml` | in2 has fewer values than in3 (Sku 2, Tag 3). Error, or are the extra in3 values ignored? | #2 §7.10 |
| `u4.xml` | Empty contexts. A: Tags, no Line (in2 empty). B: Lines, no Tag (in3 empty). Third order: no `Id` (in1 empty), Tag t3, Sku s3. D: all present (baseline, shows whether an earlier failure is per order or per run). Output or error per order; if the run fails on A, drop A and rerun until each case has been seen, and say so. | #2 §7.10, §7.6 |
