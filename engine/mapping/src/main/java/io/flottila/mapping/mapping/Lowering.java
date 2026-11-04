package io.flottila.mapping.mapping;

import io.flottila.mapping.ir.AtomicToQueue;
import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.IrType;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Lift;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.QueueType;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetRepeat;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import io.flottila.mapping.mapping.internal.FieldPathText;
import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.xdm.TableText;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.IntStream;

/**
 * Validation stage 3 and lowering of a mapping model to IR (ADR-0006, ADR-0011, ADR-0022; #26). A
 * target field mapping becomes {@code TargetSlots} over the queue its {@code result} gives, in its
 * parent's element: the root's, created once, or a structure field's (ADR-0006 since #52). One
 * whose {@code result} gives a single value, a generating function, becomes {@code TargetRepeat} of
 * {@code max(1, minOccurs)} copies at the target field mapping (ADR-0006 since #83). An unmapped
 * structure field whose effective occurrence is {@code n..n} with {@code n > 0} becomes {@code
 * TargetRepeat} of n copies, whatever is mapped below it, an unmapped optional field is left out
 * with its subtree (ADR-0006 "Target fields"; #63), and any other unmapped field is refused. The
 * slot-number variable of a field at depth d is {@code slot<d>}, a mapped field's value variable
 * {@code value<d>}, and a field reads its parent's slot number, the root's {@code root} or the
 * parent's {@code slot<d - 1>}. A leaf's element holds its value, a structure field's its children
 * in target field order.
 *
 * <p>A box lowers to a queue or a single value (ADR-0006 since #83). A source-field box gives its
 * {@code SourceQueue}, of a leaf or of a structure field (ADR-0008; #63). A standard function box
 * whose function the catalogue holds gives, by its execution kind, a {@code FunCall} over its
 * inputs' queues, a single value as {@code AtomicToQueue}, and then its params as {@code Literal}s
 * for a context or queue function. For a single-value function it gives the atomic {@code FunCall}
 * over its inputs and then the params when every input is a single value, as for {@code constant},
 * which has none; otherwise a {@code Lift} over its queue inputs whose body is that {@code FunCall}
 * over their slot variables and the single values (ADR-0006, ADR-0025). A param the box leaves out
 * is its catalogue default, and a table param's {@code Literal} is its {@code TableText} (ADR-0026,
 * #83). A box that feeds several inputs is lowered once per use.
 *
 * <p>Stage 3 reports, each at its authoring id:
 *
 * <ul>
 *   <li>a source or target field path the structure lacks: {@code orphaned-reference};
 *   <li>a source field that is no element below the root (#62, #63), or a target field that is no
 *       element below the root, such as an attribute or the root itself, or that stands under an
 *       unmapped parent which is neither {@code n..n} with {@code n > 0} nor optional, so that PO
 *       requires it to be mapped (#63): {@code unsupported-field}; at {@code /target}, an unmapped
 *       field that would be created beyond the recursion cap (ADR-0008): {@code unsupported-field};
 *       once every target field mapping lowers, at {@code /targetFieldMappings/<field path>}, an
 *       unmapped structure field with {@code 0 < minOccurs < maxOccurs} under a parent that is
 *       created, as PO requires its mapping: {@code unsupported-field};
 *   <li>a {@code result} of {@code null}: {@code unconnected-target-field};
 *   <li>once every target field mapping lowers, at {@code /targetFieldMappings/<field path>}, a
 *       target leaf with {@code minOccurs > 0} that has no target field mapping and stands under a
 *       parent that is created, the root, a mapped field or an unmapped {@code n..n} one (ADR-0006,
 *       #65): {@code unmapped-mandatory-leaf};
 *   <li>a UDF box, or a function box whose function the catalogue does not hold yet: {@code
 *       unsupported-box-kind}; an unresolved box: {@code unresolved-function};
 *   <li>a function box against its catalogue entry: more inputs than the entry has, {@code
 *       wrong-arity}; an input slot of the entry that is {@code null} or absent, {@code
 *       unconnected-input}; a param key the entry lacks, {@code unknown-parameter}; a table for a
 *       string param or a string for a table param, {@code wrong-parameter-type}; a string outside
 *       the values of a param that lists them, or a pattern the formatting core cannot translate
 *       for a param with a syntax (ADR-0026, #74), {@code invalid-parameter-value}.
 * </ul>
 *
 * <p>Only the boxes {@code result} reaches are checked: a box it does not reach is not, and the
 * inputs of a function box refused at the box are not either. A refused target field's boxes are
 * not checked, and after a function box's first refused input its later inputs are not.
 */
public final class Lowering {

  /** The variable that holds the root's slot number. */
  private static final String ROOT_SLOT = "root";

  /** The variable, before its depth, that holds a slot's number in its {@code TargetSlots}. */
  private static final String SLOT = "slot";

  /** The variable, before its depth, that holds a slot's value in its {@code TargetSlots}. */
  private static final String VALUE = "value";

  /** The depth of a field directly under the root, whose parent's slot number is the root's. */
  private static final int UNDER_ROOT = 2;

  /** The most times a recursive path may repeat one type (ADR-0008). */
  private static final int RECURSION_CAP = 16;

  private static final QueueType QUEUE = new QueueType();

  /** A target field mapping that lowers: its field, and the queue or single value it gives. */
  private record Link(Field field, AuthoringId mapping, Expr value) {}

  private final MappingModel model;
  private final Structure source;
  private final Structure target;
  private final List<Diagnostic> found = new ArrayList<>();

  /** Whether the target walk met an unmapped field beyond the recursion cap, which stops it. */
  private boolean endless;

  /** The prefix of each target namespace, in the order first met (ADR-0022). */
  private final Map<String, String> prefixes = new HashMap<>();

  private Lowering(MappingModel model, Structure source, Structure target) {
    this.model = model;
    this.source = source;
    this.target = target;
  }

  /**
   * Lowers {@code model} over the structures its source and target refer to.
   *
   * @return the IR, which the IR verifier has accepted, or every stage-3 diagnostic
   */
  public static LowerResult lower(MappingModel model, Structure source, Structure target) {
    return new Lowering(model, source, target).lower();
  }

  private LowerResult lower() {
    // the fields that are mapped, whether or not their mappings lower, for the parent check
    Set<FieldPath> mapped = new HashSet<>();
    for (String path : model.targetFieldMappings().keySet()) {
      resolve(target, path).ifPresent(mapped::add);
    }
    Map<FieldPath, Link> links = new HashMap<>();
    model.targetFieldMappings().forEach((path, mapping) -> link(path, mapping, mapped, links));
    if (!found.isEmpty()) {
      return new Refused(found);
    }
    FieldPath.Step root = target.root().step();
    // the root's namespace is met first, so it is ns0
    String rootPrefix = prefix(root.namespace());
    List<Expr> content = children(target.rootPath(), links);
    if (!found.isEmpty()) {
      // the walk met an unmapped mandatory leaf, an unmapped structure field that needs a mapping
      // or an unmapped field beyond the recursion cap
      return new Refused(found);
    }
    TargetDocument document =
        new TargetDocument(
            rootPrefix, new Name(root.namespace(), root.localName()), ROOT_SLOT, content);
    // the IR is re-checked after lowering (ADR-0006); a refusal here is a bug of this class
    IrVerifier.verify(document);
    return new Lowered(document);
  }

  /**
   * Adds the link of the target field at {@code path} to {@code links}, or reports why it does not
   * lower: its field first, then its {@code result}.
   *
   * @param mapped the target fields that have a target field mapping
   */
  private void link(
      String path, TargetFieldMapping mapping, Set<FieldPath> mapped, Map<FieldPath, Link> links) {
    targetField(path, mapping.id(), mapped)
        .ifPresent(
            field ->
                queue(mapping)
                    .ifPresent(
                        queue ->
                            links.put(
                                field,
                                new Link(target.field(field).orElseThrow(), mapping.id(), queue))));
  }

  /**
   * The path of the target element below the root that {@code text} names, or empty once the reason
   * it names none is reported at the target field mapping {@code at}. Its parents are walked from
   * the root down: a mapped parent and an unmapped {@code n..n} one ({@code n > 0}) are created, an
   * unmapped optional one is left out with the field in its subtree, which is accepted, and an
   * unmapped one with {@code 0 < min < max} is refused, because PO requires its mapping (#2 §2).
   *
   * @param mapped the target fields that have a target field mapping
   */
  private Optional<FieldPath> targetField(String text, AuthoringId at, Set<FieldPath> mapped) {
    return named(target, text, at)
        .flatMap(
            path -> {
              List<FieldPath.Step> steps = path.steps();
              if (steps.size() < UNDER_ROOT || steps.getLast().kind() != FieldKind.ELEMENT) {
                report(
                    MappingDiagnostics.UNSUPPORTED_FIELD,
                    at,
                    text
                        + " is not a target field this engine maps yet: an element below the"
                        + " root");
                return Optional.empty();
              }
              for (FieldPath parent : parents(path)) {
                Occurrence occurrence = target.field(parent).orElseThrow().occurrence();
                if (mapped.contains(parent) || repeated(occurrence)) {
                  continue;
                }
                if (occurrence.min() == 0) {
                  // left out with its subtree, so the field is never created
                  break;
                }
                report(
                    MappingDiagnostics.UNSUPPORTED_FIELD,
                    at,
                    text
                        + " stands under the unmapped "
                        + parent
                        + " ("
                        + occurrence
                        + "), which needs a target field mapping of its own");
                return Optional.empty();
              }
              return Optional.of(path);
            });
  }

  /** The fields between the root and {@code path}, both left out, from the root down. */
  private static List<FieldPath> parents(FieldPath path) {
    List<FieldPath.Step> steps = path.steps();
    return IntStream.range(UNDER_ROOT, steps.size())
        .mapToObj(depth -> new FieldPath(steps.subList(0, depth)))
        .toList();
  }

  /** Whether an unmapped field of {@code occurrence} is created n times: {@code n..n}, n > 0. */
  private static boolean repeated(Occurrence occurrence) {
    return occurrence.min() > 0 && occurrence.min() == occurrence.max();
  }

  /**
   * The source element below the root that {@code text} names, a leaf or a structure field, at any
   * depth (#62, #63), or empty once the reason it names none is reported at the box {@code at}.
   */
  private Optional<FieldPath> sourceField(String text, AuthoringId at) {
    return named(source, text, at)
        .flatMap(
            path -> {
              Field field = source.field(path).orElseThrow();
              if (path.steps().size() < UNDER_ROOT || field.step().kind() != FieldKind.ELEMENT) {
                report(
                    MappingDiagnostics.UNSUPPORTED_FIELD,
                    at,
                    text
                        + " is not a source field this engine maps yet: an element below the root");
                return Optional.empty();
              }
              return Optional.of(path);
            });
  }

  /**
   * The field path {@code text} names in {@code structure}, or empty once {@code
   * orphaned-reference} is reported at {@code at}: one check for target fields and source fields.
   */
  private Optional<FieldPath> named(Structure structure, String text, AuthoringId at) {
    Optional<FieldPath> path = resolve(structure, text);
    if (path.isEmpty()) {
      report(MappingDiagnostics.ORPHANED_REFERENCE, at, "the structure has no field " + text);
    }
    return path;
  }

  /**
   * The field path {@code text} names, matched step by step against the steps of {@code structure},
   * which spell each step one way (ADR-0007); empty when there is no such field.
   */
  private static Optional<FieldPath> resolve(Structure structure, String text) {
    List<String> steps = FieldPathText.steps(text);
    FieldPath path = structure.rootPath();
    if (!steps.get(1).equals(path.steps().getFirst().toString())) {
      return Optional.empty();
    }
    for (String step : steps.subList(2, steps.size())) {
      Optional<FieldPath> child =
          structure.children(path).stream()
              .filter(c -> c.steps().getLast().toString().equals(step))
              .findFirst();
      if (child.isEmpty()) {
        return Optional.empty();
      }
      path = child.get();
    }
    return Optional.of(path);
  }

  /** The queue {@code mapping}'s {@code result} gives, or empty once its refusal is reported. */
  private Optional<Expr> queue(TargetFieldMapping mapping) {
    if (mapping.result().isEmpty()) {
      report(
          MappingDiagnostics.UNCONNECTED_TARGET_FIELD,
          mapping.id(),
          "the target field mapping's result is not connected");
      return Optional.empty();
    }
    return queue(mapping, mapping.result().get());
  }

  /** The queue box {@code id} of {@code mapping} gives, or empty once its refusal is reported. */
  private Optional<Expr> queue(TargetFieldMapping mapping, AuthoringId id) {
    return switch (mapping.boxes().get(id)) {
      case SourceFieldBox box ->
          sourceField(box.field(), id)
              .map(
                  field ->
                      new SourceQueue(
                          names(field),
                          contextDepth(box, field),
                          source.field(field).orElseThrow().valueType().isEmpty(),
                          id));
      case StandardFunctionBox box -> call(mapping, id, box);
      case UdfBox box -> unsupportedBox(id, "the UDF " + box.udf());
      case UnresolvedFunctionBox box -> {
        report(
            MappingDiagnostics.UNRESOLVED_FUNCTION,
            id,
            "the function " + box.name() + " is neither in the function catalogue nor a UDF");
        yield Optional.empty();
      }
    };
  }

  private Optional<Expr> unsupportedBox(AuthoringId id, String what) {
    report(MappingDiagnostics.UNSUPPORTED_BOX_KIND, id, what + " cannot be compiled yet");
    return Optional.empty();
  }

  /**
   * The call of {@code box}'s function over its inputs' values and then its params, or empty once
   * its refusals are reported. Every defect of the box against its catalogue entry is reported at
   * the box before any input is lowered. Each param is a {@code Literal} at the box: the string the
   * box gives, or a table's {@code TableText} (ADR-0026, #83), or the entry's default when the box
   * leaves the param out (ADR-0025).
   */
  private Optional<Expr> call(TargetFieldMapping mapping, AuthoringId id, StandardFunctionBox box) {
    Optional<FunctionCatalogue.Entry> catalogued = FunctionCatalogue.entry(box.fn());
    if (catalogued.isEmpty()) {
      report(
          MappingDiagnostics.UNSUPPORTED_BOX_KIND,
          id,
          "the function " + box.fn() + " is not in the catalogue yet, so it cannot be compiled");
      return Optional.empty();
    }
    FunctionCatalogue.Entry entry = catalogued.get();
    List<String> inputs = entry.inputs();
    List<Optional<AuthoringId>> slots = box.inputs();
    int reported = found.size();
    if (slots.size() > inputs.size()) {
      report(
          MappingDiagnostics.WRONG_ARITY,
          id,
          box.fn() + " has the inputs " + inputs + ", and the box gives it " + slots.size());
    }
    for (int i = 0; i < inputs.size(); i++) {
      if (i >= slots.size() || slots.get(i).isEmpty()) {
        report(
            MappingDiagnostics.UNCONNECTED_INPUT,
            id,
            "the input " + inputs.get(i) + " of " + box.fn() + " is not connected");
      }
    }
    for (String key : new TreeSet<>(box.params().keySet())) {
      param(id, box, entry, key);
    }
    List<Expr> params = new ArrayList<>();
    for (FunctionCatalogue.Param param : entry.params()) {
      // the box's value, or the default when the box leaves the param out; a value of the other
      // kind is reported above as wrong-parameter-type, so the call is not lowered
      ParamValue value = box.params().getOrDefault(param.name(), param.fallback());
      params.add(
          new Literal(
              switch (value) {
                case Text(String text) -> text;
                case Table(Map<String, String> rows) -> TableText.write(rows);
              },
              id));
    }
    if (found.size() > reported) {
      return Optional.empty();
    }
    List<Expr> values = new ArrayList<>();
    for (Optional<AuthoringId> slot : slots) {
      Optional<Expr> arg = queue(mapping, slot.orElseThrow());
      if (arg.isEmpty()) {
        return Optional.empty();
      }
      values.add(arg.get());
    }
    return Optional.of(
        switch (entry.executionKind()) {
          case SINGLE -> singleValueCall(box.fn(), values, params, id);
          case CONTEXT, QUEUE -> contextCall(box.fn(), values, params, id);
        });
  }

  /**
   * Whether {@code value}, a box's lowered value, is a single value, an atomic {@code FunCall}
   * (ADR-0006 since #83), rather than a queue.
   */
  private static boolean single(Expr value) {
    return value instanceof FunCall c && c.function().resultType() instanceof AtomicType;
  }

  /**
   * The {@code FunCall} of context or queue function {@code fn}: its inputs, each a queue and a
   * single value as {@code AtomicToQueue} at the value's box (ADR-0006 since #83), then its params.
   */
  private static FunCall contextCall(
      String fn, List<Expr> inputs, List<Expr> params, AuthoringId id) {
    List<Expr> args = new ArrayList<>();
    for (Expr input : inputs) {
      args.add(single(input) ? new AtomicToQueue(input, input.origin()) : input);
    }
    args.addAll(params);
    List<IrType> types = new ArrayList<>(Collections.nCopies(inputs.size(), QUEUE));
    types.addAll(Collections.nCopies(params.size(), AtomicType.STRING));
    return new FunCall(new FunctionRef(fn, types, QUEUE), args, id);
  }

  /**
   * The call of single-value function {@code fn} (ADR-0006 since #51 and #83). Over inputs that are
   * all single values, none for {@code constant}, it is the atomic {@code FunCall} over them and
   * then the params. Otherwise it is the {@code Lift} over its queue inputs, one slot variable
   * {@code in1} … per queue, whose body is that {@code FunCall} with each queue input's slot
   * variable in its place, so a single value applies to every slot of every context. Each node
   * carries the box's id.
   */
  private static Expr singleValueCall(
      String fn, List<Expr> inputs, List<Expr> params, AuthoringId id) {
    List<Expr> queues = new ArrayList<>();
    List<String> slotVars = new ArrayList<>();
    List<Expr> args = new ArrayList<>();
    for (Expr input : inputs) {
      if (single(input)) {
        args.add(input);
      } else {
        queues.add(input);
        String slotVar = "in" + queues.size();
        slotVars.add(slotVar);
        args.add(new VarRef(slotVar, AtomicType.STRING, id));
      }
    }
    args.addAll(params);
    FunctionRef function =
        new FunctionRef(fn, Collections.nCopies(args.size(), AtomicType.STRING), AtomicType.STRING);
    FunCall call = new FunCall(function, args, id);
    return queues.isEmpty() ? call : new Lift(queues, slotVars, call, id);
  }

  /**
   * Reports what is wrong with the param {@code key} of {@code box} against {@code entry}, at the
   * box: a key the entry lacks, {@code unknown-parameter}; a table for a string param or a string
   * for a table param (ADR-0026, #83), {@code wrong-parameter-type}; a string outside the values of
   * a param that lists them, or a pattern the formatting core cannot translate for a param with a
   * syntax (ADR-0026, #74), {@code invalid-parameter-value}, naming the element the core cannot
   * translate. A table for a table param, and a string the param takes, any string when it has
   * neither values nor a syntax, are reported as nothing.
   */
  private void param(
      AuthoringId id, StandardFunctionBox box, FunctionCatalogue.Entry entry, String key) {
    Optional<FunctionCatalogue.Param> param = entry.param(key);
    if (param.isEmpty()) {
      report(MappingDiagnostics.UNKNOWN_PARAMETER, id, box.fn() + " has no parameter " + key);
      return;
    }
    switch (box.params().get(key)) {
      case Table _ when !param.get().table() ->
          report(
              MappingDiagnostics.WRONG_PARAMETER_TYPE,
              id,
              "the parameter " + key + " of " + box.fn() + " is a string, not a table");
      // any table of strings
      case Table _ -> {}
      case Text _ when param.get().table() ->
          report(
              MappingDiagnostics.WRONG_PARAMETER_TYPE,
              id,
              "the parameter " + key + " of " + box.fn() + " is a table, not a string");
      case Text(String value) when !param.get().takes(value) ->
          report(
              MappingDiagnostics.INVALID_PARAMETER_VALUE,
              id,
              "the parameter "
                  + key
                  + " of "
                  + box.fn()
                  + " is one of "
                  + param.get().values().orElseThrow()
                  + ", not \""
                  + value
                  + "\"");
      case Text(String value) ->
          param
              .get()
              .untranslatable(value)
              .ifPresent(
                  element ->
                      report(
                          MappingDiagnostics.INVALID_PARAMETER_VALUE,
                          id,
                          "the parameter " + key + " of " + box.fn() + ": " + element));
    }
  }

  private static List<Name> names(FieldPath path) {
    List<Name> names = new ArrayList<>();
    for (FieldPath.Step step : path.steps()) {
      names.add(new Name(step.namespace(), step.localName()));
    }
    return names;
  }

  /** The context's steps from the root down; the field's parent when the box names none. */
  private static int contextDepth(SourceFieldBox box, FieldPath field) {
    return box.context()
        .map(context -> FieldPathText.steps(context).size() - 1)
        .orElse(field.steps().size() - 1);
  }

  /**
   * The content of {@code parent}, in target field order: the {@code TargetSlots} of each mapped
   * child field, and the {@code TargetRepeat} of each unmapped child structure field that is {@code
   * n..n} with {@code n > 0}. An unmapped optional child is left out with its subtree. An unmapped
   * child leaf with {@code minOccurs > 0} would be missing from every occurrence of {@code parent},
   * so it is refused at its absent target field mapping with {@code unmapped-mandatory-leaf}
   * (ADR-0006), and the walk goes on. An unmapped child structure field with {@code 0 < min < max}
   * needs a mapping in PO, so it is refused there with {@code unsupported-field}, and the walk goes
   * on without entering it. An unmapped {@code n..n} structure field whose type its path already
   * repeats {@link #RECURSION_CAP} times would be created without end, so it is refused at the
   * model's {@code /target} with {@code unsupported-field} (ADR-0008), and that refusal stops the
   * walk.
   */
  private List<Expr> children(FieldPath parent, Map<FieldPath, Link> links) {
    List<Expr> content = new ArrayList<>();
    for (FieldPath child : target.children(parent)) {
      if (endless) {
        break;
      }
      Link link = links.get(child);
      Field field = target.field(child).orElseThrow();
      if (link != null) {
        content.add(
            single(link.value()) ? generated(child, link, links) : slots(child, link, links));
      } else if (field.valueType().isPresent()) {
        if (field.occurrence().min() > 0) {
          found.add(
              new Diagnostic(
                  Severity.ERROR,
                  MappingDiagnostics.UNMAPPED_MANDATORY_LEAF,
                  new AtPointer("/targetFieldMappings/" + pointerSegment(child)),
                  "the target leaf "
                      + child
                      + " ("
                      + field.occurrence()
                      + ") has no target field mapping, so the output would lack it"));
        }
      } else if (repeated(field.occurrence())) {
        // an attribute is a leaf (ADR-0008), so only an element gets here
        if (repeats(child, field) > RECURSION_CAP) {
          endless = true;
          found.add(
              new Diagnostic(
                  Severity.ERROR,
                  MappingDiagnostics.UNSUPPORTED_FIELD,
                  new AtPointer("/target"),
                  "the unmapped "
                      + child
                      + " ("
                      + field.occurrence()
                      + ") repeats its type more than "
                      + RECURSION_CAP
                      + " times on its path, so it would be created without end"));
        } else {
          content.add(repeat(child, field, links));
        }
      } else if (field.occurrence().min() > 0) {
        // 0 < min < max: a mapped field below would have been refused at its own mapping already
        found.add(
            new Diagnostic(
                Severity.ERROR,
                MappingDiagnostics.UNSUPPORTED_FIELD,
                new AtPointer("/targetFieldMappings/" + pointerSegment(child)),
                "the unmapped "
                    + child
                    + " ("
                    + field.occurrence()
                    + ") needs a target field mapping of its own"));
      }
    }
    return content;
  }

  /** {@code path}'s text as one RFC 6901 pointer segment: {@code ~} and {@code /} escaped. */
  private static String pointerSegment(FieldPath path) {
    return path.toString().replace("~", "~0").replace("/", "~1");
  }

  /** How many fields of {@code path}, the root and {@code field} included, have its type. */
  private long repeats(FieldPath path, Field field) {
    List<FieldPath.Step> steps = path.steps();
    return IntStream.rangeClosed(1, steps.size())
        .mapToObj(depth -> target.field(new FieldPath(steps.subList(0, depth))).orElseThrow())
        .filter(f -> f.type().equals(field.type()))
        .count();
  }

  /**
   * The {@code TargetRepeat} of the unmapped structure field {@code field} at {@code path}, {@code
   * n..n}: n copies of its element, which holds its children. No authoring element creates it, so
   * its nodes carry its field path as their origin, which no authoring id can spell (ADR-0010). Its
   * prefix is taken before its children's (ADR-0022).
   */
  private TargetRepeat repeat(FieldPath path, Field field, Map<FieldPath, Link> links) {
    int depth = path.steps().size();
    AuthoringId origin = new AuthoringId(path.toString());
    FieldPath.Step step = field.step();
    String prefix = prefix(step.namespace());
    return new TargetRepeat(
        field.occurrence().min(),
        new VarRef(parentSlot(depth), AtomicType.INTEGER, origin),
        SLOT + depth,
        new ElementConstructor(
            prefix, new Name(step.namespace(), step.localName()), children(path, links), origin),
        origin);
  }

  /** The parent's slot-number variable of a field at {@code depth}. */
  private static String parentSlot(int depth) {
    return depth == UNDER_ROOT ? ROOT_SLOT : SLOT + (depth - 1);
  }

  /**
   * The {@code TargetSlots} of the mapped field at {@code path}, whose target field mapping gives a
   * queue: its variables by its depth, its parent's slot number, its effective occurrence, and its
   * element, which holds the slot's value for a leaf.
   */
  private TargetSlots slots(FieldPath path, Link link, Map<FieldPath, Link> links) {
    int depth = path.steps().size();
    String valueVar = VALUE + depth;
    AuthoringId origin = link.mapping();
    Occurrence occurrence = link.field().occurrence();
    return new TargetSlots(
        link.value(),
        new VarRef(parentSlot(depth), AtomicType.INTEGER, origin),
        occurrence.min(),
        occurrence.max(),
        SLOT + depth,
        valueVar,
        element(path, link, new VarRef(valueVar, AtomicType.STRING, origin), links),
        origin);
  }

  /**
   * The {@code TargetRepeat} of the mapped field at {@code path}, whose target field mapping is a
   * generating function, a single value (ADR-0006 "generating function" since #83): {@code max(1,
   * minOccurs)} copies of its element per parent occurrence, whatever its {@code maxOccurs}, its
   * slot-number variable by its depth, and the target field mapping as the origin. A leaf's element
   * holds the value itself, so it is computed once per copy.
   */
  private TargetRepeat generated(FieldPath path, Link link, Map<FieldPath, Link> links) {
    int depth = path.steps().size();
    AuthoringId origin = link.mapping();
    return new TargetRepeat(
        Math.max(1, link.field().occurrence().min()),
        new VarRef(parentSlot(depth), AtomicType.INTEGER, origin),
        SLOT + depth,
        element(path, link, link.value(), links),
        origin);
  }

  /**
   * The element of the mapped field at {@code path}: for a leaf its text, {@code leafValue}, and
   * for a structure field its children. Its prefix is taken before its children's, so prefixes
   * follow document order (ADR-0022).
   */
  private ElementConstructor element(
      FieldPath path, Link link, Expr leafValue, Map<FieldPath, Link> links) {
    Field field = link.field();
    FieldPath.Step step = field.step();
    AuthoringId origin = link.mapping();
    String prefix = prefix(step.namespace());
    List<Expr> content =
        field.valueType().isPresent()
            ? List.of(new TextConstructor(leafValue, origin))
            : children(path, links);
    return new ElementConstructor(
        prefix, new Name(step.namespace(), step.localName()), content, origin);
  }

  /** {@code ns0}, {@code ns1} … per namespace in the order met; none for no namespace. */
  private String prefix(String namespace) {
    if (namespace.isEmpty()) {
      return "";
    }
    return prefixes.computeIfAbsent(namespace, ns -> "ns" + prefixes.size());
  }

  private void report(String code, AuthoringId at, String message) {
    found.add(new Diagnostic(Severity.ERROR, code, new AtAuthoringId(at), message));
  }
}
