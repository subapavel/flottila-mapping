# Standard functions bind by name: an engine catalogue as data, a total FunCall, po:<name> in the helper module

Status: accepted (2026-11-02, #50 design, spec #48)

## Decision

- **Catalogue as data.**
  - `function-catalogue.json` is a resource of `engine/mapping`, in canonical form (ADR-0011). It lists the standard functions by name, with these members:
    - `executionKind`: `single`, `context` or `queue`;
    - `inputs`: `[{name}]`;
    - `params`: `[{name, type, default, values?}]`;
    - `portable`.
  - Inputs and params are arrays, because their order is the signature.
  - Every param has a default.
  - Spec 3 adds ADR-0011's other members (the PO/CPI names, fidelity and the like) and the schema, and publishes it. Spec 3 extends the file; it never rewrites it.
- **Only lowering reads the catalogue.**
  - A context or queue function becomes `FunCall(FunctionRef(name, paramTypes, resultType), args, origin)`. The args are the inputs in catalogue order, then every param in catalogue order as a `Literal`.
  - Lowering fills in defaults, so the IR is total. `IrVerifier` checks arity, arg types and that params are literals.
  - The back ends bind by name only.
- **Runtime library.**
  - The algebra over `QueueBlock` lives in `engine/xdm` (`ContextFunctions`). This is where ADR-0004's sharing rules hold.
  - `engine/runtime` binds a name once per call site at closure compile and parses the params into the closure. This refines ADR-0021's "queue-operation library": the binding is in `runtime`, the algebra in `xdm`.
  - The bytecode tier calls the same binding.
- **Export.**
  - A queue is `array(item()*)`, one member per context; a value is an `xs:string` or `$po:SUPPRESS`, ADR-0004's marker (since #51).
  - A `Lift` exports as `po:lift((queues), function($in as xs:string*) as xs:string {…})`. The runtime binds a single-value function by name to a string node.
  - A `FunCall` exports as `po:<catalogue name>(args…)`, with one `xsl:function` per function in `po-runtime.xsl`, taking its args in `FunCall` order.
  - Renaming a function breaks exports already handed out.
- **Stage-3 codes at the box** (added to ADR-0011):
  - `wrong-arity`
  - `unconnected-input`
  - `unknown-parameter`
  - `wrong-parameter-type`
  - `invalid-parameter-value`

  A function name the catalogue does not hold stays `unsupported-box-kind` until its spec lands. `unresolved-function` remains the code of an unresolved box.

## Considered options

- **Catalogue as Java code in `engine/ir`**: rejected. Spec 3 would have to generate the published data from code, and the glossary calls the catalogue data.
- **The runtime reads the catalogue**: rejected. `runtime` cannot require `mapping` (ADR-0016), and a total IR makes it unnecessary.
- **Named params in `FunCall`**: rejected. ADR-0006 says `Literal` arguments, and one positional list also serves `Lift` bodies.
- **Params passed per call**: rejected. They would be parsed on every run, and the bytecode tier would lose constant literals.

## Consequences

- Each new function costs:
  - one catalogue entry;
  - one `ContextFunctions` method;
  - one runtime binding case;
  - one `po:` function;
  - its corpus and differential cases.
- In formatVersion 1, a box feeding several inputs is lowered once per use. There is no `Let` in spec 2, and the trace (#53) reports such a box once.
- The catalogue and `po-runtime.xsl` hold every family, against CODING_STANDARDS ("no central
  registry"). Spec 2 accepts that, because it adds one family; before spec 3 both split into one
  file per family (F-15).
