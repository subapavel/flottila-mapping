package io.flottila.mapping.service;

import static io.flottila.mapping.service.Fixtures.INPUT;
import static io.flottila.mapping.service.Fixtures.NS;
import static io.flottila.mapping.service.Fixtures.OUTPUT;
import static io.flottila.mapping.service.Fixtures.assertBytes;
import static io.flottila.mapping.service.Fixtures.bytes;
import static io.flottila.mapping.service.Fixtures.corpusMapping;
import static io.flottila.mapping.service.Fixtures.unwired;
import static io.flottila.mapping.service.Fixtures.workingCopy;
import static io.flottila.mapping.service.Wire.assertProblem;
import static io.flottila.mapping.service.Wire.described;
import static io.flottila.mapping.service.Wire.testRequest;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import java.net.URI;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@code POST /api/mappings/{id}/test} runs the working copy in the body, never the stored file
 * (ADR-0015): stages 1 to 3 answer 200 with diagnostics, transport errors are problems.
 */
@QuarkusTest
class TestRunResourceTest {

  @TestHTTPResource URI root;

  private Http.Reply test(String id, String request) {
    return new Http(root).post("api/mappings/" + id + "/test", "application/json", bytes(request));
  }

  @Test
  void testRunsAnUnsavedWorkingCopy() {
    // the disk copy is unconnected; only the body wires the field
    TempWorkspace.write("testing/order.mapping.json", unwired());

    Http.Reply reply = test("testing/order", testRequest(workingCopy("\"a1\""), INPUT));

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode result = reply.json();
    assertThat(result.path("kind").textValue()).isEqualTo("output");
    assertThat(result.path("output").textValue()).isEqualTo(OUTPUT);
    assertThat(described(result.path("diagnostics"))).isEmpty();
    assertThat(result.has("trace")).as("no trace in spec 1").isFalse();
    assertBytes(TempWorkspace.read("testing/order.mapping.json"), unwired());
  }

  @Test
  void compileErrorsAre200WithDiagnosticsAndNoOutput() {
    // the disk copy is wired: a run of it would give output
    TempWorkspace.write("testing-stage3/order.mapping.json", corpusMapping());

    Http.Reply reply = test("testing-stage3/order", testRequest(workingCopy("null"), INPUT));

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode result = reply.json();
    assertThat(result.path("kind").textValue()).isEqualTo("refused");
    assertThat(described(result.path("diagnostics")))
        .containsExactly("error unconnected-target-field at id t1");
    assertThat(result.has("output")).isFalse();
  }

  @Test
  void stage1ErrorsAre200Refused() {
    TempWorkspace.write("testing-stage1/order.mapping.json", corpusMapping());
    String model = "{\"extra\": 1, " + workingCopy("\"a1\"").substring(1);

    Http.Reply reply = test("testing-stage1/order", testRequest(model, INPUT));

    assertThat(reply.status()).as("%s", reply).isEqualTo(200);
    JsonNode result = reply.json();
    assertThat(result.path("kind").textValue()).isEqualTo("refused");
    assertThat(described(result.path("diagnostics")))
        .containsExactly("error unknown-member at pointer /extra");
    assertThat(result.has("output")).isFalse();
  }

  @Test
  void malformedInputIs400Problem() {
    TempWorkspace.write("testing-input/order.mapping.json", corpusMapping());
    String element = "<src:Order xmlns:src=\"" + NS + "\"><OrderId>4711</OrderId>";
    for (String input :
        List.of(
            element, // no end tag
            "<!DOCTYPE src:Order []>" + element + "</src:Order>")) {
      assertProblem(
          test("testing-input/order", testRequest(workingCopy("\"a1\""), input)),
          400,
          "malformed-input");
    }
  }

  @Test
  void duplicateKeyInModelIs400() {
    TempWorkspace.write("testing-duplicate/order.mapping.json", corpusMapping());
    String model =
        workingCopy("\"a1\"")
            .replace("\"formatVersion\": 1}", "\"formatVersion\": 1, \"formatVersion\": 1}");

    assertProblem(
        test("testing-duplicate/order", testRequest(model, INPUT)), 400, "malformed-json");
  }
}
