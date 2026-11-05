package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.FINGERPRINT;
import static io.flottila.mapping.service.Fixtures.ORDER;
import static io.flottila.mapping.service.Fixtures.assertBytes;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Fixtures.corpusMapping;
import static io.flottila.mapping.service.Fixtures.workingCopy;
import static io.flottila.mapping.service.Wire.assertProblem;
import static io.flottila.mapping.service.Wire.described;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.StructureResult;
import io.flottila.mapping.api.Structures;
import io.flottila.mapping.mapping.LoadResult;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.importer.ResolvedFile;
import io.flottila.mapping.structure.importer.UnresolvedReferenceException;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@code POST /api/mappings/{id}/refresh} (#99; ADR-0015, ADR-0009 as amended on 2026-11-05): the
 * working copy in the body comes back with both fingerprints re-derived and nothing else changed,
 * with its orphaned references and every other stage-3 diagnostic. A side whose bundle fails to
 * load keeps its fingerprint and gives its load diagnostics, never a 4xx. Nothing is saved.
 *
 * <p>A response's {@code model} is compared with its member order ({@link JsonNode#toString} keeps
 * it), against the canonical corpus mapping or a copy of it with values replaced in place.
 */
@QuarkusTest
class RefreshResourceTest {

  /** The corpus mapping's bundle reference, the same on both sides. */
  private static final String SKELETON = "../structures/skeleton/order.xsd";

  /** A well-formed fingerprint that no structure gives. */
  private static final String STALE = "sha256:" + "0".repeat(64);

  /** An id whose directory holds the corpus mapping, so {@link #SKELETON} resolves from it. */
  private static final String CORPUS_ID = "mappings/order-id-copy";

  @TestHTTPResource URI root;

  private Http.Reply refresh(String id, byte[] body) {
    return new Http(root).post("api/mappings/" + id + "/refresh", "application/json", body);
  }

  /**
   * The corpus mapping with the source side's bundle reference and each side's fingerprint
   * replaced in place. The corpus mapping is canonical and each side has one bundle file, so the
   * copy is canonical too.
   */
  private static String corpusWith(
      String sourceBundle, String sourceFingerprint, String targetFingerprint) {
    String corpus = new String(corpusMapping(), UTF_8);
    int target = corpus.indexOf("\"target\"");
    return corpus
            .substring(0, target)
            .replace(SKELETON, sourceBundle)
            .replace(FINGERPRINT, sourceFingerprint)
        + corpus.substring(target).replace(FINGERPRINT, targetFingerprint);
  }

  /** The member-ordered text of a JSON value. */
  private static String ordered(JsonNode value) {
    return value.toString();
  }

  private static String ordered(String json) {
    return ordered(Wire.read(bytes(json)));
  }

  /** The 200 reply's body, which is a refresh result and never a problem. */
  private static JsonNode refreshed(Http.Reply reply) {
    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    assertThat(reply.contentType()).as("%s", reply).startsWith("application/json");
    return reply.json();
  }

  /**
   * The fingerprint the engine's structure reader gives {@code file} under {@code Order}, read from
   * the workspace directory {@code directory}: the oracle is the engine, never the service.
   */
  private static String fingerprintOf(String directory, String file) {
    Path base = TempWorkspace.root().resolve(directory);
    StructureResult result =
        Structures.load(
            reference -> {
              try {
                return new ResolvedFile(reference, Files.readAllBytes(base.resolve(reference)));
              } catch (IOException e) {
                throw new UnresolvedReferenceException(
                    UnresolvedReferenceException.Reason.UNREADABLE, reference);
              }
            },
            new SchemaBundle(List.of(file)),
            new ElementRoot(ORDER));
    assertThat(result).as("%s/%s loads", directory, file).isInstanceOf(StructureResult.Loaded.class);
    return ((StructureResult.Loaded) result).structure().fingerprint();
  }

  /**
   * The source schema renames the mapped field {@code OrderId} to {@code OrderNo}: the source side
   * gets the new structure's fingerprint, the target side keeps the one it already had, and the box
   * that reads {@code OrderId} is {@code orphaned-reference}. The stored file is untouched.
   */
  @Test
  void aSchemaThatRenamedAMappedFieldGivesTheNewFingerprintAndAnOrphanedReferenceAtTheBox()
      throws IOException {
    String order =
        Files.readString(Fixtures.repositoryRoot().resolve("corpus/structures/skeleton/order.xsd"));
    String renamed = order.replace("name=\"OrderId\"", "name=\"OrderNo\"");
    assertThat(renamed).as("order.xsd has OrderId to rename").isNotEqualTo(order);
    TempWorkspace.write("refreshing-renamed/renamed.xsd", bytes(renamed));
    TempWorkspace.write("refreshing-renamed/order.mapping.json", corpusMapping());
    String fingerprint = fingerprintOf("refreshing-renamed", "renamed.xsd");
    assertThat(fingerprint).isNotEqualTo(FINGERPRINT);

    JsonNode result =
        refreshed(
            refresh(
                "refreshing-renamed/order",
                bytes(corpusWith("renamed.xsd", FINGERPRINT, FINGERPRINT))));

    assertThat(ordered(result.path("model")))
        .isEqualTo(ordered(corpusWith("renamed.xsd", fingerprint, FINGERPRINT)));
    assertThat(described(result.path("diagnostics")))
        .containsExactly("error orphaned-reference at id a1");
    assertBytes(TempWorkspace.read("refreshing-renamed/order.mapping.json"), corpusMapping());
  }

  @Test
  void anUnchangedMappingReturnsTheSameModelAndNoDiagnostics() {
    assertThat(corpusWith(SKELETON, FINGERPRINT, FINGERPRINT))
        .as("witness: corpusWith replaces nothing else")
        .isEqualTo(new String(corpusMapping(), UTF_8));

    JsonNode result = refreshed(refresh(CORPUS_ID, corpusMapping()));

    assertThat(ordered(result.path("model"))).isEqualTo(ordered(Wire.read(corpusMapping())));
    assertThat(described(result.path("diagnostics"))).isEmpty();
  }

  /**
   * The source bundle is not well-formed: the source keeps its stale fingerprint, the target's
   * stale one is re-derived, and the answer is the load error at its position in the file
   * (StructuresResourceTest), with no stage-3 diagnostic, as stage 3 needs both structures.
   */
  @Test
  void aSideThatFailsToLoadKeepsItsFingerprintAndReturnsItsFilePositionDiagnostics()
      throws IOException {
    TempWorkspace.write(
        "refreshing-broken/malformed.xsd",
        Files.readAllBytes(
            Fixtures.repositoryRoot()
                .resolve("corpus/structures/skeleton/test-fixtures/malformed.xsd")));

    JsonNode result =
        refreshed(
            refresh("refreshing-broken/order", bytes(corpusWith("malformed.xsd", STALE, STALE))));

    assertThat(ordered(result.path("model")))
        .isEqualTo(ordered(corpusWith("malformed.xsd", STALE, FINGERPRINT)));
    assertThat(described(result.path("diagnostics")))
        .containsExactly("error schema-not-well-formed at file malformed.xsd 7:7");
  }

  /**
   * A package reference (ADR-0024 since the spec-4 grilling) is a load error of its side, a 200
   * like any other, never a 4xx (ADR-0015, #90).
   */
  @Test
  void aPackageReferenceGivesPackageReferenceUnsupported() {
    String reference = "shared@1.2.0:/xsd/o.xsd";

    JsonNode result =
        refreshed(refresh(CORPUS_ID, bytes(corpusWith(reference, STALE, FINGERPRINT))));

    assertThat(ordered(result.path("model")))
        .isEqualTo(ordered(corpusWith(reference, STALE, FINGERPRINT)));
    assertThat(described(result.path("diagnostics")))
        .containsExactly("error package-reference-unsupported at file " + reference + " 1:1");
  }

  /**
   * The working copy's keys are out of order and on one line; the answer is the model in canonical
   * form (ADR-0010), which stages 1 and 2 accept and which the canonical writer leaves as it is.
   */
  @Test
  void theResponseModelPassesStages1And2AndIsCanonical() throws MalformedJsonException {
    EngineFacade facade = new EngineFacade();

    JsonNode model = refreshed(refresh(CORPUS_ID, bytes(workingCopy("\"a1\"")))).path("model");

    LoadResult loaded = facade.load(bytes(ordered(model)));
    assertThat(loaded).as("stages 1 and 2").isInstanceOf(Loaded.class);
    MappingModel accepted = ((Loaded) loaded).model();
    assertThat(ordered(model)).isEqualTo(ordered(Wire.read(facade.save(accepted))));
    assertThat(ordered(model)).isEqualTo(ordered(Wire.read(corpusMapping())));
  }

  /**
   * A working copy that stage 1 or 2 refuses has no model to answer with: 422 {@code
   * model-refused} with its diagnostics, as Save answers it (ADR-0024).
   */
  @Test
  void aWorkingCopyThatStage1Or2RefusesIs422ModelRefused() {
    String newer =
        new String(corpusMapping(), UTF_8).replace("\"formatVersion\": 1", "\"formatVersion\": 2");

    JsonNode problem = assertProblem(refresh(CORPUS_ID, bytes(newer)), 422, "model-refused");

    assertThat(described(problem.path("diagnostics")))
        .containsExactly("error format-version-unsupported at pointer /formatVersion");
  }
}
