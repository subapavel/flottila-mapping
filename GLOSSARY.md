# Flottila Mapping

Turns a source message into a target message by a mapping that a person draws in the editor or
writes as XSLT, compiled to one intermediate representation and run on the JVM.

Seed glossary from the founding conversation (2026-10-30). `/domain-modeling` sharpens it; a term
marked _(open)_ is waiting for a Phase 0 decision.

## Mapping

**Mapping**:
A named, versioned transformation from one source structure to one target structure.
_Avoid_: map, transformation, message mapping (except when quoting SAP PO)

**Workspace**:
The directory, usually a git working tree, whose mapping models the service lists, opens and
saves. A mapping's id is its path in the workspace without the file suffix (ADR-0014).
_Avoid_: project, repository (for the directory the service serves)

**Mapping model**:
The stored, declarative form of a graphical mapping, the one the editor reads and writes and the
compiler reads: one file that holds everything deciding the mapping's result and refers to its
schema bundles and UDF sources. It is data, never generated code.
_Avoid_: mapping file, mapping definition

**Canonical form**:
The one way the writer spells a mapping model. Diffs and round trips compare it.
_Avoid_: pretty print, normalised form

**Format version**:
The version of the mapping model's own format. A newer one is refused, and an older one is
migrated on load.
_Avoid_: schema version, model version

**Refresh**:
Re-reading a mapping's schema bundles to take a changed structure: the fingerprint is
re-derived and the orphaned references are listed.
_Avoid_: re-import (for an unchanged mapping), sync

**Structure**:
The tree of fields a message may have, with names, types and cardinalities, read from an XSD,
WSDL, JSON Schema or similar.
_Avoid_: schema (for the in-memory tree), message type, data type

**Schema bundle**:
The schema files a structure was read from, which the mapping refers to together with the chosen
root: files in the same repository, or in a shared package at a fixed version.
_Avoid_: schema set, schema snapshot

**Shared package**:
A versioned package of artefacts (schemas, UDF sources) that several mappings refer to at a fixed
version.
_Avoid_: library (for the package itself), common folder

**Orphaned reference**:
A field path in a mapping that the mapping's current structure no longer has.
_Avoid_: broken link, dangling field

**Source structure** / **Target structure**:
The structure a mapping reads from / writes to.

**Field**:
A node of a structure: an element, an attribute or a JSON property.
_Avoid_: node (reserved for XDM), element (too narrow)

**Structure field** / **Leaf field**:
A field with child fields and no value of its own, whose queue holds one empty string per
occurrence / a field with a value, whose queue holds that value. An element with a simple value
and attributes is a leaf field; its attributes are fields of their own.
_Avoid_: node, segment, complex element

**Effective occurrence**:
A field's minimum and maximum number of occurrences under one occurrence of its parent field,
after every enclosing sequence, choice and all is taken into account; a branch of a choice has
minimum 0.
_Avoid_: cardinality (for the declared value)

**Field path**:
The identity of a field: the name and namespace of every field from the root down to it, with
attributes marked. A mapping refers to source and target fields only by their field paths.
_Avoid_: XPath, field id, node path

**Target field mapping**:
The function graph that produces the values of one target field.
_Avoid_: rule, assignment, line

**Function graph**:
The acyclic graph of source-field boxes and function boxes wired into one target field mapping;
one box's output may feed several inputs.
_Avoid_: expression (reserved for XPath), formula, tree

**Function box**:
One call in a function graph (a standard function, a UDF, a constant or an unresolved function)
with its inputs and box parameters.
_Avoid_: node, brick

**Source-field box**:
The box of a function graph that reads one source field's queue in one context.
_Avoid_: source node

**Box parameter**:
A constant setting of a function box (a string or a table of strings), named as in the function
catalogue, such as a date pattern or the mode of `splitByValue`.
_Avoid_: argument, input

**Unresolved function**:
A function box whose function is neither in the function catalogue nor among the mapping's UDFs.
It keeps the original name, its inputs and its parameters, and compiling it is a design-time
error.
_Avoid_: unknown function, missing function

**Layout**:
Where the editor draws boxes and how the view is zoomed, collapsed or split. It is computed from
the mapping model when a mapping opens (dagre), then kept stable as the viewer's own state, and
it is never stored with the mapping (ADR-0012).
_Avoid_: diagram, view data

**Structure overview**:
The top half of the editor. The source tree and the target tree stand side by side, with field
links drawn between them.
_Avoid_: mapping overview, tree view

**Field link**:
The line in the structure overview from a source field to a target field whose target field
mapping reads it. A pair of fields has one link, however many source-field boxes stand behind it.
_Avoid_: edge (reserved for the function graph), connection, line

**Function editor**:
The bottom half of the editor. It holds the canvas with the function graph of the selected
target field mapping, the palette, quick insert and the inspector.
_Avoid_: data-flow editor, mapping expression

**Inspector**:
The panel of the function editor that shows the selected box: its catalogue documentation and
fidelity, its box parameters, its context and its display queue.
_Avoid_: properties panel

**Working copy**:
The mapping model as the author is editing it in the editor, saved or not. Compile and test run
on it.
_Avoid_: draft, local model

**Baseline**:
The mapping model as the service last saved it, in canonical form. The working copy has unsaved
changes when it differs from the baseline.
_Avoid_: original, server copy

**Unreachable box**:
A function box or source-field box that the target field mapping's `result` does not reach. It
is kept on save and dimmed on the canvas, and compiling ignores it with a warning (ADR-0013).
_Avoid_: dead box, orphaned box (orphaned is for references)

**Dev host**:
The thin standalone page that opens one mapping in the editor for development and tests, before
Flottila embeds the editor (ADR-0013).
_Avoid_: app, shell (reserved for Flottila's)

**Standard function**:
A built-in function of the graphical editor (concat, if, formatDate, removeContexts …).
_Avoid_: built-in, node function

**User-defined function (UDF)**:
A static Java method a mapping author writes in a source file of the workspace and declares in
the mapping, with one execution kind (ADR-0020).
_Avoid_: custom function, extension (reserved for XSLT extension functions)

**UDF library**:
The UDF source files of one mapping that share a source root and are compiled and loaded
together. Two versions of a UDF are two libraries.
_Avoid_: UDF jar, UDF package (a shared package is something else)

**UDF declaration**:
A mapping's entry in `udfs` that names a UDF, its execution kind, inputs, box parameters and
source method. Compiling checks it against the method.
_Avoid_: UDF signature (that is the Java method's)

**Mapping run**:
One transformation of one input message by a compiled mapping. The state a UDF keeps lives for
one mapping run and is shared by all its UDFs.
_Avoid_: global container, session

**Allow-list**:
The Java APIs a UDF may call. A call outside it is a design-time error.
_Avoid_: sandbox, security manager

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
One segment of a queue: the values under one occurrence of the context field. The context field
is the parent field by default (an attribute's own element) and can be set to any ancestor.
_Avoid_: group, partition

**Context change**:
The boundary between two contexts of a queue.

**Slot**:
One position of a queue: a value or SUPPRESS. Target occurrences and child contexts are counted
in slots.
_Avoid_: entry, element, item (reserved for XDM)

**Empty context**:
A context with no slots, as under a parent occurrence without children. A queue with no contexts
at all (the parent is absent) is a different thing.

**SUPPRESS**:
The marker for a value that is present as a slot but produces no target field.
_Avoid_: null, empty (both are different things)

**Slot number**:
The position of a slot counted across all contexts of a queue, starting at 1. A target
occurrence's slot number is the index of the context its children read.
_Avoid_: index, position (both are per context)

**Generating function**:
A function graph with no source field, such as a constant or `concat` of two constants. On a
target field it gives `max(1, minOccurs)` occurrences per parent occurrence.
_Avoid_: constant (for the general case)

**Test run**:
Running a mapping's working copy on one input message in the editor. It returns the target
message or a runtime error, the diagnostics and the trace (ADR-0015).
_Avoid_: simulation, preview

**Trace**:
What a test run records: the queue or value each evaluated box produced, by authoring id, and
the occurrences of each target field per parent slot. The display queue shows it.
_Avoid_: log, debug output

**Diagnostic**:
A design-time error or warning, with a stable code and one location: an authoring id, a JSON
pointer into the mapping model, a field path, or a schema file position (ADR-0015).
_Avoid_: validation message, problem (reserved for HTTP problem details)

**Display queue**:
The view that shows the queue (or single value) one function box, source field or target field
produces, with its contexts and SUPPRESS markers, for a given test input. For a target field it
also shows the occurrences created per parent slot, and why a slot created none (ADR-0012).

## Engine

**XDM**:
The logical data model shared by every front end: items, sequences, nodes, atomic values, maps,
arrays (XPath 3.1 data model).

**Runtime representation**:
A physical form of an XDM value chosen by the compiler (tiny tree, queue block, projected buffer,
persistent map). Several exist; the XDM contract is one.
_Avoid_: implementation (too vague)

**Queue block**:
The runtime representation of a queue: its values, where each context starts, and which slots
are SUPPRESS.
_Avoid_: queue (for the physical form), result list

**IR**:
The front-end-independent intermediate representation every mapping and stylesheet compiles to,
and the only input of the optimiser and the back ends.
_Avoid_: AST (that is a front end's own tree), bytecode

**Lift**:
Applying a single-value function to queues slot by slot: contexts are paired by position,
shorter inputs reuse their last value inside a context, and SUPPRESS passes through.
_Avoid_: map, broadcast, loop

**Authoring id**:
The stable id of the authoring element (target field mapping, function box, source-field box,
later an XSLT instruction) that a piece of compiled mapping came from. Tracing, the display
queue and design-time errors refer to it.
_Avoid_: node id, element id

**Front end**:
A compiler stage that turns one authoring form (mapping model, XSLT, XPath) into IR.

**Back end**:
A stage that runs IR: the interpreter, the bytecode generator, the XSLT exporter.

**Projection**:
Reading only the source fields a compiled mapping uses and skipping the rest of the input.

**Engine module**:
A JPMS module of the engine, tested on the module path. The service is not one; it uses the
engine through the engine facade.
_Avoid_: library, package (a Java package is something else)

**Engine facade**:
The one engine module the service calls to compile, test run and export a mapping. It carries no
compatibility promise and is not the embedding API for Flottila.
_Avoid_: engine API (sounds public and stable), SDK

**Contract**:
The files the service and the editor must agree on: the mapping-model schema, the
function-catalogue schema and the committed OpenAPI document. Both sides' types are generated
from or checked against them.
_Avoid_: API spec, interface definition

## Verification

**Oracle**:
An independent source of the expected output for a case: the W3C test suites, Saxon-HE running
the exported XSLT, or the golden corpus.

**Differential oracle**:
Running a corpus case's mapping both in our runtime and, exported to XSLT, in Saxon-HE, and
requiring the same output. It applies to every case whose functions are all portable.
_Avoid_: differential case (it is a second oracle over the same cases, not a kind of case)

**Golden corpus**:
Synthetic mappings with inputs and the outputs SAP PO semantics demand, kept in the repo.
_Avoid_: test data, samples

**Corpus case**:
One input of one synthetic mapping with its expectation (an output, an error, or none), named by
a permanent case id such as `fn/removeContexts/001`.

**Provenance**:
Where a corpus case's expected output comes from: observed, documented (the SAP documentation),
assumed (an assumed reading) or decided (our own rule or a deviation).

**Observed case**:
A golden-corpus case whose expected output was recorded by running the same synthetic mapping
on SAP PO 7.5 and SAP Cloud Integration. When the two differ, PO 7.5's output is expected and
the difference is a deviation.

**Observation request**:
An owner issue describing a synthetic mapping and its inputs to run on PO 7.5 and CPI, and the
question each input decides.

**Metamorphic variant**:
Another way of running the same corpus case that must give a byte-identical output: optimised or
unoptimised IR, with or without a tracer, and later the bytecode tier.

**Assumed reading**:
Our interpretation of a PO behaviour the SAP documentation leaves open, used until an observed
case confirms or corrects it.
_Avoid_: default, guess

**Ratchet**:
A committed record of what passes (oracle cases, coverage, mutation scores, benchmark
baselines). Merges into `main` may only keep or raise it; the verifier regenerates it once per
spec, nobody edits it by hand.

**Floor**:
A fixed minimum of coverage or mutation score below which the build fails, whatever the ratchet
says.

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

**Ticket gate**:
The automatic checks the verifier runs on one ticket's worktree before it merges: the scoped
build of the touched modules, a compile of the whole build, and the ratchet check.
_Avoid_: CI (that runs the spec gate's checks), pre-merge review

**Spec gate**:
The full checks the verifier runs on an integration branch before the spec's PR: every build,
test, oracle and UI suite, the ratchet regeneration and the benchmarks.
_Avoid_: full build (only one part of it)

**Gate**:
A milestone check list in `docs/GATE.md`, verified by the gate-reviewer on one commit.

**Finding**:
A written contradiction between practice and an ADR or the architecture, with the smallest
change that keeps the documented intent.
