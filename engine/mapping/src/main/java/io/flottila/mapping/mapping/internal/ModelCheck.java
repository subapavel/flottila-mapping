package io.flottila.mapping.mapping.internal;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.mapping.AtAuthoringId;
import io.flottila.mapping.mapping.Box;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.Severity;
import io.flottila.mapping.mapping.SourceFieldBox;
import io.flottila.mapping.mapping.StandardFunctionBox;
import io.flottila.mapping.mapping.TargetFieldMapping;
import io.flottila.mapping.mapping.UdfBox;
import io.flottila.mapping.mapping.UnresolvedFunctionBox;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Stage 2 of loading, the model check (ADR-0011): ids unique across the mapping, references that
 * resolve inside their target field mapping, an acyclic graph, contexts that are proper ancestors
 * of their field, and declared UDFs. It needs no structure; it works on the path text.
 */
public final class ModelCheck {

  private final MappingModel model;
  private final Set<AuthoringId> allBoxes = new HashSet<>();
  private final List<Diagnostic> found = new ArrayList<>();

  private ModelCheck(MappingModel model) {
    this.model = model;
  }

  /** The stage-2 diagnostics of {@code model}, none when it passes. */
  public static List<Diagnostic> check(MappingModel model) {
    ModelCheck check = new ModelCheck(model);
    check.duplicates();
    model.targetFieldMappings().values().forEach(check::targetFieldMapping);
    return List.copyOf(check.found);
  }

  /** Target field mappings and boxes share one id space; a repeated id is reported once. */
  private void duplicates() {
    Map<AuthoringId, Integer> uses = new HashMap<>();
    for (TargetFieldMapping mapping : model.targetFieldMappings().values()) {
      uses.merge(mapping.id(), 1, Integer::sum);
      for (AuthoringId box : mapping.boxes().keySet()) {
        uses.merge(box, 1, Integer::sum);
        allBoxes.add(box);
      }
    }
    uses.forEach(
        (id, count) -> {
          if (count > 1) {
            add(
                "duplicate-authoring-id",
                id,
                "the id " + id.value() + " is used " + count + " times");
          }
        });
  }

  private void targetFieldMapping(TargetFieldMapping mapping) {
    mapping.result().ifPresent(result -> reference(mapping, mapping.id(), "result", result));
    mapping
        .boxes()
        .forEach(
            (id, box) -> {
              List<Optional<AuthoringId>> inputs = inputs(box);
              for (int k = 0; k < inputs.size(); k++) {
                String what = "input " + (k + 1);
                inputs.get(k).ifPresent(input -> reference(mapping, id, what, input));
              }
              switch (box) {
                case SourceFieldBox s ->
                    s.context()
                        .filter(context -> !FieldPathText.isProperAncestor(context, s.field()))
                        .ifPresent(
                            context ->
                                add(
                                    "context-not-ancestor",
                                    id,
                                    "the context "
                                        + context
                                        + " is not a proper ancestor of "
                                        + s.field()));
                case UdfBox u when !model.udfs().containsKey(u.udf()) ->
                    add("undeclared-udf", id, "the UDF " + u.udf() + " is not declared in udfs");
                case StandardFunctionBox _, UdfBox _, UnresolvedFunctionBox _ -> {
                  // no check of its own
                }
              }
            });
    new Cycles(mapping).report();
  }

  /** A reference by {@code consumer} must name a box of its own target field mapping. */
  private void reference(
      TargetFieldMapping mapping, AuthoringId consumer, String what, AuthoringId target) {
    if (mapping.boxes().containsKey(target)) {
      return;
    }
    if (allBoxes.contains(target)) {
      add(
          "cross-target-field-reference",
          consumer,
          what + " names " + target.value() + ", a box of another target field mapping");
    } else {
      add(
          "unknown-box-reference",
          consumer,
          what + " names " + target.value() + ", which is no box of this target field mapping");
    }
  }

  private static List<Optional<AuthoringId>> inputs(Box box) {
    return switch (box) {
      case SourceFieldBox _ -> List.of();
      case StandardFunctionBox f -> f.inputs();
      case UdfBox u -> u.inputs();
      case UnresolvedFunctionBox x -> x.inputs();
    };
  }

  private void add(String code, AuthoringId at, String message) {
    found.add(new Diagnostic(Severity.ERROR, code, new AtAuthoringId(at), message));
  }

  /**
   * The cycles of one target field mapping's graph, by Tarjan's strongly connected components. A
   * component of two or more boxes, or one box that feeds itself, is reported once, at its smallest
   * id.
   */
  private final class Cycles {

    private final TargetFieldMapping mapping;
    private final Map<AuthoringId, Integer> index = new HashMap<>();
    private final Map<AuthoringId, Integer> low = new HashMap<>();
    private final Deque<AuthoringId> stack = new ArrayDeque<>();
    private final Set<AuthoringId> onStack = new HashSet<>();

    Cycles(TargetFieldMapping mapping) {
      this.mapping = mapping;
    }

    void report() {
      for (AuthoringId box : mapping.boxes().keySet()) {
        if (!index.containsKey(box)) {
          visit(box);
        }
      }
    }

    /** The boxes of this target field mapping that {@code box} reads. */
    private Set<AuthoringId> inputsOf(AuthoringId box) {
      return inputs(mapping.boxes().get(box)).stream()
          .flatMap(Optional::stream)
          .filter(mapping.boxes()::containsKey)
          .collect(Collectors.toSet());
    }

    private void visit(AuthoringId box) {
      index.put(box, index.size());
      low.put(box, index.get(box));
      stack.push(box);
      onStack.add(box);
      Set<AuthoringId> inputs = inputsOf(box);
      for (AuthoringId input : inputs) {
        if (!index.containsKey(input)) {
          visit(input);
          low.put(box, Math.min(low.get(box), low.get(input)));
        } else if (onStack.contains(input)) {
          low.put(box, Math.min(low.get(box), index.get(input)));
        }
      }
      if (low.get(box).equals(index.get(box))) {
        List<AuthoringId> component = new ArrayList<>();
        AuthoringId member;
        do {
          member = stack.pop();
          onStack.remove(member);
          component.add(member);
        } while (!member.equals(box));
        if (component.size() > 1 || inputs.contains(box)) {
          AuthoringId smallest =
              Collections.min(component, Comparator.comparing(AuthoringId::value));
          add(
              "box-cycle",
              smallest,
              "the boxes "
                  + component.stream()
                      .map(AuthoringId::value)
                      .sorted()
                      .collect(Collectors.joining(", "))
                  + " form a cycle");
        }
      }
    }
  }
}
