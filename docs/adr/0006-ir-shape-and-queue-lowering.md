# IR shape and queue lowering: sealed `Expr`, explicit `Lift`, target slots

Status: accepted (2026-10-30, grilling #5)

This ADR records `docs/FOUNDING-ARCHITECTURE.md` §4 and §6 for milestone 1 and fills its gaps.
Every front end lowers to records of `sealed interface Expr`. The records are `Literal`,
`VarRef`, `Let`, `FunCall`, `Cast`, `SourceQueue`, `QueueToArray`, `ArrayToQueue`,
`AtomicToQueue`, `Lift`, `TargetSlots`, `TargetRepeat`, `ElementConstructor`,
`AttributeConstructor` and `TextConstructor`. Each record ends with `AuthoringId origin`.
`AuthoringId(String value)` is opaque, stable and unique within a mapping. It names a target
field mapping, a function box or a source-field box, and later an XSLT instruction. Tracing,
the display queue and design-time errors refer to nothing else.

The IR is pure data: records, enums, strings, ints and a symbolic
`FunctionRef(name, params, result)`. It holds no `MethodHandle` or `Class`; back ends link calls.

## Typing

- `IrType` is `AtomicType` (the seven types of ADR-0004, `INTEGER` ⊑ `DECIMAL`), `QueueType` or
  `ContentType`. A node's type is derived; only `VarRef` stores one.
- The front end emits well-typed IR. It inserts `Cast` where a signature needs a typed value
  (a failed cast raises `FORG0001`, ADR-0005) and `AtomicToQueue` where a context or queue
  function gets an atomic input.
- User errors are design-time errors raised by lowering with their `origin`: an unresolved
  function, a wrong arity, a parameter that cannot be cast, an untranslatable pattern
  (ADR-0003), a target leaf with `minOccurs > 0` and no mapping.
- `IrVerifier` re-checks the IR after lowering and after every optimiser pass. A failure there
  is a compiler bug.

This refines ADR-0004: typed values exist only inside a `Lift` body or a `FunCall`. A queue
meets arrays and XDM callees only through `QueueToArray` / `ArrayToQueue`, and atomic values
only through `Lift` and `AtomicToQueue`.

## Functions by execution kind

- A source field becomes a `SourceQueue`. Equal (field, context) pairs share one queue of the
  projection plan.
- A **single-value** function or UDF with at least one queue input becomes
  `Lift(queues, body)`. The body is an atomic `FunCall` over the slot variables; a `Literal`
  argument stays in the body and so applies to every slot. `Lift` has the export's `po:lift`
  semantics:
  - context i of the result pairs context i of every input; the result has as many contexts as
    the input with the most;
  - if any input's context i is empty or missing, result context i is empty;
  - otherwise the longest input sets the slot count and shorter inputs reuse their last value
    inside the context;
  - SUPPRESS in any input gives a SUPPRESS slot without running the body; the other inputs are
    still consumed.
- A single-value call with no queue input stays an atomic `FunCall`.
- **Context** and **queue** functions, standard or UDF, are `FunCall`s over queue blocks into a
  runtime library, bound by their name in the function catalogue. Box parameters are `Literal`
  arguments. Context operations have no IR records of their own; the optimiser matches by name.
  `createIf` and `ifWithoutElse` are context functions, because they produce SUPPRESS.

## Target fields

Target fields are produced in target document order and written straight to the output
destination; no target tree is built. This replaces FOUNDING §6's "target cardinality →
for-each over the source context".

- The queue of each mapped target field is a `Let`, evaluated lazily on first read. Calls
  therefore run in target document order, as in PO, and a field never created is never
  evaluated.
- The root is created once with slot number 1.
- `TargetSlots(queue, parentSlot, min, max, …)` reads context p, where p is the parent's slot
  number. Each slot gets its **slot number**, its position across all contexts of the queue.
  The slot number is the context index of the children's queues.
  - A SUPPRESS slot creates nothing but keeps its number, so it consumes its child context.
  - Creation stops after `max` occurrences. Truncated slots keep their numbers.
  - Contexts beyond the parent's last slot are never read.
  - Fewer than `min` created occurrences raise `po:MINOCCURS`, the export's error QName.
    SUPPRESS slots do not count toward `min` or `max`.
- A **generating function** (a function graph with no source field) on a target becomes
  `TargetRepeat(max(1, minOccurs))` per parent slot. Its children are numbered
  `(p − 1) · copies + j`.
- An unmapped structure field with `minOccurs = maxOccurs = n > 0` is created n times. An
  unmapped optional field is left out with its subtree.
- Constructors are records per output format. Milestone 1 has the XML ones only. A JSON target
  adds records under the same `TargetSlots` / `TargetRepeat`; nothing existing changes.
- An error after part of the output was written leaves the destination undefined. The API
  says so, and callers that need all-or-nothing buffer the output, as the service does.

## Optimiser, display queue, serialisation

- The milestone-1 optimiser is the pure-rewrite framework plus constant folding of
  deterministic single-value `FunCall` / `Cast` over `Literal`s. The catalogue gains a
  `deterministic` flag. A replacement keeps the `origin` of the node it replaces. Rewrites never
  reorder or merge non-deterministic calls (`counter`, UDFs without the flag). FOUNDING §7.6
  shape specialisation is a back-end fast path in milestone 1: for example, a one-input `Lift`
  reuses its input's `contextStarts` and SUPPRESS bitset.
- Display queue: the outermost node of each `origin` is observable. The hook is
  `Tracer.value(AuthoringId, QueueBlock | AtomicValue)`, called once per evaluation and off when
  no tracer is set. `Literal`s are shown from the model, not traced. Editor test runs use
  unoptimised IR in the interpreter, so every box has its node. Bytecode emits the hooks only in
  a traced compile.
- Milestone 1 does not serialise IR. Mappings compile from the mapping model at deploy
  (FOUNDING §5). The pure-data rule keeps a later SEF-like format mechanical; that format must
  version the node list.

## Considered options

- **Lifting as an implicit meaning of `FunCall`, keyed on the execution kind**: rejected.
  `FunCall` would mean two things (an XPath call and PO alignment), typing would depend on the
  catalogue, and the per-slot body would be hidden from folding and UDF inlining.
- **One IR record per context function**: rejected. About fifteen records that every back end,
  the exporter and the optimiser must switch on, growing with a catalogue that is data.
- **Target creation as for-each over the source context or over array operations**: rejected.
  It cannot express SUPPRESS consuming its child context, and it spreads PO's occurrence rules
  over generic nodes.
- **Buffering the whole output, or a validating pre-pass**: rejected. The first goes against
  FOUNDING §7.3, the second needs a second walk with duplicated logic.
- **A structured authoring id (path plus element kind)**: rejected. It ties the IR to the shape
  of the mapping model, and no second implementation exists.
- **Serialised IR in milestone 1**: deferred. It would freeze a persisted node list before the
  XSLT front end tests the IR.
- **Empty element or omission for an unmapped mandatory leaf**: rejected. Both give invalid
  output silently.

## Consequences

- Binds the interpreter, the bytecode tier and the exporter: `Lift` ≡ `po:lift`,
  `TargetSlots` ≡ `po:slots` + `po:at-least`, one error QName.
- The mapping model (#6) must give every target field mapping, function box and source-field
  box a stable id that survives editing and diffs.
- Assumed readings until observed cases confirm them (ADR-0002, #14):
  - an empty or missing context in a `Lift` input gives an empty result context;
  - SUPPRESS in a `Lift` input gives SUPPRESS and consumes the other inputs, for every
    single-value function and UDF;
  - SUPPRESS does not count toward `minOccurs` / `maxOccurs`; truncated slots keep their
    numbers;
  - a constant-only graph through a function (`concat(const, const)`) on a target is a
    generating function; its children are numbered `(p − 1) · copies + j`;
  - an unmapped target leaf with `minOccurs > 0` is a design-time error.
