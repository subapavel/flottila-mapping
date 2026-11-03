package io.flottila.mapping.mapping;

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
 * parent's element: the root's, created once, or a structure field's (ADR-0006 since #52). An
 * unmapped structure field whose effective occurrence is {@code n..n} with {@code n > 0} becomes
 * {@code TargetRepeat} of n copies, whatever is mapped below it, and any other unmapped field is
 * left out with its subtree (ADR-0006 "Target fields"; #63). The slot-number variable of a field at
 * depth d is {@code slot<d>}, a mapped field's value variable {@code value<d>}, and a field reads
 * its parent's slot number, the root's {@code root} or the parent's {@code slot<d - 1>}. A leaf's
 * element holds its value, a structure field's its children in target field order. A source-field
 * box gives its {@code SourceQueue}, of a leaf or of a structure field (ADR-0008; #63). A standard
 * function box whose function the catalogue holds gives, by its execution kind, a {@code FunCall}
 * over its inputs' queues and then its params as {@code Literal}s for a context or queue function,
 * or a {@code Lift} over its inputs' queues whose body is the atomic {@code FunCall} over the slot
 * variables and then the params for a single-value function (ADR-0006, ADR-0025). A param the box
 * leaves out is its catalogue default. A box that feeds several inputs is lowered once per use.
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
 *   <li>a {@code result} of {@code null}: {@code unconnected-target-field};
 *   <li>a UDF box, or a function box whose function the catalogue does not hold yet: {@code
 *       unsupported-box-kind}; an unresolved box: {@code unresolved-function};
 *   <li>a function box against its catalogue entry: more inputs than the entry has, {@code
 *       wrong-arity}; an input slot of the entry that is {@code null} or absent, {@code
 *       unconnected-input}; a param key the entry lacks, {@code unknown-parameter}; a table for a
 *       string param, {@code wrong-parameter-type}; a string outside the values of a param that
 *       lists them, {@code invalid-parameter-value}.
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

  /** A target field mapping that lowers: its field and queue. */
  private record Link(Field field, AuthoringId mapping, Expr queue) {}

  private final MappingModel model;
  private final Structure source;
  private final Structure target;
  private final List<Diagnostic> found = new ArrayList<>();

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
      // the walk met an unmapped field beyond the recursion cap
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
              for (int depth = UNDER_ROOT; depth < steps.size(); depth++) {
                FieldPath parent = new FieldPath(steps.subList(0, depth));
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
   * The call of {@code box}'s function over its inputs' queues and then its params, or empty once
   * its refusals are reported. Every defect of the box against its catalogue entry is reported at
   * the box before any input is lowered. Each param is a {@code Literal} at the box: the string the
   * box gives, or the entry's default when the box leaves the param out (ADR-0025).
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
    if (found.size() > reported) {
      return Optional.empty();
    }
    List<Expr> queues = new ArrayList<>();
    for (Optional<AuthoringId> slot : slots) {
      Optional<Expr> arg = queue(mapping, slot.orElseThrow());
      if (arg.isEmpty()) {
        return Optional.empty();
      }
      queues.add(arg.get());
    }
    List<Expr> params = new ArrayList<>();
    for (FunctionCatalogue.Param param : entry.params()) {
      // the box's string, which the check above accepted, or the default
      ParamValue given = box.params().getOrDefault(param.name(), new Text(param.fallback()));
      params.add(new Literal(((Text) given).value(), id));
    }
    return Optional.of(
        switch (entry.executionKind()) {
          case SINGLE -> lift(box.fn(), queues, params, id);
          case CONTEXT, QUEUE -> contextCall(box.fn(), queues, params, id);
        });
  }

  /** The {@code FunCall} of context or queue function {@code fn}: its queues, then its params. */
  private static FunCall contextCall(
      String fn, List<Expr> queues, List<Expr> params, AuthoringId id) {
    List<Expr> args = new ArrayList<>(queues);
    args.addAll(params);
    List<IrType> types = new ArrayList<>(Collections.nCopies(queues.size(), QUEUE));
    types.addAll(Collections.nCopies(params.size(), AtomicType.STRING));
    return new FunCall(new FunctionRef(fn, types, QUEUE), args, id);
  }

  /**
   * The {@code Lift} of single-value function {@code fn} over {@code queues} (ADR-0006 since #51):
   * one slot variable {@code in1} … per queue, and as body the atomic {@code FunCall} over them and
   * then the params. Each node carries the box's id.
   */
  private static Lift lift(String fn, List<Expr> queues, List<Expr> params, AuthoringId id) {
    List<String> slotVars = new ArrayList<>();
    List<Expr> args = new ArrayList<>();
    for (int k = 1; k <= queues.size(); k++) {
      slotVars.add("in" + k);
      args.add(new VarRef("in" + k, AtomicType.STRING, id));
    }
    args.addAll(params);
    FunctionRef function =
        new FunctionRef(fn, Collections.nCopies(args.size(), AtomicType.STRING), AtomicType.STRING);
    return new Lift(queues, slotVars, new FunCall(function, args, id), id);
  }

  /**
   * Reports what is wrong with the param {@code key} of {@code box} against {@code entry}, at the
   * box: a key the entry lacks, {@code unknown-parameter}; a table, as every param of the catalogue
   * is a string param, {@code wrong-parameter-type}; a string outside the values of a param that
   * lists them, {@code invalid-parameter-value}. A string the param takes, any string when it lists
   * no values, is reported as nothing.
   */
  private void param(
      AuthoringId id, StandardFunctionBox box, FunctionCatalogue.Entry entry, String key) {
    Optional<FunctionCatalogue.Param> param = entry.param(key);
    if (param.isEmpty()) {
      report(MappingDiagnostics.UNKNOWN_PARAMETER, id, box.fn() + " has no parameter " + key);
      return;
    }
    switch (box.params().get(key)) {
      case Table _ ->
          report(
              MappingDiagnostics.WRONG_PARAMETER_TYPE,
              id,
              "the parameter " + key + " of " + box.fn() + " is a string, not a table");
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
      case Text _ -> {}
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
   * n..n} with {@code n > 0}. Every other unmapped child is left out with its subtree. Such a field
   * whose type its path already repeats {@link #RECURSION_CAP} times would be created without end,
   * so it is refused at the model's {@code /target} with {@code unsupported-field} (ADR-0008), and
   * that refusal stops the walk.
   */
  private List<Expr> children(FieldPath parent, Map<FieldPath, Link> links) {
    List<Expr> content = new ArrayList<>();
    for (FieldPath child : target.children(parent)) {
      if (!found.isEmpty()) {
        break;
      }
      Link link = links.get(child);
      Field field = target.field(child).orElseThrow();
      if (link != null) {
        content.add(slots(child, link, links));
      } else if (field.valueType().isEmpty() && repeated(field.occurrence())) {
        // an attribute is a leaf (ADR-0008), so only an element gets here
        if (repeats(child, field) > RECURSION_CAP) {
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
      }
    }
    return content;
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
   * The {@code TargetSlots} of the mapped field at {@code path}: its variables by its depth, its
   * parent's slot number, its effective occurrence, and its element, which holds its value for a
   * leaf and its children for a structure field. Its prefix is taken before its children's, so
   * prefixes follow document order (ADR-0022).
   */
  private TargetSlots slots(FieldPath path, Link link, Map<FieldPath, Link> links) {
    int depth = path.steps().size();
    String slotVar = SLOT + depth;
    String valueVar = VALUE + depth;
    String parentSlot = parentSlot(depth);
    Field field = link.field();
    FieldPath.Step step = field.step();
    AuthoringId origin = link.mapping();
    String prefix = prefix(step.namespace());
    List<Expr> content =
        field.valueType().isPresent()
            ? List.of(new TextConstructor(new VarRef(valueVar, AtomicType.STRING, origin), origin))
            : children(path, links);
    return new TargetSlots(
        link.queue(),
        new VarRef(parentSlot, AtomicType.INTEGER, origin),
        field.occurrence().min(),
        field.occurrence().max(),
        slotVar,
        valueVar,
        new ElementConstructor(
            prefix, new Name(step.namespace(), step.localName()), content, origin),
        origin);
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
