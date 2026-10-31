package io.flottila.mapping.mapping.internal;

import com.github.erosb.jsonsKema.IJsonNumber;
import com.github.erosb.jsonsKema.IJsonObject;
import com.github.erosb.jsonsKema.IJsonString;
import com.github.erosb.jsonsKema.IJsonValue;
import com.github.erosb.jsonsKema.JsonObject;
import com.github.erosb.jsonsKema.JsonPointer;
import com.github.erosb.jsonsKema.JsonString;
import com.github.erosb.jsonsKema.Keyword;
import com.github.erosb.jsonsKema.OneOfValidationFailure;
import com.github.erosb.jsonsKema.Schema;
import com.github.erosb.jsonsKema.SchemaLoader;
import com.github.erosb.jsonsKema.ValidationFailure;
import com.github.erosb.jsonsKema.Validator;
import io.flottila.mapping.mapping.AtPointer;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.Severity;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stage 1 of loading (ADR-0011): json-sKema validates the document against the contract's
 * mapping-model schema, packed into this module's jar. Each failure becomes a diagnostic at the
 * JSON pointer of the instance, its code by the failing keyword ("Stage 1 and 2 codes").
 */
public final class SchemaStage {

  /** The format this engine reads and writes. */
  public static final int FORMAT_VERSION = 1;

  /** Where the contract holds the {@code oneOf} of the box kinds. */
  private static final JsonPointer BOX_KINDS = new JsonPointer("$defs", "box", "oneOf");

  private static final Schemas SCHEMAS = Schemas.load();

  private SchemaStage() {}

  /**
   * The stage-1 diagnostics of {@code document}, none when it is valid. A newer {@code
   * formatVersion} is refused with that one diagnostic and nothing else is validated.
   */
  public static List<Diagnostic> check(IJsonValue document) {
    if (isNewer(document)) {
      return List.of(
          new Diagnostic(
              Severity.ERROR,
              "format-version-unsupported",
              new AtPointer("/formatVersion"),
              "formatVersion is newer than " + FORMAT_VERSION + ", the newest this engine reads"));
    }
    Findings found = new Findings();
    found.add(SCHEMAS.document(), document);
    // json-sKema 0.32.0 keeps only the first member's result of a patternProperties map (it takes
    // firstOrNull of the members' results, observed), so a later member's failure is lost. Every
    // member of every map is validated again on its own; Findings drops the repeats.
    for (IJsonValue mapping : members(document, "targetFieldMappings")) {
      found.add(SCHEMAS.targetFieldMapping(), mapping);
      for (IJsonValue box : members(mapping, "boxes")) {
        found.add(SCHEMAS.box(), box);
        for (IJsonValue param : members(box, "params")) {
          found.add(SCHEMAS.paramValue(), param);
        }
      }
    }
    for (IJsonValue udf : members(document, "udfs")) {
      found.add(SCHEMAS.udfDeclaration(), udf);
      for (IJsonValue param : members(udf, "params")) {
        found.add(SCHEMAS.udfParamType(), param);
      }
    }
    return found.diagnostics();
  }

  private static boolean isNewer(IJsonValue document) {
    return document instanceof IJsonObject root
        && root.get("formatVersion") instanceof IJsonNumber version
        && ((BigDecimal) version.getValue()).compareTo(BigDecimal.valueOf(FORMAT_VERSION)) > 0;
  }

  /** The values of the object {@code name} of {@code value}; none when there is no such object. */
  private static Collection<IJsonValue> members(IJsonValue value, String name) {
    return value instanceof IJsonObject object && object.get(name) instanceof IJsonObject map
        ? map.getProperties().values()
        : List.of();
  }

  /** The RFC 6901 text of a pointer. */
  private static String text(JsonPointer pointer) {
    StringBuilder out = new StringBuilder();
    for (String segment : pointer.getSegments()) {
      out.append('/').append(segment.replace("~", "~0").replace("/", "~1"));
    }
    return out.toString();
  }

  private static JsonPointer pointerOf(ValidationFailure failure) {
    return failure.getInstance().getLocation().getPointer();
  }

  /** The diagnostics of one document, each code at each pointer once. */
  private static final class Findings {

    private record Key(String pointer, String code) {}

    private final Map<Key, Diagnostic> found = new LinkedHashMap<>();

    void add(Schema schema, IJsonValue value) {
      ValidationFailure failure = Validator.forSchema(schema).validate(value);
      if (failure != null) {
        translate(failure);
      }
    }

    List<Diagnostic> diagnostics() {
      return List.copyOf(found.values());
    }

    private void translate(ValidationFailure failure) {
      if (failure instanceof OneOfValidationFailure oneOf) {
        if (BOX_KINDS.equals(oneOf.getSchema().getLocation().getPointer())) {
          box(oneOf);
        } else {
          leaf(oneOf); // a root selector or a parameter value that is neither kind
        }
      } else if (failure.getCauses().isEmpty()) {
        leaf(failure);
      } else {
        failure.getCauses().forEach(this::translate);
      }
    }

    /**
     * A box no branch accepts. A branch whose {@code const} fits the box's {@code kind} has no
     * failure at {@code kind}; when exactly one such branch exists its failures are reported,
     * otherwise the kind matches no branch.
     */
    private void box(OneOfValidationFailure oneOf) {
      JsonPointer kind = pointerOf(oneOf).plus("kind");
      List<ValidationFailure> matched =
          oneOf.getCauses().stream()
              .filter(branch -> branch.flatten().stream().noneMatch(f -> kind.equals(pointerOf(f))))
              .toList();
      if (matched.size() == 1) {
        translate(matched.getFirst());
      } else {
        put("unknown-box-kind", text(kind), "kind is none of source, function, udf and unresolved");
      }
    }

    private void leaf(ValidationFailure failure) {
      Keyword keyword = failure.getKeyword();
      String code =
          switch (keyword) {
            case FALSE -> "unknown-member"; // additionalProperties: false
            case REQUIRED -> "missing-member";
            case TYPE -> "wrong-type";
            case PATTERN -> "pattern-mismatch";
            case ENUM, CONST, MIN_ITEMS, MIN_PROPERTIES, UNIQUE_ITEMS -> "invalid-value";
            default -> "schema-violation"; // fails closed on any other keyword
          };
      String message =
          keyword == Keyword.FALSE ? "not a member here in formatVersion 1" : failure.getMessage();
      put(code, text(pointerOf(failure)), message);
    }

    private void put(String code, String pointer, String message) {
      found.putIfAbsent(
          new Key(pointer, code),
          new Diagnostic(Severity.ERROR, code, new AtPointer(pointer), message));
    }
  }

  /** The contract's schema, and the schemas of the map values it validates one by one. */
  private record Schemas(
      Schema document,
      Schema targetFieldMapping,
      Schema box,
      Schema paramValue,
      Schema udfDeclaration,
      Schema udfParamType) {

    static Schemas load() {
      IJsonObject contract;
      try (InputStream in = SchemaStage.class.getResourceAsStream("mapping-model.schema.json")) {
        contract = (IJsonObject) StrictJsonReader.read(in.readAllBytes());
      } catch (IOException | MalformedJsonException e) {
        throw new IllegalStateException("the packed mapping-model schema cannot be read", e);
      }
      return new Schemas(
          new SchemaLoader(contract).load(),
          definition(contract, "targetFieldMapping"),
          definition(contract, "box"),
          definition(contract, "paramValue"),
          definition(contract, "udfDeclaration"),
          definition(contract, "udfParamType"));
    }

    /**
     * A schema whose root refers to one of the contract's {@code $defs}. It carries the contract's
     * {@code $defs} itself: json-sKema 0.32.0 resolves a {@code $ref} into the contract's {@code
     * urn:} id to a URI it cannot parse (observed).
     */
    private static Schema definition(IJsonObject contract, String name) {
      Map<IJsonString, IJsonValue> root = new LinkedHashMap<>();
      root.put(new JsonString("$schema"), contract.get("$schema"));
      root.put(new JsonString("$defs"), contract.get("$defs"));
      root.put(new JsonString("$ref"), new JsonString("#/$defs/" + name));
      return new SchemaLoader(new JsonObject(root)).load();
    }
  }
}
