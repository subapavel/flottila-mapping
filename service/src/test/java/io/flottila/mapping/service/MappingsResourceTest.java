package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.CORPUS_MAPPING_ETAG;
import static io.flottila.mapping.service.Fixtures.FINGERPRINT;
import static io.flottila.mapping.service.Fixtures.INPUT;
import static io.flottila.mapping.service.Fixtures.NEW_MAPPING;
import static io.flottila.mapping.service.Fixtures.NEW_MAPPING_ETAG;
import static io.flottila.mapping.service.Fixtures.ORDER;
import static io.flottila.mapping.service.Fixtures.UNWIRED_ETAG;
import static io.flottila.mapping.service.Fixtures.assertBytes;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Fixtures.corpusMapping;
import static io.flottila.mapping.service.Fixtures.unwired;
import static io.flottila.mapping.service.Fixtures.workingCopy;
import static io.flottila.mapping.service.Wire.assertProblem;
import static io.flottila.mapping.service.Wire.createRequest;
import static io.flottila.mapping.service.Wire.described;
import static io.flottila.mapping.service.Wire.testRequest;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.MappingModel;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * {@code /api/mappings} over the temporary workspace (#28; ADR-0014, ADR-0015, ADR-0024). Each test
 * that writes uses a directory of its own. Expected models are corpus files or the engine's
 * canonical form, never the service's answer.
 */
@QuarkusTest
class MappingsResourceTest {

  private static final String CORPUS_ID = "mappings/order-id-copy";

  @TestHTTPResource URI root;

  private Http http() {
    return new Http(root);
  }

  @Test
  void listsIdAndNameSortedById() {
    for (String id : List.of("listing/m", "listing/b/c", "listing/b-c")) {
      TempWorkspace.write(id + ".mapping.json", corpusMapping());
    }
    // never mappings: a dot directory, a name the pattern refuses, a reserved last segment
    for (String file :
        List.of(".hidden/x", "bad name", "d/test").stream()
            .map(f -> "listing/" + f + ".mapping.json")
            .toList()) {
      TempWorkspace.write(file, corpusMapping());
    }

    Http.Reply reply = http().get("api/mappings");

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    assertThat(reply.contentType()).startsWith("application/json");
    List<String> entries = new ArrayList<>();
    List<String> ids = new ArrayList<>();
    for (JsonNode summary : reply.json()) {
      entries.add(summary.path("id").textValue() + " " + summary.path("name").textValue());
      ids.add(summary.path("id").textValue());
    }
    // sorted by id as text: '-' sorts before '/'
    assertThat(entries.stream().filter(e -> e.startsWith("listing/")).toList())
        .containsExactly("listing/b-c b-c", "listing/b/c c", "listing/m m");
    assertThat(entries).contains(CORPUS_ID + " order-id-copy").doesNotContain("links/out out");
    assertThat(ids).isSorted();
  }

  @Test
  void getReturnsCanonicalModelAndEtag() {
    Http.Reply reply = http().get("api/mappings/" + CORPUS_ID);

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    assertThat(reply.contentType()).startsWith("application/json");
    assertBytes(reply.body(), corpusMapping());
    assertThat(reply.header("ETag")).contains(CORPUS_MAPPING_ETAG);

    // a stored file out of canonical form is answered in canonical form, not as its raw bytes
    TempWorkspace.write("getting/reordered.mapping.json", bytes(workingCopy("\"a1\"")));
    Http.Reply reordered = http().get("api/mappings/getting/reordered");

    assertThat(reordered.status()).as("%s", reordered).isEqualTo(200);
    assertBytes(reordered.body(), corpusMapping());
    assertThat(reordered.header("ETag")).contains(CORPUS_MAPPING_ETAG);
  }

  @Test
  void getUnknownIdIs404Problem() {
    assertProblem(http().get("api/mappings/mappings/no-such-mapping"), 404, "not-found");
  }

  /**
   * An encoded slash names the same id. Observed 2026-11-02 on Quarkus 3.40.1.1 with a scratch
   * resource: the router decodes {@code %2F} in {@code {id: .+}}.
   */
  @Test
  void getWithEncodedSlashInId() {
    Http.Reply reply = http().get("api/mappings/mappings%2Forder-id-copy");

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    assertBytes(reply.body(), corpusMapping());
    assertThat(reply.header("ETag")).contains(CORPUS_MAPPING_ETAG);
  }

  @Test
  void createIs201WithModelEtagAndLocation() {
    TempWorkspace.mkdirs("creating");
    String request =
        createRequest("creating/order-to-order", "../structures/skeleton/order.xsd", ORDER);

    Http.Reply reply = http().post("api/mappings", "application/json", bytes(request));

    assertThat(reply.status()).as("%s", reply).isEqualTo(201);
    assertThat(reply.contentType()).startsWith("application/json");
    assertBytes(reply.body(), bytes(NEW_MAPPING));
    // the fingerprint is the corpus file's
    assertThat(reply.json().path("source").path("fingerprint").textValue()).isEqualTo(FINGERPRINT);
    assertThat(reply.json().path("target").path("fingerprint").textValue()).isEqualTo(FINGERPRINT);
    assertThat(reply.header("ETag")).contains(NEW_MAPPING_ETAG);
    assertThat(reply.header("Location"))
        .hasValueSatisfying(
            location ->
                assertThat(root.resolve(location).getPath())
                    .isEqualTo("/api/mappings/creating/order-to-order"));
    assertBytes(TempWorkspace.read("creating/order-to-order.mapping.json"), bytes(NEW_MAPPING));
    Http.Reply get = http().get("api/mappings/creating/order-to-order");
    assertBytes(get.body(), bytes(NEW_MAPPING));
    assertThat(get.header("ETag")).contains(NEW_MAPPING_ETAG);
  }

  @Test
  void createExistingIdIs409() {
    String request = createRequest(CORPUS_ID, "../structures/skeleton/order.xsd", ORDER);

    assertProblem(
        http().post("api/mappings", "application/json", bytes(request)), 409, "mapping-exists");
    // a create would have written NEW_MAPPING over it
    assertBytes(TempWorkspace.read(CORPUS_ID + ".mapping.json"), corpusMapping());
  }

  @Test
  void createWithUnreadableSchemaIs422() {
    TempWorkspace.mkdirs("creating-unreadable");
    String request =
        createRequest("creating-unreadable/order", "../structures/skeleton/missing.xsd", ORDER);

    JsonNode problem =
        assertProblem(
            http().post("api/mappings", "application/json", bytes(request)), 422, "model-refused");

    // both sides name the missing file; the engine reports it at line 1, column 1 of the file
    assertThat(described(problem.path("diagnostics")))
        .isNotEmpty()
        .containsOnly("error schema-unreadable at file ../structures/skeleton/missing.xsd 1:1");
    assertThat(TempWorkspace.exists("creating-unreadable/order.mapping.json")).isFalse();
  }

  /** A package reference of the ADR-0024 form, which only a host's resolver could read. */
  private static final String PACKAGE_REFERENCE = "shared@1.2.0:/xsd/o.xsd";

  /**
   * A create whose bundle is a package reference gets the engine's load error, as a missing file
   * does ({@link #createWithUnreadableSchemaIs422}): 422 {@code model-refused}, never 400 (#90,
   * ADR-0014 "Reference resolver shape").
   */
  @Test
  void createWithAPackageReferenceIs422ModelRefused() {
    TempWorkspace.mkdirs("creating-package");
    String request = createRequest("creating-package/order", PACKAGE_REFERENCE, ORDER);

    JsonNode problem =
        assertProblem(
            http().post("api/mappings", "application/json", bytes(request)), 422, "model-refused");

    assertThat(described(problem.path("diagnostics")))
        .isNotEmpty()
        .containsOnly("error package-reference-unsupported at file " + PACKAGE_REFERENCE + " 1:1");
    assertThat(TempWorkspace.exists("creating-package/order.mapping.json")).isFalse();
  }

  /**
   * A test run whose working copy names a package reference as its source bundle is refused with
   * the engine's load error: a 200 {@code refused} with no output and no trace, never a 4xx (#90).
   * The target is the skeleton's {@code order.xsd}, which loads, so the one diagnostic is the
   * source's.
   */
  @Test
  void packageReferenceRefusesTheTestRun() {
    String model =
        """
        {"formatVersion": 1,
         "source": {"bundle": ["%1$s"], "fingerprint": "%2$s", "root": {"element": "%3$s"}},
         "target": {"bundle": ["../structures/skeleton/order.xsd"], "fingerprint": "%2$s",
                    "root": {"element": "%3$s"}},
         "targetFieldMappings": {"/%3$s/OrderId": {"id": "t1", "result": "a1",
           "boxes": {"a1": {"kind": "source", "field": "/%3$s/OrderId"}}}}}
        """
            .formatted(PACKAGE_REFERENCE, FINGERPRINT, ORDER);

    Http.Reply reply =
        http()
            .post(
                "api/mappings/" + CORPUS_ID + "/test",
                "application/json",
                bytes(testRequest(model, INPUT)));

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode result = reply.json();
    assertThat(result.path("kind").textValue()).as("%s", reply).isEqualTo("refused");
    assertThat(described(result.path("diagnostics")))
        .containsExactly(
            "error package-reference-unsupported at file " + PACKAGE_REFERENCE + " 1:1");
    assertThat(result.has("output")).isFalse();
    assertThat(result.has("trace")).isFalse();
  }

  @Test
  void saveWritesCanonicalFormAndGetReturnsItByteIdentical() throws Exception {
    TempWorkspace.write("saving/order.mapping.json", unwired());
    byte[] body = bytes(workingCopy("\"a1\""));
    byte[] canonical = engineCanonical(body);
    assertBytes(canonical, corpusMapping());

    Http.Reply put = http().put("api/mappings/saving/order", "application/json", body);

    assertThat(put.status()).as("%s", put).isEqualTo(200);
    assertThat(put.contentType()).startsWith("application/json");
    assertBytes(put.body(), canonical);
    assertBytes(TempWorkspace.read("saving/order.mapping.json"), canonical);
    Http.Reply get = http().get("api/mappings/saving/order");
    assertBytes(get.body(), canonical);
    assertThat(put.header("ETag")).contains(CORPUS_MAPPING_ETAG);
    assertThat(get.header("ETag")).isEqualTo(put.header("ETag"));
  }

  @Test
  void saveStage1Is422AtPointer() {
    TempWorkspace.write("saving-stage1/order.mapping.json", unwired());
    String body = "{\"extra\": 1, " + workingCopy("\"a1\"").substring(1);

    JsonNode problem =
        assertProblem(
            http().put("api/mappings/saving-stage1/order", "application/json", bytes(body)),
            422,
            "model-refused");

    assertThat(described(problem.path("diagnostics")))
        .containsExactly("error unknown-member at pointer /extra");
    assertBytes(TempWorkspace.read("saving-stage1/order.mapping.json"), unwired());
  }

  @Test
  void saveStage2Is422AtAuthoringId() {
    TempWorkspace.write("saving-stage2/order.mapping.json", unwired());
    String body = workingCopy("\"zz\"");

    JsonNode problem =
        assertProblem(
            http().put("api/mappings/saving-stage2/order", "application/json", bytes(body)),
            422,
            "model-refused");

    assertThat(described(problem.path("diagnostics")))
        .containsExactly("error unknown-box-reference at id t1");
    assertBytes(TempWorkspace.read("saving-stage2/order.mapping.json"), unwired());
  }

  @Test
  void saveKeepsStage3Errors() {
    // an unconnected target field is a stage 3 error: an unfinished mapping saves (F-2)
    TempWorkspace.write("saving-stage3/order.mapping.json", corpusMapping());

    Http.Reply put =
        http()
            .put(
                "api/mappings/saving-stage3/order", "application/json", bytes(workingCopy("null")));

    assertThat(put.status()).as("%s", put).isEqualTo(200);
    assertBytes(put.body(), unwired());
    assertThat(put.header("ETag")).contains(UNWIRED_ETAG);
    assertBytes(TempWorkspace.read("saving-stage3/order.mapping.json"), unwired());
  }

  @Test
  void saveMalformedJsonIs400AndFileUnchanged() {
    TempWorkspace.write("saving-malformed/order.mapping.json", unwired());
    String wired = workingCopy("\"a1\"");
    byte[] withBom = new byte[3 + bytes(wired).length];
    withBom[0] = (byte) 0xEF;
    withBom[1] = (byte) 0xBB;
    withBom[2] = (byte) 0xBF;
    System.arraycopy(bytes(wired), 0, withBom, 3, bytes(wired).length);
    Map<String, byte[]> bodies =
        Map.of(
            "trailing comma",
            bytes(wired.replace("\"formatVersion\": 1}", "\"formatVersion\": 1,}")),
            "duplicate key",
            bytes(
                wired.replace(
                    "\"formatVersion\": 1}", "\"formatVersion\": 1, \"formatVersion\": 1}")),
            "byte order mark",
            withBom);

    bodies.forEach(
        (name, body) -> {
          assertThat(new String(body, java.nio.charset.StandardCharsets.UTF_8))
              .as(name)
              .isNotEqualTo(wired);
          assertProblem(
              http().put("api/mappings/saving-malformed/order", "application/json", body),
              400,
              "malformed-json");
          assertBytes(TempWorkspace.read("saving-malformed/order.mapping.json"), unwired());
        });
  }

  @Test
  void saveTextPlainIs415Problem() {
    TempWorkspace.write("saving-text/order.mapping.json", unwired());

    assertProblem(
        http().put("api/mappings/saving-text/order", "text/plain", bytes(workingCopy("\"a1\""))),
        415,
        "unsupported-media-type");
    assertBytes(TempWorkspace.read("saving-text/order.mapping.json"), unwired());
  }

  /** A tag that matches nothing on disk: the file changed since the editor read it (ADR-0027). */
  private static final String OTHER_ETAG = "\"sha256:" + "0".repeat(64) + "\"";

  @Test
  void saveWithTheStoredFilesEtagSavesAndAnswersTheNewEtag() {
    TempWorkspace.write("saving-if-match/order.mapping.json", unwired());
    String stored = http().get("api/mappings/saving-if-match/order").header("ETag").orElseThrow();
    assertThat(stored).isEqualTo(UNWIRED_ETAG);

    Http.Reply put =
        http()
            .put(
                "api/mappings/saving-if-match/order",
                "application/json",
                bytes(workingCopy("\"a1\"")),
                "If-Match",
                stored);

    assertThat(put.status()).as("%s", put).isEqualTo(200);
    assertThat(put.header("ETag")).contains(CORPUS_MAPPING_ETAG);
    assertBytes(TempWorkspace.read("saving-if-match/order.mapping.json"), corpusMapping());
  }

  /**
   * A tag that differs from the stored file's is 409 {@code mapping-changed} and writes nothing
   * (ADR-0027); a weak tag never matches, and the precondition is decided before the body is read,
   * so a malformed body is 409 too (RFC 9110, 13.2.1).
   */
  @Test
  void saveWithAnotherEtagIs409MappingChangedAndTheFileIsUnchanged() {
    TempWorkspace.write("saving-changed/order.mapping.json", unwired());
    Map<String, String> tags =
        Map.of(
            "another tag",
            OTHER_ETAG,
            "the stored tag, weak",
            "W/" + UNWIRED_ETAG,
            "the stored tag, unquoted",
            UNWIRED_ETAG.replace("\"", ""));
    tags.forEach(
        (name, tag) -> {
          JsonNode problem =
              assertProblem(
                  http()
                      .put(
                          "api/mappings/saving-changed/order",
                          "application/json",
                          bytes(workingCopy("\"a1\"")),
                          "If-Match",
                          tag),
                  409,
                  "mapping-changed");
          assertThat(problem.path("detail").textValue()).as(name).isNotBlank();
          assertBytes(TempWorkspace.read("saving-changed/order.mapping.json"), unwired());
        });

    assertProblem(
        http()
            .put(
                "api/mappings/saving-changed/order",
                "application/json",
                bytes("{"),
                "If-Match",
                OTHER_ETAG),
        409,
        "mapping-changed");
    assertBytes(TempWorkspace.read("saving-changed/order.mapping.json"), unwired());
  }

  /**
   * A stored file the service refuses has no tag a GET could have answered, so no {@code If-Match}
   * matches it; without the header it is overwritten as before.
   */
  @Test
  void saveWithAnEtagOverAStoredFileThatIsRefusedIs409() {
    Map<String, byte[]> files =
        Map.of("no-json", bytes("not a JSON document"), "stage1", bytes("{\"extra\": 1}"));
    files.forEach(
        (name, content) -> {
          String file = "saving-refused-" + name + "/order.mapping.json";
          TempWorkspace.write(file, content);

          assertProblem(
              http()
                  .put(
                      "api/mappings/saving-refused-" + name + "/order",
                      "application/json",
                      bytes(workingCopy("\"a1\"")),
                      "If-Match",
                      UNWIRED_ETAG),
              409,
              "mapping-changed");
          assertBytes(TempWorkspace.read(file), content);
        });
  }

  /** Without {@code If-Match} a save stays unconditional (ADR-0027): scripts keep working. */
  @Test
  void saveWithoutIfMatchOverwritesWhateverIsStored() {
    TempWorkspace.write("saving-unconditional/order.mapping.json", bytes("not a JSON document"));

    Http.Reply put =
        http()
            .put(
                "api/mappings/saving-unconditional/order",
                "application/json",
                bytes(workingCopy("\"a1\"")));

    assertThat(put.status()).as("%s", put).isEqualTo(200);
    assertBytes(TempWorkspace.read("saving-unconditional/order.mapping.json"), corpusMapping());
  }

  /** A dangling link in the listing is skipped; the listing does not fail (#28 rulings). */
  @Test
  void listSkipsADanglingLink() throws Exception {
    TempWorkspace.mkdirs("listing-dangling");
    Files.createSymbolicLink(
        TempWorkspace.root().resolve("listing-dangling/ghost.mapping.json"),
        Path.of("../../outside/ghost.mapping.json"));
    Files.createSymbolicLink(
        TempWorkspace.root().resolve("listing-dangling/ghost-in.mapping.json"),
        Path.of("missing.mapping.json"));

    Http.Reply reply = http().get("api/mappings");

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    List<String> ids = new ArrayList<>();
    for (JsonNode summary : reply.json()) {
      ids.add(summary.path("id").textValue());
    }
    assertThat(ids)
        .contains(CORPUS_ID)
        .doesNotContain("listing-dangling/ghost", "listing-dangling/ghost-in");
  }

  /**
   * A stored file that is no JSON document is refused like a model (#28 design, "GET"): 422 {@code
   * model-refused} with no diagnostics, and the reader's message as the detail.
   */
  @Test
  void getOfAStoredFileThatIsNoJsonIs422WithNoDiagnosticsAndADetail() {
    Map<String, String> files =
        Map.of(
            "text", "not a JSON document",
            "truncated", "{\"formatVersion\": 1,",
            "empty", "");
    files.forEach(
        (name, content) -> {
          TempWorkspace.write("getting-no-json/" + name + ".mapping.json", bytes(content));

          JsonNode problem =
              assertProblem(
                  http().get("api/mappings/getting-no-json/" + name), 422, "model-refused");

          assertThat(problem.path("diagnostics").isArray()).as("%s: diagnostics", name).isTrue();
          assertThat(problem.path("diagnostics")).as("%s: diagnostics", name).isEmpty();
          assertThat(problem.path("detail").textValue()).as("%s: detail", name).isNotBlank();
        });
  }

  /**
   * PUT checks the id against the workspace before it reads the body (#28 rulings), so an unknown
   * id with a malformed body is 404, not {@code malformed-json}. The escaping ids are in {@link
   * WorkspaceEscapeTest}.
   */
  @Test
  void saveOfAnUnknownIdIs404BeforeTheBodyIsRead() {
    assertProblem(
        http().put("api/mappings/mappings/no-such-mapping", "application/json", bytes("{")),
        404,
        "not-found");
    assertThat(TempWorkspace.exists("mappings/no-such-mapping.mapping.json")).isFalse();
  }

  /**
   * #96: a create whose root is a wsdl shape the model schema allows reaches the WSDL reader, which
   * finds no interface in a bundle of no WSDL, at the first file's xs:schema: 422 {@code
   * model-refused}, never 400 {@code invalid-request}. Only the source has the shape.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("io.flottila.mapping.service.RootShapes#wsdlAllowed")
  void createWithAWsdlRootIsTheWsdlReadersRefusal(String rootShape) {
    TempWorkspace.mkdirs("creating-root");
    String target = createRequest("creating-root/order", "../structures/skeleton/order.xsd", ORDER);
    String request =
        target.replaceFirst(
            "\"root\": \\{\"element\": \"[^\"]*\"\\}",
            java.util.regex.Matcher.quoteReplacement("\"root\": " + rootShape));
    assertThat(request).as("only the source's root is replaced").isNotEqualTo(target);

    JsonNode problem =
        assertProblem(
            http().post("api/mappings", "application/json", bytes(request)), 422, "model-refused");

    assertThat(described(problem.path("diagnostics")))
        .containsExactly(
            "error schema-root-not-found at file ../structures/skeleton/order.xsd 6:59");
    assertThat(TempWorkspace.exists("creating-root/order.mapping.json")).isFalse();
  }

  /**
   * #96: a create whose root is a wsdl shape the model schema forbids is no root selector, as on
   * {@code POST /api/structures}: 400 {@code invalid-request}, before any structure is read.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("io.flottila.mapping.service.RootShapes#wsdlForbidden")
  void createWithAWsdlRootTheModelSchemaForbidsIsAnInvalidRequest(String rootShape) {
    TempWorkspace.mkdirs("creating-root");
    String target = createRequest("creating-root/order", "../structures/skeleton/order.xsd", ORDER);
    String request =
        target.replaceFirst(
            "\"root\": \\{\"element\": \"[^\"]*\"\\}",
            java.util.regex.Matcher.quoteReplacement("\"root\": " + rootShape));
    assertThat(request).as("only the source's root is replaced").isNotEqualTo(target);

    assertProblem(
        http().post("api/mappings", "application/json", bytes(request)), 400, "invalid-request");

    assertThat(TempWorkspace.exists("creating-root/order.mapping.json")).isFalse();
  }

  /** {@code facade.save(facade.load(body))}: the engine's canonical form, the oracle. */
  private static byte[] engineCanonical(byte[] body) throws Exception {
    EngineFacade facade = new EngineFacade();
    if (facade.load(body) instanceof Loaded(MappingModel model)) {
      return facade.save(model);
    }
    throw new AssertionError("the engine refuses the working copy");
  }
}
