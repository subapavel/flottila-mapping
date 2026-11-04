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
import io.flottila.mapping.runtime.ExecutableMapping;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.runtime.MappingRunException;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.xslt.export.XsltExporter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
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

  /** The trace limit of ADR-0015 (#53). */
  private static final int TRACE_LIMIT = 10_000;

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

  /**
   * A model from the observation kit's {@code src-orders.xsd} to {@code tgt-parents.xsd} (#63) with
   * the given target field mappings.
   */
  private static byte[] ordersToParents(String targetFieldMappings) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["tgt-parents.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Parents"}},
         "targetFieldMappings": %2$s}
        """
        .formatted(FINGERPRINT, targetFieldMappings)
        .getBytes(UTF_8);
  }

  private static final byte[] TWO_ORDERS =
      ("<Orders><Order><Id>o1</Id><Line><Sku>a</Sku></Line></Order>"
              + "<Order><Line><Sku>b</Sku></Line><Line><Sku>c</Sku></Line></Order></Orders>")
          .getBytes(UTF_8);

  /**
   * #63: a leaf mapped under the unmapped 1..1 {@code Head} compiles and runs; until #63 it was
   * {@code unsupported-field}. Head is created once with the root's slot number, so {@code Id}
   * reads the queue's first context. The unmapped 2..2 {@code Pair} is created twice with nothing
   * mapped under it, and the unmapped optional {@code Opt} and {@code Item} are left out (ADR-0006
   * "Target fields").
   */
  @Test
  void aLeafUnderAnUnmappedParentCompilesAndRuns() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] model =
        ordersToParents(
            """
            {"/Parents/Head/Id": {"id": "t1", "result": "a1",
               "boxes": {"a1": {"kind": "source", "field": "/Orders/Order/Id",
                                "context": "/Orders"}}}}
            """);

    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      CompileResult result =
          facade.compile(model, CorpusStructures.directory("observations"), options);
      byte[] output = facade.run(compiled(result), TWO_ORDERS);

      assertThat(new String(output, UTF_8))
          .as("%s", options)
          .isEqualTo(DECLARATION + "<Parents><Head><Id>o1</Id></Head><Pair/><Pair/></Parents>");
    }
  }

  /**
   * #63: a source structure field mapped to a target structure field creates one target occurrence
   * per source occurrence, an Order without an {@code Id} included (ADR-0008: one {@code ""} per
   * occurrence), and the children read their contexts by its slot numbers, here under the unmapped
   * 1..1 {@code Info}, whose slot number is its Item's.
   */
  @Test
  void aSourceStructureFieldMapsOntoATargetStructureField() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] model =
        ordersToParents(
            """
            {"/Parents/Item": {"id": "t1", "result": "a1",
               "boxes": {"a1": {"kind": "source", "field": "/Orders/Order",
                                "context": "/Orders"}}},
             "/Parents/Item/Info/Sku": {"id": "t2", "result": "a2",
               "boxes": {"a2": {"kind": "source", "field": "/Orders/Order/Line/Sku",
                                "context": "/Orders/Order"}}}}
            """);
    String twins = "<Twin/><Twin/>";

    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      CompileResult result =
          facade.compile(model, CorpusStructures.directory("observations"), options);
      byte[] output = facade.run(compiled(result), TWO_ORDERS);

      assertThat(new String(output, UTF_8))
          .as("%s", options)
          .isEqualTo(
              DECLARATION
                  + "<Parents><Head/><Pair/><Pair/>"
                  + "<Item><Info><Sku>a</Sku></Info>"
                  + twins
                  + "</Item><Item><Info><Sku>b</Sku><Sku>c</Sku></Info>"
                  + twins
                  + "</Item></Parents>");
    }
  }

  @Test
  void aStage3RefusalCarriesDiagnosticsAndNoMapping() throws Exception {
    byte[] model =
        orderToOrder(
            """
            {"%1$s/OrderId": {"id": "t1", "result": "f1",
                              "boxes": {"f1": {"kind": "function", "fn": "rfcLookup", "inputs": ["a1"]},
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

  // --- an unmapped mandatory target leaf (#65, ADR-0006 Consequences, #31 c1): a design-time error
  // at the target field mapping the leaf lacks, under every parent that is created

  /**
   * The location of {@code unmapped-mandatory-leaf}: the pointer to the leaf's absent member of
   * {@code targetFieldMappings}, its field path escaped as RFC 6901 says.
   */
  private static AtPointer unmappedAt(String fieldPath) {
    return new AtPointer("/targetFieldMappings/" + fieldPath.replace("~", "~0").replace("/", "~1"));
  }

  /**
   * A model from the observation kit's {@code src-orders.xsd} to {@code targetFile}'s {@code root}.
   */
  private static byte[] ordersTo(String targetFile, String root, String targetFieldMappings) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["%2$s"], "fingerprint": "%1$s", "root": {"element": "%3$s"}},
         "targetFieldMappings": %4$s}
        """
        .formatted(FINGERPRINT, targetFile, root, targetFieldMappings)
        .getBytes(UTF_8);
  }

  /** {@code Orders/Order/Id} in the context {@code Orders} onto {@code field}, as {@code id}. */
  private static String orderIdOnto(String field, String id) {
    return """
        "%s": {"id": "%s", "result": "s%2$s",
               "boxes": {"s%2$s": {"kind": "source", "field": "/Orders/Order/Id",
                                   "context": "/Orders"}}}"""
        .formatted(field, id);
  }

  static Stream<Arguments> unmappedMandatoryLeaves() {
    return Stream.of(
        // under the root: order.xsd with only Quantity mapped, the gap #63 found
        Arguments.of(
            "under the root",
            orderToOrder(
                """
                {"%1$s/Quantity": {"id": "t1", "result": "a1",
                                   "boxes": {"a1": {"kind": "source", "field": "%1$s/Quantity"}}}}
                """
                    .formatted(ORDER)),
            skeleton(),
            ORDER + "/OrderId"),
        // #31 c1: the unmapped 1..1 Head is created by TargetRepeat and is not reported itself
        Arguments.of(
            "under an unmapped n..n parent",
            ordersTo(
                "tgt-unmapped.xsd", "Unmapped", "{" + orderIdOnto("/Unmapped/Head/A", "t1") + "}"),
            CorpusStructures.directory("observations"),
            "/Unmapped/Head/Req"),
        Arguments.of(
            "under a mapped parent",
            ordersTo(
                "tgt-unmapped.xsd",
                "Unmapped",
                """
                {"/Unmapped/Head": {"id": "t1", "result": "a1",
                   "boxes": {"a1": {"kind": "source", "field": "/Orders/Order",
                                    "context": "/Orders"}}}}
                """),
            CorpusStructures.directory("observations"),
            "/Unmapped/Head/Req"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unmappedMandatoryLeaves")
  void anUnmappedMandatoryLeafIsADiagnosticAtItsTargetField(
      String why, byte[] model, Path base, String leaf) throws Exception {
    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      List<Diagnostic> diagnostics = refusal(new EngineFacade().compile(model, base, options));

      assertThat(described(diagnostics))
          .as("%s", options)
          .containsExactlyElementsOf(
              described(List.of(error("unmapped-mandatory-leaf", unmappedAt(leaf)))));
    }
  }

  /**
   * A target with two mandatory leaves under the root, {@code First} and {@code Last}, and a third,
   * {@code Must}, under the optional {@code Opt}. {@code Free} is optional.
   */
  private static final String MANDATORY_XSD =
      """
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Root">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Last" type="xs:string"/>
              <xs:element name="Opt" minOccurs="0">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="Must" type="xs:string"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="First" type="xs:string"/>
              <xs:element name="Free" type="xs:string" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
      """;

  /** The model from {@code mandatory.xsd} to itself with the given target field mappings. */
  private static byte[] mandatory(Path base, String targetFieldMappings) throws Exception {
    Files.writeString(base.resolve("mandatory.xsd"), MANDATORY_XSD);
    String side =
        """
        {"bundle": ["mandatory.xsd"], "fingerprint": "%s", "root": {"element": "Root"}}"""
            .formatted(FINGERPRINT);
    return """
        {"formatVersion": 1, "source": %1$s, "target": %1$s, "targetFieldMappings": %2$s}
        """
        .formatted(side, targetFieldMappings)
        .getBytes(UTF_8);
  }

  private static String copy(String field, String id) {
    return """
        "%1$s": {"id": "%2$s", "result": "s%2$s",
                 "boxes": {"s%2$s": {"kind": "source", "field": "%1$s"}}}"""
        .formatted(field, id);
  }

  /**
   * Every unmapped mandatory leaf is reported, not only the first the target walk meets, sorted by
   * location; the mandatory {@code Must} under the unmapped optional {@code Opt} is left out with
   * it and stays silent, as does the optional {@code Free}.
   */
  @Test
  void everyUnmappedMandatoryLeafIsReportedAndOneUnderALeftOutParentIsNot(@TempDir Path base)
      throws Exception {
    byte[] model = mandatory(base, "{" + copy("/Root/Free", "t1") + "}");

    List<Diagnostic> diagnostics =
        refusal(new EngineFacade().compile(model, base, CompileOptions.DEPLOY));

    assertThat(described(diagnostics))
        .containsExactlyElementsOf(
            described(
                List.of(
                    error("unmapped-mandatory-leaf", unmappedAt("/Root/First")),
                    error("unmapped-mandatory-leaf", unmappedAt("/Root/Last")))));
  }

  /**
   * What stays silent compiles and runs: the optional {@code Free} and the unmapped optional {@code
   * Opt} with its mandatory {@code Must}, which are left out; c1 with {@code Req} mapped and the
   * optional {@code A} unmapped.
   */
  @Test
  void anOptionalLeafAndALeafUnderALeftOutParentStaySilent(@TempDir Path base) throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    byte[] leftOut =
        mandatory(base, "{" + copy("/Root/Last", "t1") + ", " + copy("/Root/First", "t2") + "}");
    byte[] c1 =
        ordersTo(
            "tgt-unmapped.xsd", "Unmapped", "{" + orderIdOnto("/Unmapped/Head/Req", "t1") + "}");

    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      byte[] root =
          facade.run(
              compiled(facade.compile(leftOut, base, options)),
              utf8("<Root><Last>l</Last><First>f</First><Free>x</Free></Root>"));
      byte[] head = facade.run(compiled(facade.compile(c1, observations, options)), TWO_ORDERS);

      assertThat(new String(root, UTF_8))
          .as("%s", options)
          .isEqualTo(DECLARATION + "<Root><Last>l</Last><First>f</First></Root>");
      assertThat(new String(head, UTF_8))
          .as("%s", options)
          .isEqualTo(DECLARATION + "<Unmapped><Head><Req>o1</Req></Head></Unmapped>");
    }
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

  // --- runtime errors (#52, ADR-0015): a run that meets an error condition in its data stops with
  // the error's QName at its authoring id, and a test run returns it with no output

  /**
   * {@code TestRunResult.RuntimeError} with {@code code} at {@code authoringId}, and a message
   * (ADR-0015: {@code error {code, message, authoringId}}).
   */
  private static void assertRuntimeError(TestRunResult result, String code, String authoringId) {
    assertThat(result)
        .isInstanceOfSatisfying(
            TestRunResult.RuntimeError.class,
            error -> {
              assertThat(error.code()).as("code").isEqualTo(code);
              assertThat(error.authoringId())
                  .as("authoring id")
                  .contains(new AuthoringId(authoringId));
              assertThat(error.message()).as("message").isNotBlank();
            });
  }

  /** {@code run} throws {@code MappingRunException} with {@code code} at {@code authoringId}. */
  private static void assertRunThrows(
      EngineFacade facade, CompiledMapping mapping, byte[] input, String code, String authoringId) {
    assertThatThrownBy(() -> facade.run(mapping, input))
        .isInstanceOfSatisfying(
            MappingRunException.class,
            e -> {
              assertThat(e.code()).as("code").isEqualTo(code);
              assertThat(e.authoringId())
                  .as("authoring id")
                  .isEqualTo(new AuthoringId(authoringId));
            });
  }

  /**
   * An empty source under the 1..1 OrderId: no occurrence is created, fewer than its min, so the
   * run raises {@code po:MINOCCURS} at the target field mapping t1, not at the source box a1
   * (ADR-0006 since #52, #2 §2 documented). It replaces spec 1's interim test, which wrote the root
   * without the field.
   */
  @Test
  void aMinOccursShortfallIsARuntimeErrorAtItsTargetFieldMapping() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] input = utf8("<src:Order xmlns:src=\"" + NS + "\"/>");
    CompiledMapping tested =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));
    // witness: with its OrderId the same source runs
    assertThat(
            facade.testRun(
                tested,
                utf8("<src:Order xmlns:src=\"" + NS + "\"><OrderId>1</OrderId></src:Order>"),
                Duration.ofSeconds(10),
                TRACE_LIMIT))
        .isInstanceOf(TestRunResult.Output.class);

    assertRuntimeError(
        facade.testRun(tested, input, Duration.ofSeconds(10), TRACE_LIMIT), "po:MINOCCURS", "t1");
    for (CompileOptions options : List.of(CompileOptions.DEPLOY, CompileOptions.TEST_RUN)) {
      assertRunThrows(
          facade,
          compiled(facade.compile(FIELD_LINK, skeleton(), options)),
          input,
          "po:MINOCCURS",
          "t1");
    }
  }

  /**
   * {@code run} throws what {@code testRun} returns: the same code and authoring id, for an error
   * at a target field mapping and for one at a function box.
   */
  @Test
  void runThrowsWhatTestRunReturns() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping fieldLink =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));
    CompiledMapping useOneAsMany =
        compiled(
            facade.compile(
                USE_ONE_AS_MANY,
                CorpusStructures.directory("observations"),
                CompileOptions.TEST_RUN));
    byte[] emptySource = utf8("<src:Order xmlns:src=\"" + NS + "\"/>");

    for (var run :
        List.of(Map.entry(fieldLink, emptySource), Map.entry(useOneAsMany, order(2, 3)))) {
      TestRunResult result =
          facade.testRun(run.getKey(), run.getValue(), Duration.ofSeconds(10), TRACE_LIMIT);
      assertThat(result).isInstanceOf(TestRunResult.RuntimeError.class);
      TestRunResult.RuntimeError error = (TestRunResult.RuntimeError) result;

      assertRunThrows(
          facade,
          run.getKey(),
          run.getValue(),
          error.code(),
          error.authoringId().orElseThrow().value());
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
      select="po:at-least(po:slots(po:source-queue(array:join(/s0:Order ! [OrderId ! string()])), $root, 1), 1, 't1')">
              <xsl:variable name="slot2" as="xs:integer" select="?1"/>
              <xsl:variable name="value2" as="xs:string" select="?2"/>
              <OrderId><xsl:value-of select="$value2"/></OrderId>
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
                               "boxes": {"f1": {"kind": "function", "fn": "rfcLookup",
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

    TestRunResult result = facade.testRun(mapping, input, Duration.ofSeconds(10), TRACE_LIMIT);

    assertThat(result)
        .isInstanceOfSatisfying(
            TestRunResult.Output.class, output -> assertThat(output.output()).isEqualTo(run));
  }

  @Test
  void aTestRunPastItsTimeoutIsTheRuntimeErrorFlottilaTimeout() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    TestRunResult result = facade.testRun(mapping, largeInput(), Duration.ZERO, TRACE_LIMIT);

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

  // --- the published catalogue (ADR-0026): the facade serves the packed bytes

  /** The one {@code function-catalogue.json} engine/mapping packs, read without the facade. */
  private static byte[] packedCatalogue() throws Exception {
    Path artifact =
        Path.of(
            io.flottila.mapping.mapping.Lowering.class
                .getProtectionDomain()
                .getCodeSource()
                .getLocation()
                .toURI());
    if (!Files.isDirectory(artifact)) {
      try (java.nio.file.FileSystem jar = java.nio.file.FileSystems.newFileSystem(artifact)) {
        return Files.readAllBytes(onlyCatalogue(jar.getPath("/")));
      }
    }
    return Files.readAllBytes(onlyCatalogue(artifact));
  }

  private static Path onlyCatalogue(Path root) throws Exception {
    List<Path> found;
    try (Stream<Path> files = Files.walk(root)) {
      found =
          files
              .filter(
                  p ->
                      p.getFileName() != null
                          && p.getFileName().toString().equals("function-catalogue.json"))
              .toList();
    }
    assertThat(found).as("function-catalogue.json under %s", root).hasSize(1);
    return found.getFirst();
  }

  @Test
  void theCatalogueIsThePackedResource() throws Exception {
    EngineFacade facade = new EngineFacade();
    byte[] packed = packedCatalogue();
    // witness: the packed catalogue holds spec 2's functions
    assertThat(new String(packed, UTF_8)).contains("\"useOneAsMany\": {");

    byte[] first = facade.catalogue();

    assertThat(first).isEqualTo(packed);
    // a fresh copy on each call: a caller that writes into one changes no other
    first[0] = (byte) ' ';
    assertThat(facade.catalogue()).isEqualTo(packed).isNotSameAs(first);
  }

  /** ADR-0015 since #52: {@code flottila:TIMEOUT} has no authoring id. */
  @Test
  void aTimeoutHasNoAuthoringId() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    TestRunResult result = facade.testRun(mapping, largeInput(), Duration.ZERO, TRACE_LIMIT);

    assertThat(result)
        .isInstanceOfSatisfying(
            TestRunResult.RuntimeError.class,
            error -> {
              assertThat(error.code()).isEqualTo("flottila:TIMEOUT");
              assertThat(error.authoringId()).isEmpty();
            });
  }

  /** The live platform threads other than this one that are inside a mapping run. */
  private static Set<Thread> platformThreadsInAMapping() {
    // Thread.getAllStackTraces holds platform threads only, never a virtual one
    return Thread.getAllStackTraces().entrySet().stream()
        .filter(e -> e.getKey() != Thread.currentThread())
        .filter(
            e ->
                Stream.of(e.getValue())
                    .anyMatch(f -> f.getClassName().equals(ExecutableMapping.class.getName())))
        .map(Map.Entry::getKey)
        .collect(Collectors.toSet());
  }

  /**
   * ADR-0020 (O5 of the #52 design): a test run runs on a platform thread, never a virtual one,
   * because a spinning virtual thread holds its carrier. While a long test run parses, a platform
   * thread that was not inside {@code ExecutableMapping.run} before the test run is; a virtual run
   * thread is never among the platform threads. It is a daemon, so a run that ignores its interrupt
   * never holds the JVM open. The facade's deadline, a test's port (CODING_STANDARDS: no sleeps),
   * looks for the thread while the run is live, and an earlier test's interrupted run, still
   * ending, is told apart by its identity, so nothing waits for it.
   */
  @Test
  void aTestRunRunsOnAPlatformThread() throws Exception {
    CompiledMapping mapping =
        compiled(new EngineFacade().compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));
    byte[] input =
        utf8(
            "<src:Order xmlns:src=\""
                + NS
                + "\"><OrderId>4711</OrderId>"
                + "<Note>n</Note>".repeat(1_000_000)
                + "</src:Order>");
    Set<Thread> before = platformThreadsInAMapping();
    AtomicReference<Thread> seen = new AtomicReference<>();
    EngineFacade facade =
        new EngineFacade(
            (run, timeout, tracer) -> {
              while (!run.isDone() && seen.get() == null) {
                platformThreadsInAMapping().stream()
                    .filter(thread -> !before.contains(thread))
                    .findFirst()
                    .ifPresent(seen::set);
              }
              return run.get();
            });

    TestRunResult result = facade.testRun(mapping, input, Duration.ofSeconds(30), TRACE_LIMIT);

    assertThat(result).isInstanceOf(TestRunResult.Output.class);
    assertThat(seen.get()).as("a new platform thread inside ExecutableMapping.run").isNotNull();
    assertThat(seen.get().isVirtual()).as("the run's thread is virtual").isFalse();
    assertThat(seen.get().isDaemon()).as("the run's thread is a daemon").isTrue();
  }

  @Test
  void malformedInputInATestRunIsAMalformedInputException() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    assertThatThrownBy(
            () ->
                facade.testRun(
                    mapping,
                    utf8("<src:Order xmlns:src=\"" + NS + "\">"),
                    Duration.ofSeconds(10),
                    TRACE_LIMIT))
        .isInstanceOf(MalformedInputException.class);
  }

  @Test
  void anUncheckedFailureOfATestRunCarriesItsCause() throws Exception {
    EngineFacade facade = new EngineFacade();
    CompiledMapping mapping =
        compiled(facade.compile(FIELD_LINK, skeleton(), CompileOptions.TEST_RUN));

    assertThatThrownBy(() -> facade.testRun(mapping, null, Duration.ofSeconds(10), TRACE_LIMIT))
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
      assertThatThrownBy(() -> facade.testRun(mapping, input, Duration.ofSeconds(10), TRACE_LIMIT))
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
   * slots than the second. The run stops with {@code po:USEONEASMANY} at the function box u1
   * (ADR-0025 since #52), and a test run returns it with no output; fn/useOneAsMany 006 to 008 are
   * its corpus cases. It replaces #56's interim test, which saw an unchecked failure.
   */
  @Test
  void aUseOneAsManyCountMismatchIsARuntimeErrorAtItsBox() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    CompiledMapping deployed = compiled(facade.compile(USE_ONE_AS_MANY, observations, DEPLOY));
    // witness: with as many Tags as Skus (u1.xml's first order) the mapping runs
    assertThat(new String(facade.run(deployed, order(3, 3)), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>A</All><All>A</All><All>A</All></Out>");

    assertRunThrows(facade, deployed, order(2, 3), "po:USEONEASMANY", "u1");
    CompiledMapping tested =
        compiled(facade.compile(USE_ONE_AS_MANY, observations, CompileOptions.TEST_RUN));
    assertRuntimeError(
        facade.testRun(tested, order(2, 3), Duration.ofSeconds(10), TRACE_LIMIT),
        "po:USEONEASMANY",
        "u1");
  }

  // --- formatByExample's count mismatch (#58): documented as an exception (#2 §4)

  /**
   * The corpus mapping of fn/formatByExample, Tag formatted by Sku in context Order, run on three
   * Tags but two Skus: the SAP documentation requires equal value counts and raises an exception
   * otherwise; to observe on PO 7.5 and CPI (#61). The run stops with {@code po:FORMATBYEXAMPLE} at
   * the function box F1 (ADR-0025 since #52), and a test run returns it with no output;
   * fn/formatByExample/006 is its corpus case. It replaces #58's interim test.
   */
  @Test
  void aFormatByExampleCountMismatchIsARuntimeErrorAtItsBox() throws Exception {
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

    assertRunThrows(facade, deployed, order(3, 2), "po:FORMATBYEXAMPLE", "F1");
    CompiledMapping tested =
        compiled(facade.compile(model, mapping.getParent(), CompileOptions.TEST_RUN));
    assertRuntimeError(
        facade.testRun(tested, order(3, 2), Duration.ofSeconds(10), TRACE_LIMIT),
        "po:FORMATBYEXAMPLE",
        "F1");
  }

  // --- the runtime errors of sort and sortByKey (#59): since #52 one code per function at its box,
  // po:SORT and po:SORTBYKEY, which the export raises for the same inputs (ADR-0025); these
  // replace #59's interim tests, and corpus cases follow them.

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
   * x} beside 10 and 9, with {@code po:SORT} at the box s1 (O3 revised, #52).
   */
  @Test
  void aNumericSortOverANonNumberIsARuntimeErrorAtItsBox() throws Exception {
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

    assertRunThrows(facade, numeric, input, "po:SORT", "s1");
    assertThatThrownBy(() -> facade.run(numeric, input))
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
   * Qty, so the Order has two keys and one value: {@code po:SORTBYKEY} at the box k1 (#52).
   */
  @Test
  void aSortByKeyCountMismatchIsARuntimeErrorAtItsBox() throws Exception {
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

    byte[] input =
        utf8(
            "<Orders><Order><Line><Sku>b</Sku><Qty>1</Qty></Line>"
                + "<Line><Sku>a</Sku></Line></Order></Orders>");

    assertRunThrows(facade, mapping, input, "po:SORTBYKEY", "k1");
    assertThatThrownBy(() -> facade.run(mapping, input))
        .hasMessageContaining("sortByKey")
        .hasMessageContaining("keys: 2, values: 1");
  }

  /**
   * sortByKey of Tag by {@code replaceValue(createIf(Tag), "5")}, with {@code params}, on {@code
   * Out/All}: a key is 5 where the Tag is true and SUPPRESS where it is not.
   */
  private static byte[] sortByCreatedKeys(String params) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Out"}},
         "targetFieldMappings": {"/Out/All": {"id": "t1", "result": "k1",
           "boxes": {"k1": {"kind": "function", "fn": "sortByKey", "inputs": ["r1", "a1"],
                            "params": %2$s},
                     "r1": {"kind": "function", "fn": "replaceValue", "inputs": ["c1"],
                            "params": {"replacement": "5"}},
                     "c1": {"kind": "function", "fn": "createIf", "inputs": ["a1"]},
                     "a1": {"kind": "source", "field": "/Orders/Order/Tag"}}}}}
        """
        .formatted(FINGERPRINT, params)
        .getBytes(UTF_8);
  }

  /**
   * #2 §3 (documented): "numeric keys must not be equal to the constant ResultList.SUPPRESS". A
   * numeric sortByKey over a SUPPRESS key stops the run with {@code po:SORTBYKEY} at the box k1
   * (#52); compared as strings the same key is the smallest (ADR-0006 since #51). The export raises
   * po:SORTBYKEY for the same inputs.
   */
  @Test
  void aNumericSortByKeyOverASuppressKeyIsARuntimeErrorAtItsBox() throws Exception {
    EngineFacade facade = new EngineFacade();
    Path observations = CorpusStructures.directory("observations");
    byte[] input = utf8("<Orders><Order><Tag>1</Tag><Tag>no</Tag></Order></Orders>");
    CompiledMapping lexicographic =
        compiled(facade.compile(sortByCreatedKeys("{}"), observations, DEPLOY));
    CompiledMapping numeric =
        compiled(
            facade.compile(
                sortByCreatedKeys("{\"comparison\": \"numeric\"}"), observations, DEPLOY));
    // witness: without SUPPRESS the numeric keys sort, and as strings the SUPPRESS key comes first
    assertThat(
            new String(
                facade.run(numeric, utf8("<Orders><Order><Tag>1</Tag></Order></Orders>")), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>1</All></Out>");
    assertThat(new String(facade.run(lexicographic, input), UTF_8))
        .isEqualTo(DECLARATION + "<Out><All>no</All><All>1</All></Out>");

    assertRunThrows(facade, numeric, input, "po:SORTBYKEY", "k1");
    assertThatThrownBy(() -> facade.run(numeric, input))
        .hasMessageContaining("sortByKey")
        .hasMessageContaining("SUPPRESS");
  }
}
