package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.ORDER;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Fixtures.corpusMapping;
import static io.flottila.mapping.service.Wire.assertProblem;
import static io.flottila.mapping.service.Wire.createRequest;
import static io.flottila.mapping.service.Wire.structureRequest;
import static io.flottila.mapping.service.Wire.testRequest;
import static org.assertj.core.api.Assertions.assertThat;

import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.net.URI;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Workspace escapes sent over HTTP (ADR-0014, "References": a mandatory test; ADR-0024). Each
 * attack never gets 200, never shows the outside schema's {@code SecretField}, and leaves {@code
 * outside/} and the directory beside the workspace unchanged. Where the request reaches a resource,
 * the answer is 400 {@code invalid-workspace-path}.
 *
 * <p>The witnesses: {@link #theInsideCopyOfTheOutsideSchemaLoadsAndRuns} shows that a read of the
 * outside schema would show the marker; the escaping ids name {@code outside/evil.mapping.json},
 * which exists; a write through an escape would change the snapshot.
 */
@QuarkusTest
class WorkspaceEscapeTest {

  private static final String MARKER = "SecretField";
  private static final String EXFIL = "Q{urn:flottila:test:outside}Exfil";
  private static final String EXFIL_FINGERPRINT =
      "sha256:b1e7aba69ac4f5572ccadcb28bc162f0cab8d7be4cca3a487fff96340387ad00";
  private static final String EXFIL_INPUT =
      "<o:Exfil xmlns:o=\"urn:flottila:test:outside\"><SecretField>s3cr3t</SecretField></o:Exfil>";

  /** Replaced by the absolute path of {@code outside/} when the attack is sent. */
  private static final String OUTSIDE = "{outside}";

  @TestHTTPResource URI root;

  private Map<String, String> before;

  /**
   * @param reachesAResource false where the router answers before any resource: Vert.x removes the
   *     dot segment {@code %2e%2e} (observed 2026-11-02, Quarkus 3.40.1.1)
   */
  record Attack(String method, String path, String body, boolean reachesAResource) {}

  @BeforeEach
  void snapshot() {
    before = TempWorkspace.besideTheWorkspace();
  }

  @AfterEach
  void nothingBesideTheWorkspaceChanged() {
    assertThat(TempWorkspace.besideTheWorkspace()).isEqualTo(before);
  }

  static Stream<Named<Attack>> attacks() {
    String validModel = new String(corpusMapping(), java.nio.charset.StandardCharsets.UTF_8);
    return Stream.of(
        attack("GET id ..%2F..%2Fetc%2Fpasswd", "GET", "api/mappings/..%2F..%2Fetc%2Fpasswd", ""),
        attack("GET id ..%2Foutside%2Fevil", "GET", "api/mappings/..%2Foutside%2Fevil", ""),
        attack("GET id %2e%2e%2foutside%2fevil", "GET", "api/mappings/%2e%2e%2foutside%2fevil", ""),
        Named.of("GET id %2e%2e", new Attack("GET", "api/mappings/%2e%2e", "", false)),
        attack("GET id %00", "GET", "api/mappings/%00", ""),
        attack("GET id %5C", "GET", "api/mappings/%5C", ""),
        attack("GET id ..%5Coutside%5Cevil", "GET", "api/mappings/..%5Coutside%5Cevil", ""),
        attack("GET through a symlink pointing out", "GET", "api/mappings/links/out", ""),
        attack(
            "structures: an absolute bundle ref",
            "POST",
            "api/structures",
            structureRequest("", OUTSIDE + "/evil.xsd", EXFIL)),
        attack(
            "structures: ..\\.. bundle ref",
            "POST",
            "api/structures",
            structureRequest("structures/skeleton", "..\\..\\..\\outside\\evil.xsd", EXFIL)),
        attack(
            "structures: a symlinked bundle ref",
            "POST",
            "api/structures",
            structureRequest("", "links/out.xsd", EXFIL)),
        attack(
            "structures: a bundle ref through a symlinked directory",
            "POST",
            "api/structures",
            structureRequest("links", "outdir/evil.xsd", EXFIL)),
        attack(
            "structures: base ..",
            "POST",
            "api/structures",
            structureRequest("..", "outside/evil.xsd", EXFIL)),
        attack(
            "create with id ../x",
            "POST",
            "api/mappings",
            createRequest("../x", "workspace/structures/skeleton/order.xsd", ORDER)),
        attack(
            "create with id ../outside/new",
            "POST",
            "api/mappings",
            createRequest("../outside/new", "evil.xsd", EXFIL)),
        attack("PUT through a symlink pointing out", "PUT", "api/mappings/links/out", validModel),
        attack("PUT id ..%2Foutside%2Fevil", "PUT", "api/mappings/..%2Foutside%2Fevil", validModel),
        attack(
            "test run with an escaping bundle",
            "POST",
            "api/mappings/mappings/order-id-copy/test",
            testRequest(exfilModel("../../outside/evil.xsd"), EXFIL_INPUT)),
        attack(
            "test run with a symlinked bundle",
            "POST",
            "api/mappings/mappings/order-id-copy/test",
            testRequest(exfilModel("../links/out.xsd"), EXFIL_INPUT)),
        attack(
            "test run with an absolute bundle",
            "POST",
            "api/mappings/mappings/order-id-copy/test",
            testRequest(exfilModel(OUTSIDE + "/evil.xsd"), EXFIL_INPUT)),
        attack(
            "test run through id ..%2Foutside%2Fevil",
            "POST",
            "api/mappings/..%2Foutside%2Fevil/test",
            testRequest(exfilModel("evil.xsd"), EXFIL_INPUT)));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("attacks")
  void anEscapeIsRefusedBeforeAnyRead(Attack attack) {
    String body = attack.body().replace(OUTSIDE, TempWorkspace.outside().toString());

    Http.Reply reply =
        new Http(root)
            .send(
                attack.method(),
                attack.path(),
                attack.method().equals("GET") ? null : "application/json",
                bytes(body));

    assertThat(reply.status()).as("never served: %s", reply).isNotIn(200, 201);
    assertThat(reply.text()).as("never the outside schema").doesNotContain(MARKER);
    if (attack.reachesAResource()) {
      assertProblem(reply, 400, "invalid-workspace-path");
    } else {
      assertThat(reply.status()).as("the router's answer: %s", reply).isEqualTo(404);
    }
  }

  @Test
  void theInsideCopyOfTheOutsideSchemaLoadsAndRuns() {
    Http http = new Http(root);

    Http.Reply loaded =
        http.post(
            "api/structures",
            "application/json",
            bytes(structureRequest("structures/outside-copy", "evil.xsd", EXFIL)));
    assertThat(loaded.status()).as("%s", loaded).isEqualTo(200);
    assertThat(loaded.json().path("kind").textValue()).isEqualTo("loaded");
    assertThat(loaded.json().path("fingerprint").textValue()).isEqualTo(EXFIL_FINGERPRINT);
    assertThat(loaded.text()).contains(MARKER);

    Http.Reply run =
        http.post(
            "api/mappings/mappings/order-id-copy/test",
            "application/json",
            bytes(testRequest(exfilModel("../structures/outside-copy/evil.xsd"), EXFIL_INPUT)));
    assertThat(run.status()).as("%s", run).isEqualTo(200);
    assertThat(run.json().path("kind").textValue()).isEqualTo("output");
    assertThat(run.json().path("output").textValue()).contains(MARKER);
  }

  private static Named<Attack> attack(String name, String method, String path, String body) {
    return Named.of(name, new Attack(method, path, body, true));
  }

  /** A mapping that copies the outside schema's {@code SecretField}, its bundle {@code bundle}. */
  private static String exfilModel(String bundle) {
    String side =
        "{\"bundle\": [%s], \"fingerprint\": \"%s\", \"root\": {\"element\": \"%s\"}}"
            .formatted(Wire.quoted(bundle), EXFIL_FINGERPRINT, EXFIL);
    return """
        {"formatVersion": 1, "source": %1$s, "target": %1$s,
         "targetFieldMappings": {"/%2$s/SecretField": {"id": "t1", "result": "a1",
           "boxes": {"a1": {"kind": "source", "field": "/%2$s/SecretField"}}}}}
        """
        .formatted(side, EXFIL);
  }
}
