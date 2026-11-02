package io.flottila.mapping.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.test.junit.QuarkusTest;
import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The drift test of the committed contract (ADR-0015, ADR-0024). smallrye-openapi writes {@code
 * contract/openapi.json} when the application is built, which a {@code @QuarkusTest} does, and the
 * test reads that file. Unions and required lists are compared with the service's compiled classes
 * (found by simple name under {@code target/classes}) and with the shapes the #28 design lists.
 */
@QuarkusTest
class OpenApiContractTest {

  private static final String SCHEMAS = "#/components/schemas/";

  /** The unions and their kinds (ADR-0024, "Results"). */
  private static final Map<String, Map<String, String>> UNIONS =
      Map.of(
          "LocationDto",
              Map.of(
                  "pointer", "PointerLocation",
                  "authoring-id", "AuthoringIdLocation",
                  "file-position", "FilePositionLocation"),
          "TestResult", Map.of("output", "TestOutput", "refused", "TestRefused"),
          "StructureResponse", Map.of("loaded", "StructureLoaded", "refused", "StructureRefused"));

  /**
   * Properties and, after the bar, the required ones (#28 design, "Endpoints", "Shared shapes").
   */
  private static final Map<String, String> RECORDS =
      Map.ofEntries(
          Map.entry("MappingSummary", "id name | id name"),
          Map.entry("CreateMappingRequest", "id source target | id source target"),
          Map.entry("StructureChoice", "bundle root | bundle root"),
          Map.entry("TestRequest", "input model | input model"),
          Map.entry("StructureRequest", "base bundle root | base bundle root"),
          Map.entry("TestOutput", "diagnostics kind output | diagnostics kind output"),
          Map.entry("TestRefused", "diagnostics kind | diagnostics kind"),
          Map.entry("StructureLoaded", "fingerprint kind root types | fingerprint kind root types"),
          Map.entry("StructureRefused", "diagnostics kind | diagnostics kind"),
          Map.entry(
              "FieldDto",
              "kind localName max min namespace nillable step type valueType"
                  + " | kind localName min namespace nillable step"),
          Map.entry(
              "DiagnosticDto", "code location message severity | code location message severity"),
          Map.entry("PointerLocation", "kind pointer | kind pointer"),
          Map.entry("AuthoringIdLocation", "authoringId kind | authoringId kind"),
          Map.entry("FilePositionLocation", "column file kind line | column file kind line"));

  @Test
  void everyOneOfEqualsThePermittedSubclasses() throws Exception {
    JsonNode schemas = schemas();
    Map<String, Class<?>> classes = serviceClasses();

    assertThat(names(schemas)).containsAll(UNIONS.keySet());
    for (Map.Entry<String, Map<String, String>> union : UNIONS.entrySet()) {
      JsonNode schema = schemas.path(union.getKey());
      Set<String> refs = new TreeSet<>();
      for (String subtype : union.getValue().values()) {
        refs.add(SCHEMAS + subtype);
      }
      assertThat(oneOf(schema)).as(union.getKey()).isEqualTo(refs);
      assertThat(schema.path("discriminator").path("propertyName").textValue())
          .as(union.getKey())
          .isEqualTo("kind");
      Map<String, String> mapping = new TreeMap<>();
      schema
          .path("discriminator")
          .path("mapping")
          .properties()
          .forEach(e -> mapping.put(e.getKey(), e.getValue().textValue()));
      Map<String, String> expected = new TreeMap<>();
      union.getValue().forEach((kind, subtype) -> expected.put(kind, SCHEMAS + subtype));
      assertThat(mapping).as(union.getKey()).isEqualTo(expected);
      union
          .getValue()
          .forEach(
              (kind, subtype) ->
                  assertThat(
                          schemas
                              .path(subtype)
                              .path("properties")
                              .path("kind")
                              .path("const")
                              .textValue())
                      .as(subtype + ".kind")
                      .isEqualTo(kind));
    }
    // every sealed service type that is a schema is a oneOf of exactly its permitted subclasses
    int sealed = 0;
    for (Class<?> type : classes.values()) {
      if (type.isSealed() && schemas.has(type.getSimpleName())) {
        sealed++;
        Set<String> permitted = new TreeSet<>();
        for (Class<?> sub : type.getPermittedSubclasses()) {
          permitted.add(SCHEMAS + sub.getSimpleName());
        }
        assertThat(oneOf(schemas.path(type.getSimpleName())))
            .as(type.getName())
            .isEqualTo(permitted);
      }
    }
    assertThat(sealed)
        .as("sealed service types among the schemas")
        .isGreaterThanOrEqualTo(UNIONS.size());
  }

  @Test
  void requiredEqualsTheNonOptionalComponents() throws Exception {
    JsonNode schemas = schemas();
    Map<String, Class<?>> classes = serviceClasses();

    for (Map.Entry<String, String> entry : RECORDS.entrySet()) {
      String[] shape = entry.getValue().split(" \\| ");
      JsonNode schema = schemas.path(entry.getKey());
      assertThat(schema.isObject()).as("schema %s", entry.getKey()).isTrue();
      assertThat(names(schema.path("properties")))
          .as(entry.getKey() + " properties")
          .isEqualTo(words(shape[0]));
      assertThat(strings(schema.path("required")))
          .as(entry.getKey() + " required")
          .isEqualTo(words(shape[1]));
    }
    // every service record that is a schema: required = the components that are no Optional
    int records = 0;
    for (Class<?> type : classes.values()) {
      if (type.isRecord() && schemas.has(type.getSimpleName())) {
        records++;
        Set<String> required = new TreeSet<>();
        for (RecordComponent c : type.getRecordComponents()) {
          if (c.getType() != Optional.class) {
            required.add(c.getName());
          }
        }
        assertThat(strings(schemas.path(type.getSimpleName()).path("required")))
            .as(type.getName())
            .isEqualTo(required);
      }
    }
    assertThat(records)
        .as("service records among the schemas")
        .isGreaterThanOrEqualTo(RECORDS.size());
  }

  @Test
  void hasNoServersEntry() throws IOException {
    assertThat(names(contract())).contains("openapi", "paths").doesNotContain("servers");
  }

  @Test
  void everyRelativeRefNamesAFileInContract() throws IOException {
    JsonNode contract = contract();
    List<String> refs = new ArrayList<>();
    collectRefs(contract, refs);
    List<String> relative = refs.stream().filter(r -> r.startsWith("./")).toList();

    // the design's three: the root selector, the test run's model and the save's body
    JsonNode schemas = contract.path("components").path("schemas");
    assertThat(
            schemas
                .path("StructureChoice")
                .path("properties")
                .path("root")
                .path("$ref")
                .textValue())
        .isEqualTo("./mapping-model.schema.json#/$defs/rootSelector");
    assertThat(
            schemas.path("TestRequest").path("properties").path("model").path("$ref").textValue())
        .isEqualTo("./mapping-model.schema.json");
    assertThat(
            contract
                .path("paths")
                .path("/api/mappings/{id}")
                .path("put")
                .path("requestBody")
                .path("content")
                .path("application/json")
                .path("schema")
                .path("$ref")
                .textValue())
        .isEqualTo("./mapping-model.schema.json");
    assertThat(relative).isNotEmpty();
    for (String ref : relative) {
      String[] parts = ref.substring(2).split("#", 2);
      Path file = contractDirectory().resolve(parts[0]);
      assertThat(file).as(ref).isRegularFile().hasParent(contractDirectory());
      if (parts.length == 2) {
        JsonNode target = Wire.read(Files.readAllBytes(file)).at(parts[1]);
        assertThat(target.isMissingNode()).as("%s resolves", ref).isFalse();
      }
    }
  }

  // --- helpers ---

  private static Path contractDirectory() {
    return Fixtures.repositoryRoot().resolve("contract");
  }

  private static JsonNode contract() throws IOException {
    return Wire.read(Files.readAllBytes(contractDirectory().resolve("openapi.json")));
  }

  private static JsonNode schemas() throws IOException {
    return contract().path("components").path("schemas");
  }

  private static Set<String> oneOf(JsonNode schema) {
    Set<String> refs = new TreeSet<>();
    for (JsonNode branch : schema.path("oneOf")) {
      refs.add(branch.path("$ref").textValue());
    }
    return refs;
  }

  private static Set<String> names(JsonNode object) {
    Set<String> names = new TreeSet<>();
    object.fieldNames().forEachRemaining(names::add);
    return names;
  }

  private static Set<String> strings(JsonNode array) {
    Set<String> strings = new TreeSet<>();
    for (JsonNode s : array) {
      strings.add(s.textValue());
    }
    return strings;
  }

  private static Set<String> words(String text) {
    return new TreeSet<>(Arrays.asList(text.trim().split(" +")));
  }

  private static void collectRefs(JsonNode node, List<String> refs) {
    if (node.isObject()) {
      node.properties()
          .forEach(
              e -> {
                if (e.getKey().equals("$ref") && e.getValue().isTextual()) {
                  refs.add(e.getValue().textValue());
                } else {
                  collectRefs(e.getValue(), refs);
                }
              });
    } else if (node.isArray()) {
      node.forEach(child -> collectRefs(child, refs));
    }
  }

  /** The service's compiled classes by simple name: the DTOs the schemas are named after. */
  private static Map<String, Class<?>> serviceClasses() throws IOException, ClassNotFoundException {
    Path classes = Path.of("target", "classes");
    Map<String, Class<?>> found = new HashMap<>();
    List<String> names;
    try (Stream<Path> walk = Files.walk(classes)) {
      names =
          walk.map(p -> classes.relativize(p).toString())
              .filter(p -> p.endsWith(".class") && p.startsWith("io/flottila/mapping/service"))
              .map(p -> p.substring(0, p.length() - ".class".length()).replace('/', '.'))
              .toList();
    }
    ClassLoader loader = OpenApiContractTest.class.getClassLoader();
    for (String name : names) {
      Class<?> type = Class.forName(name, false, loader);
      found.put(type.getSimpleName(), type);
    }
    return found;
  }
}
