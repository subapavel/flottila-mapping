package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.NS;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Fixtures.corpusMapping;
import static io.flottila.mapping.service.Wire.testRequest;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import java.net.URI;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The time zone of the service's runs is configurable (#80): {@code flottila.mapping.time-zone} is
 * +01:00 here, so a test run writes a date at +01:00. Under the default, UTC, the same date is
 * written as it is read, 10:00 Z.
 */
@QuarkusTest
@TestProfile(TestRunTimeZoneTest.PlusOne.class)
class TestRunTimeZoneTest {

  /** A time zone one hour ahead of UTC. */
  public static final class PlusOne implements QuarkusTestProfile {

    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of("flottila.mapping.time-zone", "+01:00");
    }
  }

  @TestHTTPResource URI root;

  @Test
  void aTestRunWritesADateInTheConfiguredZone() {
    TempWorkspace.write("testing-time-zone/order.mapping.json", corpusMapping());
    String model =
        TestRunResourceTest.notesThrough(
            "d1",
            """
            "d1": {"kind": "function", "fn": "dateTrans", "inputs": ["a2"],
                   "params": {"sourceFormat": "yyyy-MM-dd HH:mmXXX", "targetFormat": "HH:mm XXX"}},
            "a2": {"kind": "source", "field": "NOTE"}""");
    String input =
        "<src:Order xmlns:src=\""
            + NS
            + "\"><OrderId>1</OrderId><Note>2026-11-04 10:00Z</Note></src:Order>";

    Http.Reply reply =
        new Http(root)
            .post(
                "api/mappings/testing-time-zone/order/test",
                "application/json",
                bytes(testRequest(model, input)));

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode result = reply.json();
    assertThat(result.path("kind").textValue()).as("%s", result).isEqualTo("output");
    assertThat(result.path("output").textValue()).contains("<Note>11:00 +01:00</Note>");
  }
}
