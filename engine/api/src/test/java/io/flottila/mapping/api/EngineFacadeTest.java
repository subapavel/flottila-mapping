package io.flottila.mapping.api;

import static io.flottila.mapping.api.CompileOptions.DEPLOY;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.mapping.AtAuthoringId;
import io.flottila.mapping.mapping.AtFilePosition;
import io.flottila.mapping.mapping.AtPointer;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.LoadResult;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.Location;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.Refused;
import io.flottila.mapping.mapping.Severity;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.xslt.export.XsltExporter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The engine facade loads and saves a mapping model by delegating to {@code engine/mapping}, whose
 * tests cover the format (spec #21, seam "load and save of a model"), and compiles and runs a
 * mapping with one field link through the whole chain (#26, seam {@code engine/api}).
 */
class EngineFacadeTest {

  static final String CANONICAL =
      """
      {
        "formatVersion": 1,
        "source": {
          "bundle": [
            "order.xsd"
          ],
          "fingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "root": {
            "element": "Order"
          }
        },
        "target": {
          "bundle": [
            "invoice.xsd"
          ],
          "fingerprint": "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
          "root": {
            "element": "Invoice"
          }
        },
        "targetFieldMappings": {
          "/Invoice/Number": {
            "boxes": {
              "a1": {
                "field": "/Order/Number",
                "kind": "source"
              }
            },
            "id": "t1",
            "result": "a1"
          }
        }
      }
      """;

  // --- compile and run (#26): load, stages 1 to 3, lowering, closure compile, interpreter,
  // serializer. The structures are the skeleton's, read from corpus/structures/skeleton.

  private static final String NS = "urn:flottila:corpus:skeleton";
  private static final String ORDER = "/Q{" + NS + "}Order";
  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";

  /**
   * The real fingerprint of {@code order.xsd} under {@code Q{urn:flottila:corpus:skeleton}Order}.
   */
  private static final String FINGERPRINT =
      "sha256:df1714b8b2e4b09e326626a2ea72780bf6298a0ca733c69f5586ea657e4bd90d";

  /** The skeleton's schema directory: surefire runs in {@code engine/api}. */
  private static Path skeleton() {
    for (Path p = Path.of("").toAbsolutePath(); p != null; p = p.getParent()) {
      Path candidate = p.resolve("corpus/structures/skeleton");
      if (Files.isRegularFile(p.resolve("mvnw")) && Files.isDirectory(candidate)) {
        return candidate;
      }
    }
    throw new IllegalStateException("no repository root above " + Path.of("").toAbsolutePath());
  }

  /** A model from {@code order.xsd} to itself with the given target field mappings. */
  private static byte[] orderToOrder(String targetFieldMappings) {
    return between("order.xsd", "order.xsd", targetFieldMappings);
  }

  /**
   * A model whose source and target bundles are the one file each names, both under the root {@code
   * Order}, with the given target field mappings.
   */
  private static byte[] between(String sourceFile, String targetFile, String targetFieldMappings) {
    String side =
        """
        {"bundle": ["%s"], "fingerprint": "%s",
         "root": {"element": "Q{%s}Order"}}""";
    return """
        {"formatVersion": 1, "source": %s, "target": %s, "targetFieldMappings": %s}
        """
        .formatted(
            side.formatted(sourceFile, FINGERPRINT, NS),
            side.formatted(targetFile, FINGERPRINT, NS),
            targetFieldMappings)
        .getBytes(UTF_8);
  }

  private static final String FIELD_LINK_MAPPINGS =
      """
      {"%1$s/OrderId": {"id": "t1", "result": "a1",
                        "boxes": {"a1": {"kind": "source", "field": "%1$s/OrderId"}}}}
      """
          .formatted(ORDER);

  private static final byte[] FIELD_LINK = orderToOrder(FIELD_LINK_MAPPINGS);

  private static CompiledMapping compiled(CompileResult result) {
    if (result instanceof CompileResult.Compiled(CompiledMapping mapping)) {
      return mapping;
    }
    throw new AssertionError("expected Compiled, got " + result);
  }

  private static List<Diagnostic> refusal(CompileResult result) {
    if (result instanceof CompileResult.Refused(List<Diagnostic> diagnostics)) {
      assertThat(diagnostics).allSatisfy(d -> assertThat(d.message()).isNotBlank());
      return diagnostics;
    }
    throw new AssertionError("expected Refused, got " + result);
  }

  private static Diagnostic error(String code, Location location) {
    return new Diagnostic(Severity.ERROR, code, location, "ignored");
  }

  /** Severity, code and location; never the message (ADR-0015). */
  private static List<String> described(List<Diagnostic> diagnostics) {
    return diagnostics.stream()
        .map(d -> d.severity() + " " + d.code() + " " + d.location())
        .toList();
  }

  @Test
  void deployIsOptimisedUntracedAndTestRunIsUnoptimisedTraced() {
    assertThat(CompileOptions.DEPLOY).isEqualTo(new CompileOptions(true, false));
    assertThat(CompileOptions.TEST_RUN).isEqualTo(new CompileOptions(false, true));
  }

  @Test
  void compileAndRunCopyTheFieldThroughTheChain() throws Exception {
    EngineFacade facade = new EngineFacade();
    // another prefix in the input, an unmapped attribute and an unmapped leaf
    byte[] input =
        ("<src:Order xmlns:src=\""
                + NS
                + "\" channel=\"web\"><OrderId>4711</OrderId><Quantity>3</Quantity></src:Order>")
            .getBytes(UTF_8);
    String expected =
        DECLARATION + "<ns0:Order xmlns:ns0=\"" + NS + "\"><OrderId>4711</OrderId></ns0:Order>";

    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      byte[] output = facade.run(compiled(facade.compile(FIELD_LINK, skeleton(), options)), input);

      assertThat(new String(output, UTF_8)).as("%s", options).isEqualTo(expected);
      assertThat(output).as("%s", options).isEqualTo(expected.getBytes(UTF_8));
    }
  }

  @Test
  void aStage3RefusalCarriesDiagnosticsAndNoMapping() throws Exception {
    byte[] model =
        orderToOrder(
            """
            {"%1$s/OrderId": {"id": "t1", "result": "f1",
                              "boxes": {"f1": {"kind": "function", "fn": "trim", "inputs": ["a1"]},
                                        "a1": {"kind": "source", "field": "%1$s/OrderId"}}},
             "%1$s/Quantity": {"id": "t2", "result": null,
                               "boxes": {"a2": {"kind": "source", "field": "%1$s/Quantity"}}}}
            """
                .formatted(ORDER));

    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(model, skeleton(), CompileOptions.DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(
            described(
                List.of(
                    error("unsupported-box-kind", new AtAuthoringId(new AuthoringId("f1"))),
                    error("unconnected-target-field", new AtAuthoringId(new AuthoringId("t2"))))));
  }

  @Test
  void aLoadRefusalIsACompileRefusal() throws Exception {
    byte[] newer =
        new String(FIELD_LINK, UTF_8)
            .replace("\"formatVersion\": 1", "\"formatVersion\": 2")
            .getBytes(UTF_8);

    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(newer, skeleton(), CompileOptions.DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(
            described(
                List.of(error("format-version-unsupported", new AtPointer("/formatVersion")))));
  }

  @Test
  void aStructureLoadErrorIsACompileRefusalAtItsFilePosition(@TempDir Path empty) throws Exception {
    // order.xsd is not in this directory: an error about the whole file, at line 1, column 1
    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(FIELD_LINK, empty, CompileOptions.DEPLOY));

    assertThat(diagnostics)
        .isNotEmpty()
        .allSatisfy(
            d -> {
              assertThat(d.severity()).isEqualTo(Severity.ERROR);
              assertThat(d.code()).isEqualTo("schema-unreadable");
              assertThat(d.location()).isEqualTo(new AtFilePosition("order.xsd", 1, 1));
            });
  }

  @Test
  void bothStructuresAreReadAndTheirLoadErrorsComeInFileOrder(@TempDir Path base) throws Exception {
    // the target's file is not well-formed: its mismatched end tag starts at line 2, column 1,
    // and the parser points at its name, column 3 (StructureReaderTest)
    Files.writeString(
        base.resolve("a-target.xsd"),
        "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">\n</xs:element>\n");
    // the source's file is not there at all; read first, it sorts after the target's file
    byte[] model = between("z-source.xsd", "a-target.xsd", FIELD_LINK_MAPPINGS);

    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(model, base, CompileOptions.DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(
            described(
                List.of(
                    error("schema-not-well-formed", new AtFilePosition("a-target.xsd", 2, 3)),
                    error("schema-unreadable", new AtFilePosition("z-source.xsd", 1, 1)))));
  }

  @Test
  void malformedJsonIsATransportError() {
    assertThatThrownBy(
            () -> new EngineFacade().compile(utf8("{\"formatVersion\": 1,"), skeleton(), DEPLOY))
        .isInstanceOf(MalformedJsonException.class);
  }

  @Test
  void malformedInputIsAMalformedInputException() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping = compiled(facade.compile(FIELD_LINK, skeleton(), DEPLOY));

    assertThatThrownBy(() -> facade.run(mapping, utf8("<src:Order xmlns:src=\"" + NS + "\">")))
        .isInstanceOf(MalformedInputException.class);
  }

  /**
   * The owner's decision for spec 1 (grilling of #21): no error although {@code OrderId} is 1..1.
   * {@code po:MINOCCURS} is spec 2, which replaces this test; it is no corpus case, because case
   * ids are permanent.
   */
  @Test
  void anEmptySourceWritesTheRootWithoutTheFieldUntilMinOccursIsEnforced() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] input = utf8("<src:Order xmlns:src=\"" + NS + "\"/>");
    String expected = DECLARATION + "<ns0:Order xmlns:ns0=\"" + NS + "\"/>";

    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      byte[] output = facade.run(compiled(facade.compile(FIELD_LINK, skeleton(), options)), input);

      assertThat(new String(output, UTF_8)).as("%s", options).isEqualTo(expected);
    }
  }

  private static byte[] utf8(String text) {
    return text.getBytes(UTF_8);
  }

  // --- export (#27, ADR-0023): the facade loads, reads both structures and lowers as compile
  // does, then the exporter writes the unoptimised IR. Whether the stylesheet runs is the
  // differential oracle's question (engine/oracle).

  /** The #27 design's stylesheet of the field link {@code OrderId <- OrderId}. */
  private static final String FIELD_LINK_STYLESHEET =
      """
      <?xml version="1.0" encoding="UTF-8"?>
      <xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" \
      xmlns:xs="http://www.w3.org/2001/XMLSchema" \
      xmlns:array="http://www.w3.org/2005/xpath-functions/array" \
      xmlns:po="urn:flottila:mapping:po" xmlns:s0="urn:flottila:corpus:skeleton" \
      xmlns:ns0="urn:flottila:corpus:skeleton" exclude-result-prefixes="#all">
        <xsl:import href="po-runtime.xsl"/>
        <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no" \
      omit-xml-declaration="no"/>
        <xsl:template match="/">
          <xsl:variable name="root" as="xs:integer" select="1"/>
          <ns0:Order>
            <xsl:for-each \
      select="po:slots(array:join(/s0:Order ! [OrderId ! string()]), $root, 1)">
              <xsl:variable name="value" as="xs:string" select="."/>
              <OrderId><xsl:value-of select="$value"/></OrderId>
            </xsl:for-each>
          </ns0:Order>
        </xsl:template>
      </xsl:stylesheet>
      """;

  private static List<Diagnostic> refusal(ExportResult result) {
    if (result instanceof ExportResult.Refused(List<Diagnostic> diagnostics)) {
      assertThat(diagnostics).allSatisfy(d -> assertThat(d.message()).isNotBlank());
      return diagnostics;
    }
    throw new AssertionError("expected Refused, got " + result);
  }

  @Test
  void exportOfTheFieldLinkGivesTheStylesheetAndItsHelperModule() throws Exception {
    ExportResult result = new EngineFacade().export(FIELD_LINK, skeleton());

    if (!(result instanceof ExportResult.Exported(String stylesheet, String helperModule))) {
      throw new AssertionError("expected Exported, got " + result);
    }
    assertThat(stylesheet).isEqualTo(FIELD_LINK_STYLESHEET);
    assertThat(helperModule).isEqualTo(XsltExporter.helperModule()).contains("po:slots");
  }

  /**
   * One target field would export, the other has a function box: the export is refused whole, never
   * a stylesheet of the part that would (#27 AC3).
   */
  @Test
  void exportOfAFunctionBoxIsRefusedWithUnsupportedBoxKindAtTheBox() throws Exception {
    byte[] model =
        orderToOrder(
            """
            {"%1$s/OrderId": {"id": "t1", "result": "a1",
                              "boxes": {"a1": {"kind": "source", "field": "%1$s/OrderId"}}},
             "%1$s/Quantity": {"id": "t2", "result": "f1",
                               "boxes": {"f1": {"kind": "function", "fn": "trim",
                                                "inputs": ["a2"]},
                                         "a2": {"kind": "source", "field": "%1$s/Quantity"}}}}
            """
                .formatted(ORDER));

    List<Diagnostic> diagnostics = refusal(new EngineFacade().export(model, skeleton()));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(
            described(
                List.of(error("unsupported-box-kind", new AtAuthoringId(new AuthoringId("f1"))))));
  }

  /** A refused model, the directory its bundle references resolve in, and its diagnostics. */
  private record RefusedModel(String why, byte[] model, Path base, List<Diagnostic> expected) {}

  @Test
  void exportRefusesWhatCompileRefuses(@TempDir Path base) throws Exception {
    // the target's file is not well-formed and the source's is not there: read source first,
    // reported in file order (bothStructuresAreReadAndTheirLoadErrorsComeInFileOrder)
    Files.writeString(
        base.resolve("a-target.xsd"),
        "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">\n</xs:element>\n");
    List<RefusedModel> refused =
        List.of(
            new RefusedModel(
                "a newer format version",
                new String(FIELD_LINK, UTF_8)
                    .replace("\"formatVersion\": 1", "\"formatVersion\": 2")
                    .getBytes(UTF_8),
                skeleton(),
                List.of(error("format-version-unsupported", new AtPointer("/formatVersion")))),
            new RefusedModel(
                "both structures' load errors",
                between("z-source.xsd", "a-target.xsd", FIELD_LINK_MAPPINGS),
                base,
                List.of(
                    error("schema-not-well-formed", new AtFilePosition("a-target.xsd", 2, 3)),
                    error("schema-unreadable", new AtFilePosition("z-source.xsd", 1, 1)))),
            new RefusedModel(
                "an unresolved box and an unconnected target field",
                orderToOrder(
                    """
                    {"%1$s/OrderId": {"id": "t1", "result": "r1",
                                      "boxes": {"r1": {"kind": "unresolved", "name": "FormatNum",
                                                       "origin": "po", "inputs": ["a1"]},
                                                "a1": {"kind": "source",
                                                       "field": "%1$s/OrderId"}}},
                     "%1$s/Quantity": {"id": "t2", "result": null,
                                       "boxes": {"a2": {"kind": "source",
                                                        "field": "%1$s/Quantity"}}}}
                    """
                        .formatted(ORDER)),
                skeleton(),
                List.of(
                    error("unresolved-function", new AtAuthoringId(new AuthoringId("r1"))),
                    error("unconnected-target-field", new AtAuthoringId(new AuthoringId("t2"))))));
    EngineFacade facade = new EngineFacade();

    // witness: compile refuses each model with exactly these diagnostics
    for (RefusedModel r : refused) {
      assertThat(described(refusal(facade.compile(r.model(), r.base(), DEPLOY))))
          .as("compile: %s", r.why())
          .containsExactlyElementsOf(described(r.expected()));
    }

    for (RefusedModel r : refused) {
      assertThat(described(refusal(facade.export(r.model(), r.base()))))
          .as("export: %s", r.why())
          .containsExactlyElementsOf(described(r.expected()));
    }
    assertThatThrownBy(() -> facade.export(utf8("{\"formatVersion\": 1,"), skeleton()))
        .isInstanceOf(MalformedJsonException.class);
  }

  @Test
  void facadeSavesWhatItLoadsByteIdenticalAndRefusesANewerFormatVersion() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] canonical = CANONICAL.getBytes(UTF_8);

    LoadResult loaded = facade.load(canonical);
    LoadResult newer =
        facade.load(
            CANONICAL.replace("\"formatVersion\": 1,", "\"formatVersion\": 2,").getBytes(UTF_8));

    assertThat(loaded).isInstanceOf(Loaded.class);
    assertThat(new String(facade.save(((Loaded) loaded).model()), UTF_8)).isEqualTo(CANONICAL);
    assertThat(newer)
        .isInstanceOfSatisfying(
            Refused.class,
            refused ->
                assertThat(refused.diagnostics())
                    .extracting(Diagnostic::code)
                    .containsExactly("format-version-unsupported"));
  }
}
