package io.flottila.mapping.service;

import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.ValueType;
import java.util.Locale;
import java.util.Optional;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A field of a structure type (ADR-0007, ADR-0008), on the wire.
 *
 * @param kind {@code element} or {@code attribute}
 * @param step the last step of the field's path, for example {@code @id} or {@code Q{urn:a}Order}
 * @param namespace the namespace, {@code ""} when the name has none
 * @param localName the local name
 * @param min the effective minimum occurrence
 * @param max the effective maximum occurrence; absent when it is unbounded
 * @param valueType the XPath name of a leaf field's value type, for example {@code xs:date}
 * @param nillable whether the field may carry {@code xsi:nil}
 * @param type the id of the structure type with a structure field's child fields
 */
public record FieldDto(
    @Schema(
            required = true,
            enumeration = {"element", "attribute"})
        String kind,
    @Schema(required = true) String step,
    @Schema(required = true) String namespace,
    @Schema(required = true) String localName,
    @Schema(required = true) long min,
    @Schema(nullable = false) Optional<Long> max,
    @Schema(nullable = false) Optional<String> valueType,
    @Schema(required = true) boolean nillable,
    @Schema(nullable = false) Optional<String> type) {

  static FieldDto of(Field field) {
    FieldPath.Step step = field.step();
    return new FieldDto(
        step.kind().name().toLowerCase(Locale.ROOT),
        step.toString(),
        step.namespace(),
        step.localName(),
        field.occurrence().min(),
        Optional.of(field.occurrence().max()).filter(max -> max != Occurrence.UNBOUNDED),
        field.valueType().map(ValueType::typeName),
        field.nillable(),
        field.type());
  }
}
