package io.flottila.mapping.service;

import io.flottila.mapping.mapping.AtAuthoringId;
import io.flottila.mapping.mapping.AtFilePosition;
import io.flottila.mapping.mapping.AtPointer;
import io.flottila.mapping.mapping.Location;
import org.eclipse.microprofile.openapi.annotations.media.DiscriminatorMapping;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/** Where a diagnostic points (ADR-0015), on the wire: a union on {@code kind} (ADR-0024). */
@Schema(
    oneOf = {PointerLocation.class, AuthoringIdLocation.class, FilePositionLocation.class},
    discriminatorProperty = "kind",
    discriminatorMapping = {
      @DiscriminatorMapping(value = PointerLocation.KIND, schema = PointerLocation.class),
      @DiscriminatorMapping(value = AuthoringIdLocation.KIND, schema = AuthoringIdLocation.class),
      @DiscriminatorMapping(value = FilePositionLocation.KIND, schema = FilePositionLocation.class)
    })
public sealed interface LocationDto
    permits PointerLocation, AuthoringIdLocation, FilePositionLocation {

  static LocationDto of(Location location) {
    return switch (location) {
      case AtPointer p -> new PointerLocation(p.pointer());
      case AtAuthoringId a -> new AuthoringIdLocation(a.id().value());
      case AtFilePosition f -> new FilePositionLocation(f.file(), f.line(), f.column());
    };
  }
}
