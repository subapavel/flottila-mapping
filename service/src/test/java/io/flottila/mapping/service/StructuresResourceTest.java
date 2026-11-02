package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.FINGERPRINT;
import static io.flottila.mapping.service.Fixtures.NS;
import static io.flottila.mapping.service.Fixtures.ORDER;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Wire.described;
import static io.flottila.mapping.service.Wire.structureRequest;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@code POST /api/structures}: the structure graph and its fingerprint, or a load error as a 200
 * {@code refused} at its file position (ADR-0015, ADR-0024). The expected fields are those of
 * {@code corpus/structures/skeleton/order.xsd}, in the engine's order (attributes first).
 */
@QuarkusTest
class StructuresResourceTest {

  @TestHTTPResource URI root;

  private Http.Reply structure(String base, String bundle, String rootElement) {
    return new Http(root)
        .post(
            "api/structures",
            "application/json",
            bytes(structureRequest(base, bundle, rootElement)));
  }

  @Test
  void returnsGraphAndFingerprint() {
    Http.Reply reply = structure("structures/skeleton", "order.xsd", ORDER);

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode loaded = reply.json();
    assertThat(loaded.path("kind").textValue()).isEqualTo("loaded");
    assertThat(loaded.path("fingerprint").textValue()).isEqualTo(FINGERPRINT);
    JsonNode rootField = loaded.path("root");
    assertThat(field(rootField)).isEqualTo("Q{" + NS + "}Order 1..1");
    assertThat(rootField.path("type").textValue()).isEqualTo("/" + ORDER);
    JsonNode types = loaded.path("types");
    assertThat(types.properties()).extracting(e -> e.getKey()).containsExactly("/" + ORDER);
    List<String> fields = new ArrayList<>();
    for (JsonNode f : types.path("/" + ORDER)) {
      fields.add(field(f));
    }
    assertThat(fields)
        .containsExactly(
            "channel 0..1",
            "OrderId 1..1",
            "Quantity 0..1",
            "Amount 0..1 nillable",
            "Urgent 0..1",
            "DeliveryDate 0..1",
            "PickupTime 0..1",
            "CreatedAt 0..1",
            "Note 0..unbounded");
    JsonNode channel = types.path("/" + ORDER).path(0);
    JsonNode orderId = types.path("/" + ORDER).path(1);
    assertThat(channel.path("kind").textValue())
        .as("an attribute's kind is not an element's")
        .isNotNull()
        .isNotEqualTo(orderId.path("kind").textValue());
    assertThat(orderId.has("valueType")).isTrue();
    assertThat(rootField.has("valueType")).as("a complex root has no value type").isFalse();

    // base "" is the workspace root
    Http.Reply fromRoot = structure("", "structures/skeleton/order.xsd", ORDER);
    assertThat(fromRoot.json().path("fingerprint").textValue()).isEqualTo(FINGERPRINT);
  }

  @Test
  void unreadableSchemaIs200RefusedAtFilePosition() throws IOException {
    Http.Reply missing = structure("structures/skeleton", "missing.xsd", ORDER);

    assertThat(missing.status()).as("%s", missing).isEqualTo(200);
    assertThat(missing.json().path("kind").textValue()).isEqualTo("refused");
    assertThat(described(missing.json().path("diagnostics")))
        .containsExactly("error schema-unreadable at file missing.xsd 1:1");

    // a file that is not well-formed: the engine's position of the error (StructureReaderTest)
    TempWorkspace.write(
        "structures/broken/malformed.xsd",
        Files.readAllBytes(
            Fixtures.repositoryRoot()
                .resolve("corpus/structures/skeleton/test-fixtures/malformed.xsd")));
    Http.Reply malformed = structure("structures/broken", "malformed.xsd", ORDER);

    assertThat(malformed.status()).as("%s", malformed).isEqualTo(200);
    assertThat(malformed.json().path("kind").textValue()).isEqualTo("refused");
    assertThat(described(malformed.json().path("diagnostics")))
        .containsExactly("error schema-not-well-formed at file malformed.xsd 7:7");
  }

  /**
   * A field as {@code name min..max}, with {@code Q{ns}} for a namespace and {@code nillable}; an
   * absent {@code max} is unbounded.
   */
  private static String field(JsonNode f) {
    String namespace = f.path("namespace").textValue();
    String name =
        (namespace == null || namespace.isEmpty() ? "" : "Q{" + namespace + "}")
            + f.path("localName").textValue();
    String max = f.has("max") ? f.path("max").asText() : "unbounded";
    return name
        + " "
        + f.path("min").asText()
        + ".."
        + max
        + (f.path("nillable").asBoolean(false) ? " nillable" : "");
  }
}
