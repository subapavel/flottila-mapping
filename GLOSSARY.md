# Flottila Mapping

Turns a source message into a target message by a mapping that a person draws in the editor or
writes as XSLT, compiled to one intermediate representation and run on the JVM.

Seed glossary from the founding conversation (2026-10-30). `/domain-modeling` sharpens it; a term
marked _(open)_ is waiting for a Phase 0 decision.

## Mapping

**Mapping**:
A named, versioned transformation from one source structure to one target structure.
_Avoid_: map, transformation, message mapping (except when quoting SAP PO)

**Mapping model**:
The stored, declarative form of a graphical mapping, the one the editor reads and writes and the
compiler reads. It is data, never generated code. _(open: format and schema)_
_Avoid_: mapping file, mapping definition

**Structure**:
The tree of fields a message may have, with names, types and cardinalities, read from an XSD,
WSDL, JSON Schema or similar.
_Avoid_: schema (for the in-memory tree), message type, data type

**Source structure** / **Target structure**:
The structure a mapping reads from / writes to.

**Field**:
A node of a structure: an element, an attribute or a JSON property.
_Avoid_: node (reserved for XDM), element (too narrow)

**Target field mapping**:
The function graph that produces the values of one target field.
_Avoid_: rule, assignment, line

**Function graph**:
The tree of source fields, constants and functions wired into one target field mapping.
_Avoid_: expression (reserved for XPath), formula

**Standard function**:
A built-in function of the graphical editor (concat, if, formatDate, removeContexts …).
_Avoid_: built-in, node function

**User-defined function (UDF)**:
A Java method a mapping author adds, with one execution kind.
_Avoid_: custom function, extension (reserved for XSLT extension functions)

**Execution kind**:
What one call of a standard function or UDF sees: _single value_ (one value at a time),
_context_ (all values of one context) or _queue_ (all values of the queue).
_Avoid_: function type, UDF type, cache (SAP PO's UI word)

**Context function**:
A standard function of execution kind _context_ or _queue_: it sees whole contexts and may change
their boundaries or the number of values (removeContexts, splitByValue, sort, sum …). SAP PO
files most of them under "Node functions".
_Avoid_: node function

**Function catalogue**:
The data that lists every standard function: its name, its SAP PO/CPI name, execution kind,
parameters, whether it is portable, and its fidelity. The editor's palette, the function
documentation and migration tools read it.
_Avoid_: function registry, function list

**Fidelity**:
How a standard function relates to SAP PO/CPI behaviour: _exact_, _deviation_ (a documented
difference with an id and an example) or _assumed_ (an assumed reading waiting for an observed
case).
_Avoid_: compatibility level

**Portable function**:
A function whose exported XSLT 3.0 runs on any conforming processor without Flottila's own Java
functions. Only portable functions are covered by the differential oracle.

**Export profile**:
The target of an XSLT export: _portable_ (pure XSLT 3.0) or, later, _flottila_ (may call
Flottila's Java functions).

## Queues and contexts

**Queue**:
The values a function graph sees for one source field, split into contexts.
_Avoid_: list, stream, array (for the logical concept)

**Context**:
One segment of a queue: the values under one occurrence of the parent field.
_Avoid_: group, partition

**Context change**:
The boundary between two contexts of a queue.

**SUPPRESS**:
The marker for a value that is present as a slot but produces no target field.
_Avoid_: null, empty (both are different things)

**Display queue**:
The view that shows a queue with its contexts and SUPPRESS markers at any point of a function
graph, for a given test input.

## Engine

**XDM**:
The logical data model shared by every front end: items, sequences, nodes, atomic values, maps,
arrays (XPath 3.1 data model).

**Runtime representation**:
A physical form of an XDM value chosen by the compiler (tiny tree, queue block, projected buffer,
persistent map). Several exist; the XDM contract is one.
_Avoid_: implementation (too vague)

**IR**:
The front-end-independent intermediate representation every mapping and stylesheet compiles to,
and the only input of the optimiser and the back ends.
_Avoid_: AST (that is a front end's own tree), bytecode

**Front end**:
A compiler stage that turns one authoring form (mapping model, XSLT, XPath) into IR.

**Back end**:
A stage that runs IR: the interpreter, the bytecode generator, the XSLT exporter.

**Projection**:
Reading only the source fields a compiled mapping uses and skipping the rest of the input.

## Verification

**Oracle**:
An independent source of the expected output for a case: the W3C test suites, Saxon-HE running
the exported XSLT, or the golden corpus.

**Differential case**:
A case whose expected output is whatever Saxon-HE produces from the exported XSLT of the same
mapping.

**Golden corpus**:
Synthetic mappings with inputs and the outputs SAP PO semantics demand, kept in the repo.
_Avoid_: test data, samples

**Observed case**:
A golden-corpus case whose expected output was recorded by running the same synthetic mapping
on SAP PO and SAP Cloud Integration.

**Assumed reading**:
Our interpretation of a PO behaviour the SAP documentation leaves open, used until an observed
case confirms or corrects it.
_Avoid_: default, guess

**Ratchet**:
A committed record of what passes (oracle cases, coverage, benchmark baselines). Merges may only
keep or raise it; the verifier regenerates it, nobody edits it by hand.

## Way of working

**Wayfinder map**:
A GitHub issue (`wayfinder:map`) indexing the decisions that lead to a destination, with one child
issue per decision ticket.

**Spec**:
A GitHub issue (`spec`) describing one deliverable from the user's side, parent of its tickets.

**Ticket**:
A tracer-bullet slice of a spec, sized for one fresh context, with blocking edges and one class.

**Frontier**:
The open, unblocked, unclaimed tickets of a spec or map.

**Integration branch**:
`spec/<issue>-<slug>`, where a spec's tickets are merged one by one before one PR to `main`.

**Gate**:
A milestone check list in `docs/GATE.md`, verified by the gate-reviewer on one commit.

**Finding**:
A written contradiction between practice and an ADR or the architecture, with the smallest
change that keeps the documented intent.
