package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.assertBytes;
import static org.assertj.core.api.Assertions.assertThat;

import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import org.junit.jupiter.api.Test;

/**
 * {@code GET /api/catalogue} (ADR-0026, ADR-0015): the packed function catalogue's bytes as {@code
 * application/json}, with no ETag, since the catalogue changes only with the build. The expected
 * bytes are the resource engine/mapping packs, read from the class path, never the service's
 * answer.
 */
@QuarkusTest
class CatalogueResourceTest {

  /** Where engine/mapping packs the catalogue (ADR-0025). */
  private static final String RESOURCE = "io/flottila/mapping/mapping/function-catalogue.json";

  @TestHTTPResource URI root;

  private static byte[] packed() throws IOException {
    try (InputStream in =
        CatalogueResourceTest.class.getClassLoader().getResourceAsStream(RESOURCE)) {
      assertThat(in).as("the resource %s", RESOURCE).isNotNull();
      return in.readAllBytes();
    }
  }

  @Test
  void getAnswersThePackedCatalogueByteForByte() throws IOException {
    byte[] packed = packed();
    // witness: it is the catalogue, keyed by function id, with spec 2's functions
    assertThat(Wire.read(packed).has("useOneAsMany")).as("useOneAsMany in %s", RESOURCE).isTrue();

    Http.Reply reply = new Http(root).get("api/catalogue");

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    assertThat(reply.contentType()).startsWith("application/json");
    assertBytes(reply.body(), packed);
    assertThat(reply.header("ETag")).as("the ETag of the catalogue").isEmpty();
  }
}
