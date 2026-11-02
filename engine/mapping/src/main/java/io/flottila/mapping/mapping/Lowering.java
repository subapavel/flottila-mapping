package io.flottila.mapping.mapping;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import io.flottila.mapping.mapping.internal.FieldPathText;
import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Structure;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Validation stage 3 and lowering of a mapping model to IR (ADR-0006, ADR-0011, ADR-0022; #26).
 * Spec 1 lowers field links: a target field mapping whose {@code result} is a source-field box
 * becomes {@code TargetSlots} over that box's {@code SourceQueue}, under the root created once.
 *
 * <p>Stage 3 reports, each at its authoring id:
 *
 * <ul>
 *   <li>a source or target field path the structure lacks: {@code orphaned-reference};
 *   <li>a field that is no leaf element under the root, such as an attribute or the root itself:
 *       {@code unsupported-field};
 *   <li>a {@code result} of {@code null}: {@code unconnected-target-field};
 *   <li>a {@code result} that is a function or UDF box: {@code unsupported-box-kind}, and an
 *       unresolved box: {@code unresolved-function}.
 * </ul>
 *
 * <p>Only the box {@code result} names is checked: a box it does not reach is not, and a refused
 * function box's inputs are not either. A refused target field's boxes are not checked.
 */
public final class Lowering {

  /** The variable that holds the root's slot number. */
  private static final String ROOT_SLOT = "root";

  /** The variable that holds a slot's value in the body of its {@code TargetSlots}. */
  private static final String VALUE = "value";

  /** A target field mapping that lowers: its place in target field order, field and queue. */
  private record Link(int position, Field field, AuthoringId mapping, SourceQueue queue) {}

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
    List<FieldPath> order = target.children(target.rootPath());
    List<Link> links = new ArrayList<>();
    model
        .targetFieldMappings()
        .forEach((path, mapping) -> link(path, mapping, order).ifPresent(links::add));
    if (!found.isEmpty()) {
      return new Refused(found);
    }
    links.sort(Comparator.comparingInt(Link::position));
    FieldPath.Step root = target.root().step();
    // the root's namespace is met first, so it is ns0
    String rootPrefix = prefix(root.namespace());
    List<Expr> content = new ArrayList<>();
    for (Link link : links) {
      content.add(slots(link));
    }
    TargetDocument document =
        new TargetDocument(
            rootPrefix, new Name(root.namespace(), root.localName()), ROOT_SLOT, content);
    // the IR is re-checked after lowering (ADR-0006); a refusal here is a bug of this class
    IrVerifier.verify(document);
    return new Lowered(document);
  }

  /**
   * The link of the target field at {@code path}, or empty once the reason it does not lower is
   * reported: its field first, then its {@code result}.
   *
   * @param order the target root's child fields in target field order
   */
  private Optional<Link> link(String path, TargetFieldMapping mapping, List<FieldPath> order) {
    return leaf(target, path, mapping.id())
        .flatMap(
            field ->
                queue(mapping)
                    .map(
                        queue ->
                            new Link(
                                order.indexOf(field),
                                target.field(field).orElseThrow(),
                                mapping.id(),
                                queue)));
  }

  /**
   * The path of the leaf element under the root that {@code text} names in {@code structure}, or
   * empty once the reason it names none is reported at {@code at}.
   */
  private Optional<FieldPath> leaf(Structure structure, String text, AuthoringId at) {
    Optional<FieldPath> path = resolve(structure, text);
    if (path.isEmpty()) {
      report(MappingDiagnostics.ORPHANED_REFERENCE, at, "the structure has no field " + text);
      return Optional.empty();
    }
    Field field = structure.field(path.get()).orElseThrow();
    if (path.get().steps().size() != 2
        || field.step().kind() != FieldKind.ELEMENT
        || field.valueType().isEmpty()) {
      report(
          MappingDiagnostics.UNSUPPORTED_FIELD,
          at,
          text + " is no leaf element under the root, the only field this engine maps yet");
      return Optional.empty();
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

  /** The queue {@code mapping}'s {@code result} reads, or empty once its refusal is reported. */
  private Optional<SourceQueue> queue(TargetFieldMapping mapping) {
    if (mapping.result().isEmpty()) {
      report(
          MappingDiagnostics.UNCONNECTED_TARGET_FIELD,
          mapping.id(),
          "the target field mapping's result is not connected");
      return Optional.empty();
    }
    AuthoringId id = mapping.result().get();
    return switch (mapping.boxes().get(id)) {
      case SourceFieldBox box ->
          leaf(source, box.field(), id)
              .map(field -> new SourceQueue(names(field), contextDepth(box, field), id));
      case StandardFunctionBox box -> unsupportedBox(id, "the function " + box.fn());
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

  private Optional<SourceQueue> unsupportedBox(AuthoringId id, String what) {
    report(
        MappingDiagnostics.UNSUPPORTED_BOX_KIND,
        id,
        what + " cannot be compiled yet; only a source-field box can feed a target field");
    return Optional.empty();
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

  private TargetSlots slots(Link link) {
    FieldPath.Step step = link.field().step();
    AuthoringId origin = link.mapping();
    return new TargetSlots(
        link.queue(),
        new VarRef(ROOT_SLOT, AtomicType.INTEGER, origin),
        link.field().occurrence().min(),
        link.field().occurrence().max(),
        VALUE,
        new ElementConstructor(
            prefix(step.namespace()),
            new Name(step.namespace(), step.localName()),
            List.of(new TextConstructor(new VarRef(VALUE, AtomicType.STRING, origin), origin)),
            origin),
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
