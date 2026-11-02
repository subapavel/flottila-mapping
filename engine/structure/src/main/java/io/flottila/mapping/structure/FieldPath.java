package io.flottila.mapping.structure;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The identity of a field (ADR-0007): the kind, namespace and local name of every step from the
 * root down to the field. Its text is EQNames joined by {@code /}, with {@code @} for attributes
 * and a bare name when there is no namespace, for example {@code /Q{urn:a}Order/Item/@id}.
 */
public record FieldPath(List<Step> steps) {

  public FieldPath {
    steps = List.copyOf(steps);
  }

  /** The path of a root field. */
  public static FieldPath of(Step root) {
    return new FieldPath(List.of(root));
  }

  /** The path of a child field of this one. */
  public FieldPath child(Step step) {
    List<Step> longer = new ArrayList<>(steps);
    longer.add(step);
    return new FieldPath(longer);
  }

  @Override
  public String toString() {
    return steps.stream().map(Step::toString).collect(Collectors.joining("/", "/", ""));
  }

  /** One step of a field path. The namespace is {@code ""} when the name has none. */
  public record Step(FieldKind kind, String namespace, String localName) {

    @Override
    public String toString() {
      String name = namespace.isEmpty() ? localName : "Q{" + namespace + "}" + localName;
      return kind == FieldKind.ATTRIBUTE ? "@" + name : name;
    }
  }
}
