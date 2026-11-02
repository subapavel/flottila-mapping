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
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.Refused;
import io.flottila.mapping.mapping.Severity;
import io.flottila.mapping.mapping.StructureRef;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.xslt.export.XsltExporter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

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
    return CorpusStructures.directory("skeleton");
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

  /**
   * #62: a field link from a source leaf below two repeating structure fields, {@code
   * Orders/Order/Line/Sku}, to the target leaf {@code Out/All} directly under the root, over the
   * observation kit's structures. The root is created once, so the target reads the queue's first
   * context: the context the box names decides how many values that holds.
   */
  @Test
  void compileAndRunReadASourceLeafAtAnyDepthInItsContext() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    byte[] input =
        ("<Orders><Order><Id>1</Id><Line><Sku>A</Sku><Qty>1</Qty></Line><Line><Sku>B</Sku></Line>"
                + "</Order><Order><Line><Sku>C</Sku></Line></Order></Orders>")
            .getBytes(UTF_8);
    // the box's context, none for the default (the parent Line), and the target's All elements
    Map<String, String> byContext = new LinkedHashMap<>();
    byContext.put("", "<All>A</All>");
    byContext.put("/Orders/Order", "<All>A</All><All>B</All>");
    byContext.put("/Orders", "<All>A</All><All>B</All><All>C</All>");

    for (Map.Entry<String, String> context : byContext.entrySet()) {
      String box =
          context.getKey().isEmpty()
              ? "{\"kind\": \"source\", \"field\": \"/Orders/Order/Line/Sku\"}"
              : "{\"kind\": \"source\", \"field\": \"/Orders/Order/Line/Sku\", \"context\": \"%s\"}"
                  .formatted(context.getKey());
      byte[] model =
          """
          {"formatVersion": 1,
           "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                      "root": {"element": "Orders"}},
           "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                      "root": {"element": "Out"}},
           "targetFieldMappings": {"/Out/All": {"id": "t1", "result": "a1",
                                                "boxes": {"a1": %2$s}}}}
          """
              .formatted(FINGERPRINT, box)
              .getBytes(UTF_8);

      for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
        byte[] output = facade.run(compiled(facade.compile(model, observations, options)), input);

        assertThat(new String(output, UTF_8))
            .as("context '%s', %s", context.getKey(), options)
            .isEqualTo(DECLARATION + "<Out>" + context.getValue() + "</Out>");
      }
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

  @Test
  void exportOfAUdfBoxIsRefusedWithUnsupportedBoxKindAtTheBox() throws Exception {
    byte[] model =
        new String(
                orderToOrder(
                    """
                    {"%1$s/OrderId": {"id": "t1", "result": "u1",
                                      "boxes": {"u1": {"kind": "udf", "udf": "twice",
                                                       "inputs": ["a1"]},
                                                "a1": {"kind": "source",
                                                       "field": "%1$s/OrderId"}}}}
                    """
                        .formatted(ORDER)),
                UTF_8)
            .replace(
                "\"targetFieldMappings\":",
                """
                "udfs": {"twice": {"executionKind": "single", "inputs": ["value"],
                                   "source": "udfs/Numbers.java#twice"}},
                "targetFieldMappings":""")
            .getBytes(UTF_8);
    List<String> atTheBox =
        described(List.of(error("unsupported-box-kind", new AtAuthoringId(new AuthoringId("u1")))));
    // witness: the model passes stages 1 and 2, and compile refuses it at the box
    assertThat(described(refusal(new EngineFacade().compile(model, skeleton(), DEPLOY))))
        .containsExactlyElementsOf(atTheBox);

    List<Diagnostic> diagnostics = refusal(new EngineFacade().export(model, skeleton()));

    assertThat(described(diagnostics)).containsExactlyElementsOf(atTheBox);
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

  // --- function boxes (#50, ADR-0025): stage 3 checks a reached standard function box against
  // its catalogue entry, at the box. removeContexts has one input and no params.

  /**
   * The field link {@code OrderId <- OrderId} and {@code Note <- f1}, where {@code f1} is {@code
   * box}; {@code a2} reads {@code Note} and {@code a3} reads {@code OrderId}.
   */
  private static byte[] withFunctionBox(String box) {
    return orderToOrder(
        """
        {"%1$s/OrderId": {"id": "t1", "result": "a1",
                          "boxes": {"a1": {"kind": "source", "field": "%1$s/OrderId"}}},
         "%1$s/Note": {"id": "t2", "result": "f1",
                       "boxes": {"f1": %2$s,
                                 "a2": {"kind": "source", "field": "%1$s/Note"},
                                 "a3": {"kind": "source", "field": "%1$s/OrderId"}}}}
        """
            .formatted(ORDER, box));
  }

  /** The box each refused one below differs from in one place: the catalogue's one input. */
  private static final String REMOVE_CONTEXTS =
      """
      {"kind": "function", "fn": "removeContexts", "inputs": ["a2"]}""";

  /**
   * Witness: the well-formed box compiles and runs. {@code Note} is in the root's context, so the
   * queue has one context and removeContexts keeps it as it is.
   */
  private static void assertTheWellFormedBoxRuns() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] input =
        utf8(
            "<src:Order xmlns:src=\""
                + NS
                + "\"><OrderId>1</OrderId><Note>x</Note><Note>y</Note></src:Order>");

    byte[] output =
        facade.run(
            compiled(facade.compile(withFunctionBox(REMOVE_CONTEXTS), skeleton(), DEPLOY)), input);

    assertThat(new String(output, UTF_8))
        .isEqualTo(
            DECLARATION
                + "<ns0:Order xmlns:ns0=\""
                + NS
                + "\"><OrderId>1</OrderId><Note>x</Note><Note>y</Note></ns0:Order>");
  }

  /** The one diagnostic {@code code} at the function box {@code f1}. */
  private static List<String> atTheFunctionBox(String code) {
    return described(List.of(error(code, new AtAuthoringId(new AuthoringId("f1")))));
  }

  @Test
  void moreInputsThanTheCatalogueIsWrongArity() throws Exception {
    byte[] model =
        withFunctionBox(
            """
            {"kind": "function", "fn": "removeContexts", "inputs": ["a2", "a3"]}""");

    List<Diagnostic> diagnostics = refusal(new EngineFacade().compile(model, skeleton(), DEPLOY));

    assertThat(described(diagnostics)).containsExactlyElementsOf(atTheFunctionBox("wrong-arity"));
    assertTheWellFormedBoxRuns();
  }

  static Stream<Arguments> unconnectedInputs() {
    return Stream.of(
        Arguments.of(
            "an input slot that is null",
            """
            {"kind": "function", "fn": "removeContexts", "inputs": [null]}"""),
        Arguments.of(
            "an empty inputs array",
            """
            {"kind": "function", "fn": "removeContexts", "inputs": []}"""),
        Arguments.of(
            "no inputs member",
            """
            {"kind": "function", "fn": "removeContexts"}"""));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unconnectedInputs")
  void aNullOrAbsentInputIsUnconnectedInput(String why, String box) throws Exception {
    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(withFunctionBox(box), skeleton(), DEPLOY));

    assertThat(described(diagnostics))
        .as(why)
        .containsExactlyElementsOf(atTheFunctionBox("unconnected-input"));
    assertTheWellFormedBoxRuns();
  }

  static Stream<Arguments> unknownParameters() {
    return Stream.of(
        Arguments.of(
            "a string param",
            """
            {"kind": "function", "fn": "removeContexts", "inputs": ["a2"],
             "params": {"mode": "each"}}"""),
        // a key the entry lacks has no type to compare a table with: unknown, not wrong-type
        Arguments.of(
            "a table param",
            """
            {"kind": "function", "fn": "removeContexts", "inputs": ["a2"],
             "params": {"rows": {"a": "b"}}}"""));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unknownParameters")
  void aParamTheCatalogueLacksIsUnknownParameter(String why, String box) throws Exception {
    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(withFunctionBox(box), skeleton(), DEPLOY));

    assertThat(described(diagnostics))
        .as(why)
        .containsExactlyElementsOf(atTheFunctionBox("unknown-parameter"));
    assertTheWellFormedBoxRuns();
  }

  // --- box parameters (#55, ADR-0025): lowering fills in a param the box leaves out with its
  // catalogue default, and checks a param the box gives against the entry. splitByValue has one
  // input and the string param mode, whose default is eachValue.

  /**
   * The output of {@code Note <- box} over {@code Note} x, x, y. {@code Note} is in the root's
   * context, so the input queue has one context; the root's one slot reads context 1 of the box's
   * queue, which shows where the box split it: x alone after eachValue, x, x after valueChange, and
   * all three when nothing splits.
   */
  private static String notesThrough(String box) throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] input =
        utf8(
            "<src:Order xmlns:src=\""
                + NS
                + "\"><OrderId>1</OrderId><Note>x</Note><Note>x</Note><Note>y</Note></src:Order>");

    byte[] output =
        facade.run(compiled(facade.compile(withFunctionBox(box), skeleton(), DEPLOY)), input);

    return new String(output, UTF_8);
  }

  /** The output document with {@code OrderId} 1 and one {@code Note} per value of {@code notes}. */
  private static String withNotes(String... notes) {
    StringBuilder content = new StringBuilder("<OrderId>1</OrderId>");
    for (String note : notes) {
      content.append("<Note>").append(note).append("</Note>");
    }
    return DECLARATION + "<ns0:Order xmlns:ns0=\"" + NS + "\">" + content + "</ns0:Order>";
  }

  @Test
  void aParamTheBoxLeavesOutTakesTheCatalogueDefault() throws Exception {
    String output =
        notesThrough(
            """
            {"kind": "function", "fn": "splitByValue", "inputs": ["a2"]}""");

    // eachValue puts every value in a context of its own, so context 1 holds the first x only
    assertThat(output).isEqualTo(withNotes("x"));
  }

  static Stream<Arguments> modes() {
    return Stream.of(
        Arguments.of("eachValue", new String[] {"x"}),
        Arguments.of("valueChange", new String[] {"x", "x"}),
        // no value is "", so nothing splits
        Arguments.of("emptyValue", new String[] {"x", "x", "y"}));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("modes")
  void aParamTheBoxGivesIsPassedToTheFunction(String mode, String[] notes) throws Exception {
    String output =
        notesThrough(
            """
            {"kind": "function", "fn": "splitByValue", "inputs": ["a2"],
             "params": {"mode": "%s"}}"""
                .formatted(mode));

    assertThat(output).isEqualTo(withNotes(notes));
  }

  @Test
  void aTableForAStringParamIsWrongParameterType() throws Exception {
    byte[] model =
        withFunctionBox(
            """
            {"kind": "function", "fn": "splitByValue", "inputs": ["a2"],
             "params": {"mode": {"eachValue": "valueChange"}}}""");

    List<Diagnostic> diagnostics = refusal(new EngineFacade().compile(model, skeleton(), DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(atTheFunctionBox("wrong-parameter-type"));
  }

  static Stream<Arguments> invalidModes() {
    return Stream.of(
        // SAP PO's label of the mode, not the catalogue's value
        Arguments.of("a label", "Each Value"),
        Arguments.of("another case", "eachvalue"),
        Arguments.of("the empty string", ""));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("invalidModes")
  void aStringOutsideTheParamsValuesIsInvalidParameterValue(String why, String mode)
      throws Exception {
    byte[] model =
        withFunctionBox(
            """
            {"kind": "function", "fn": "splitByValue", "inputs": ["a2"],
             "params": {"mode": "%s"}}"""
                .formatted(mode));

    List<Diagnostic> diagnostics = refusal(new EngineFacade().compile(model, skeleton(), DEPLOY));

    assertThat(described(diagnostics))
        .as(why)
        .containsExactlyElementsOf(atTheFunctionBox("invalid-parameter-value"));
  }

  @Test
  void aParamKeyBesideAValidParamIsStillUnknownParameter() throws Exception {
    byte[] model =
        withFunctionBox(
            """
            {"kind": "function", "fn": "splitByValue", "inputs": ["a2"],
             "params": {"mode": "valueChange", "order": "ascending"}}""");

    List<Diagnostic> diagnostics = refusal(new EngineFacade().compile(model, skeleton(), DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(atTheFunctionBox("unknown-parameter"));
  }

  // --- a new mapping (#54, ADR-0016): the facade, not the service, builds it

  @Test
  void aNewMappingHasBothStructureRefsAndNoTargetFieldMapping() throws Exception {
    EngineFacade facade = new EngineFacade();
    StructureRef source =
        new StructureRef(
            new SchemaBundle(List.of("order.xsd")),
            new ElementRoot("Order"),
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    StructureRef target =
        new StructureRef(
            new SchemaBundle(List.of("invoice.xsd")),
            new ElementRoot("Invoice"),
            "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210");
    String expected = CANONICAL.substring(0, CANONICAL.indexOf(",\n  \"targetFieldMappings\""));

    MappingModel created = facade.newMapping(source, target);

    assertThat(new String(facade.save(created), UTF_8)).isEqualTo(expected + "\n}\n");
    assertThat(facade.load(facade.save(created))).isEqualTo(new Loaded(created));
  }

  // --- a test run under its timeout (#54, ADR-0014 "Running"): the run is interrupted, never
  // stopped, and the slot loops and the parse check for it

  /**
   * An input whose parse alone takes far longer than a zero timeout: 200 000 unmapped {@code Note}
   * elements, each an event the projection checks for an interrupt.
   */
  private static byte[] largeInput() {
    return utf8(
        "<src:Order xmlns:src=\""
            + NS
            + "\"><OrderId>4711</OrderId>"
            + "<Note>n</Note>".repeat(200_000)
            + "</src:Order>");
  }

  @Test
  void aTestRunWithinItsTimeoutGivesTheOutputOfARun() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));
    byte[] input = utf8("<src:Order xmlns:src=\"" + NS + "\"><OrderId>4711</OrderId></src:Order>");

    byte[] run = facade.run(mapping, input);

    TestRunResult result = facade.testRun(mapping, input, Duration.ofSeconds(10));

    assertThat(result)
        .isInstanceOfSatisfying(
            TestRunResult.Output.class, output -> assertThat(output.output()).isEqualTo(run));
  }

  @Test
  void aTestRunPastItsTimeoutIsTheRuntimeErrorFlottilaTimeout() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    TestRunResult result = facade.testRun(mapping, largeInput(), Duration.ZERO);

    assertThat(result)
        .isInstanceOfSatisfying(
            TestRunResult.RuntimeError.class,
            error -> {
              assertThat(error.code()).isEqualTo("flottila:TIMEOUT");
              assertThat(error.message()).isNotBlank();
            });
    assertThat(Thread.currentThread().isInterrupted())
        .as("the caller is not interrupted")
        .isFalse();
  }

  @Test
  void malformedInputInATestRunIsAMalformedInputException() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    assertThatThrownBy(
            () ->
                facade.testRun(
                    mapping, utf8("<src:Order xmlns:src=\"" + NS + "\">"), Duration.ofSeconds(10)))
        .isInstanceOf(MalformedInputException.class);
  }

  @Test
  void anUncheckedFailureOfATestRunCarriesItsCause() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    assertThatThrownBy(() -> facade.testRun(mapping, null, Duration.ofSeconds(10)))
        .isInstanceOf(IllegalStateException.class)
        .hasCauseInstanceOf(NullPointerException.class);
  }

  @Test
  void anInterruptedCallerCancelsTheTestRunAndKeepsItsInterrupt() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));
    byte[] input = largeInput();

    Thread.currentThread().interrupt();
    try {
      assertThatThrownBy(() -> facade.testRun(mapping, input, Duration.ofSeconds(10)))
          .isInstanceOf(CancellationException.class);
    } finally {
      assertThat(Thread.interrupted()).as("the interrupt is kept").isTrue();
    }
  }

  // --- useOneAsMany's error conditions (#56): an assumed reading (#2 §7.10, #34)

  /** obs-useoneasmany uoam-1 with its result on {@code Out/All}: Id, Sku in context Order, Tag. */
  private static final byte[] USE_ONE_AS_MANY =
      """
      {"formatVersion": 1,
       "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                  "root": {"element": "Orders"}},
       "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                  "root": {"element": "Out"}},
       "targetFieldMappings": {"/Out/All": {"id": "t1", "result": "u1",
         "boxes": {"u1": {"kind": "function", "fn": "useOneAsMany", "inputs": ["a1", "a2", "a3"]},
                   "a1": {"kind": "source", "field": "/Orders/Order/Id"},
                   "a2": {"kind": "source", "field": "/Orders/Order/Line/Sku",
                          "context": "/Orders/Order"},
                   "a3": {"kind": "source", "field": "/Orders/Order/Tag"}}}}}
      """
          .formatted(FINGERPRINT)
          .getBytes(UTF_8);

  /** One order with Id A, the given Tags and one Line per Sku. */
  private static byte[] order(int tags, int skus) {
    return utf8(
        "<Orders><Order><Id>A</Id>"
            + "<Tag>t</Tag>".repeat(tags)
            + "<Line><Sku>s</Sku></Line>".repeat(skus)
            + "</Order></Orders>");
  }

  /**
   * The input of obs-useoneasmany u2.xml: three Skus but two Tags, so the third input has fewer
   * slots than the second. The run stops and writes nothing. No runtime error has a code before
   * #52, so a test run reports it as an unchecked failure; #52's code replaces this test, and the
   * u2 to u4 corpus cases follow it.
   */
  @Test
  void aUseOneAsManyCountMismatchStopsTheRun() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    CompiledMapping deployed = compiled(facade.compile(USE_ONE_AS_MANY, observations, DEPLOY));
    // witness: with as many Tags as Skus (u1.xml's first order) the mapping runs
    assertThat(new String(facade.run(deployed, order(3, 3)), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>A</All><All>A</All><All>A</All></Out>");

    assertThatThrownBy(() -> facade.run(deployed, order(2, 3)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("useOneAsMany");
    CompiledMapping tested =
        compiled(facade.compile(USE_ONE_AS_MANY, observations, CompileOptions.TEST_RUN));
    assertThatThrownBy(() -> facade.testRun(tested, order(2, 3), Duration.ofSeconds(10)))
        .isInstanceOf(IllegalStateException.class)
        .hasCauseInstanceOf(IllegalArgumentException.class);
  }

  // --- formatByExample's count mismatch (#58): documented as an exception (#2 §4)

  /**
   * The corpus mapping of fn/formatByExample, Tag formatted by Sku in context Order, run on three
   * Tags but two Skus: the SAP documentation requires equal value counts and raises an exception
   * otherwise; to observe on PO 7.5 and CPI (#61). The run stops and writes nothing. No runtime
   * error has a code before #52, so a test run reports it as an unchecked failure; #52's code
   * replaces this test, and a corpus case follows it.
   */
  @Test
  void aFormatByExampleCountMismatchStopsTheRun() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path mapping =
        CorpusStructures.directory("observations")
            .resolve("../../mappings/format-by-example.mapping.json")
            .normalize();
    byte[] model = Files.readAllBytes(mapping);
    CompiledMapping deployed = compiled(facade.compile(model, mapping.getParent(), DEPLOY));
    // witness: with as many Tags as Skus the mapping runs
    assertThat(new String(facade.run(deployed, order(2, 2)), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>t</All><All>t</All></Out>");

    assertThatThrownBy(() -> facade.run(deployed, order(3, 2)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("formatByExample");
    CompiledMapping tested =
        compiled(facade.compile(model, mapping.getParent(), CompileOptions.TEST_RUN));
    assertThatThrownBy(() -> facade.testRun(tested, order(3, 2), Duration.ofSeconds(10)))
        .isInstanceOf(IllegalStateException.class)
        .hasCauseInstanceOf(IllegalArgumentException.class);
  }

  // --- the runtime errors of sort and sortByKey (#59). No runtime error has a code before #52, so
  // a run reports them as unchecked failures; #52's code replaces these tests, and corpus cases
  // follow them. The export raises err:FORG0001 and po:SORTBYKEY for the same inputs.

  /**
   * sort of Tag with {@code params}, on {@code Out/All}: context 1 of the queue, the first Order.
   */
  private static byte[] sortOfTags(String params) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Out"}},
         "targetFieldMappings": {"/Out/All": {"id": "t1", "result": "s1",
           "boxes": {"s1": {"kind": "function", "fn": "sort", "inputs": ["a1"],
                            "params": %2$s},
                     "a1": {"kind": "source", "field": "/Orders/Order/Tag"}}}}}
        """
        .formatted(FINGERPRINT, params)
        .getBytes(UTF_8);
  }

  /**
   * A numeric sort over a value that is no xs:decimal stops the run (#48 Q4, assumed), here {@code
   * x} beside 10 and 9, and the run writes nothing.
   */
  @Test
  void aNumericSortOverANonNumberStopsTheRun() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    byte[] input = utf8("<Orders><Order><Tag>10</Tag><Tag>x</Tag><Tag>9</Tag></Order></Orders>");
    CompiledMapping lexicographic =
        compiled(facade.compile(sortOfTags("{}"), observations, DEPLOY));
    // witness: lexicographically the same Tags sort
    assertThat(new String(facade.run(lexicographic, input), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>10</All><All>9</All><All>x</All></Out>");
    CompiledMapping numeric =
        compiled(facade.compile(sortOfTags("{\"comparison\": \"numeric\"}"), observations, DEPLOY));

    assertThatThrownBy(() -> facade.run(numeric, input))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("sort")
        .hasMessageContaining("\"x\"");
  }

  /** sortByKey of Qty by Sku, both in context Order, on {@code Out/All}. */
  private static final byte[] SORT_BY_KEY =
      """
      {"formatVersion": 1,
       "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                  "root": {"element": "Orders"}},
       "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                  "root": {"element": "Out"}},
       "targetFieldMappings": {"/Out/All": {"id": "t1", "result": "k1",
         "boxes": {"k1": {"kind": "function", "fn": "sortByKey", "inputs": ["a1", "a2"]},
                   "a1": {"kind": "source", "field": "/Orders/Order/Line/Sku",
                          "context": "/Orders/Order"},
                   "a2": {"kind": "source", "field": "/Orders/Order/Line/Qty",
                          "context": "/Orders/Order"}}}}}
      """
          .formatted(FINGERPRINT)
          .getBytes(UTF_8);

  /**
   * A key/value count mismatch stops the run (#2 §4, documented): the second Line has a Sku but no
   * Qty, so the Order has two keys and one value.
   */
  @Test
  void aSortByKeyCountMismatchStopsTheRun() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(SORT_BY_KEY, CorpusStructures.directory("observations"), DEPLOY));
    // witness: with a Qty on every Line the values follow their keys
    assertThat(
            new String(
                facade.run(
                    mapping,
                    utf8(
                        "<Orders><Order><Line><Sku>b</Sku><Qty>1</Qty></Line>"
                            + "<Line><Sku>a</Sku><Qty>2</Qty></Line></Order></Orders>")),
                UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>2</All><All>1</All></Out>");

    assertThatThrownBy(
            () ->
                facade.run(
                    mapping,
                    utf8(
                        "<Orders><Order><Line><Sku>b</Sku><Qty>1</Qty></Line>"
                            + "<Line><Sku>a</Sku></Line></Order></Orders>")))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("sortByKey")
        .hasMessageContaining("keys: 2, values: 1");
  }
}
