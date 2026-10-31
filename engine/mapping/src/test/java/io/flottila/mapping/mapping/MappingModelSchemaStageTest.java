package io.flottila.mapping.mapping;

import static io.flottila.mapping.mapping.Fixtures.utf8;
import static io.flottila.mapping.mapping.LoadResults.errorAtPointer;
import static io.flottila.mapping.mapping.LoadResults.loaded;
import static io.flottila.mapping.mapping.LoadResults.refused;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.ir.AuthoringId;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Stage 1 of loading (ADR-0011): the schema checks shape, kinds, id patterns and unknown members,
 * fails closed, and locates each failure at the JSON pointer (RFC 6901) of the instance. Every
 * document here is valid but for the one thing a case breaks, so it is also clean for stage 2.
 */
class MappingModelSchemaStageTest {

  static final String SOURCE =
      """
      {"bundle": ["order.xsd"],
       "fingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
       "root": {"element": "Order"}}""";

  static final String TARGET =
      """
      {"bundle": ["invoice.xsd"],
       "fingerprint": "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
       "root": {"element": "Invoice"}}""";

  static final String UDFS =
      """
      {"fmt": {"executionKind": "single", "inputs": ["value"], "params": {"scale": "int"},
               "source": "udf/Udfs.java#fmt"}}""";

  static final String TFM = "/targetFieldMappings/~1Invoice~1Number";
  static final String BOX = TFM + "/boxes/";

  static final String ID_64 = "Aa0_-".repeat(12) + "Zz9-";
  static final String ID_65 = ID_64 + "x";

  static String document(String source, String target, String mappings, String udfs) {
    return "{\"formatVersion\": 1,\n\"source\": "
        + source
        + ",\n\"target\": "
        + target
        + ",\n\"targetFieldMappings\": "
        + mappings
        + ",\n\"udfs\": "
        + udfs
        + "}\n";
  }

  static String withMappings(String mappings) {
    return document(SOURCE, TARGET, mappings, UDFS);
  }

  /**
   * One target field mapping {@code /Invoice/Number} with id {@code t1} and {@code result: null}.
   */
  static String withBoxes(String boxes) {
    return withMappings(
        "{\"/Invoice/Number\": {\"id\": \"t1\", \"result\": null, \"boxes\": " + boxes + "}}");
  }

  static String withUdfs(String udfs) {
    return document(SOURCE, TARGET, VALID_MAPPINGS, udfs);
  }

  static final String VALID_MAPPINGS =
      """
      {"/Invoice/Number": {"id": "t1", "result": "u1", "boxes": {
        "a1": {"kind": "source", "field": "/Order/Number"},
        "b1": {"kind": "function", "fn": "concat", "inputs": ["a1", null]},
        "u1": {"kind": "udf", "udf": "fmt", "inputs": ["b1"], "params": {"scale": "2"}},
        "x1": {"kind": "unresolved", "name": "CopyValue", "origin": "po", "inputs": ["a1"]}}}}""";

  @Test
  void theValidDocumentTheCasesBreakLoads() throws Exception {
    MappingModel model = loaded(MappingModelFormat.load(utf8(withMappings(VALID_MAPPINGS))));

    assertThat(model.targetFieldMappings().get("/Invoice/Number").boxes()).hasSize(4);
  }

  @Test
  void loadAcceptsIdsAndNamesAtTheirPatternLimits() throws Exception {
    String name64 = "_" + "aZ9".repeat(21);
    String mappings =
        """
        {"/Invoice/Number": {"id": "-", "result": "%1$s", "boxes": {
          "%1$s": {"kind": "udf", "udf": "%2$s", "inputs": ["A", "_"]},
          "A": {"kind": "source", "field": "/Order/Number"},
          "_": {"kind": "function", "fn": "constant", "params": {"value": "x"}}}}}"""
            .formatted(ID_64, name64);
    String udfs =
        """
        {"%1$s": {"executionKind": "single", "inputs": ["x", "%1$s"], "params": {"%1$s": "string"},
                  "source": "udf/Udfs.java#fmt"}}"""
            .formatted(name64);

    MappingModel model =
        loaded(MappingModelFormat.load(utf8(document(SOURCE, TARGET, mappings, udfs))));

    assertThat(ID_64).hasSize(64);
    assertThat(name64).hasSize(64);
    assertThat(model.targetFieldMappings().get("/Invoice/Number").boxes())
        .containsKeys(new AuthoringId(ID_64), new AuthoringId("A"), new AuthoringId("_"));
    assertThat(model.udfs()).containsOnlyKeys(name64);
  }

  static Stream<Arguments> unknownMembers() {
    return Stream.of(
        Arguments.of(
            "a top-level member",
            withMappings(VALID_MAPPINGS)
                .replace("\"formatVersion\": 1,", "\"formatVersion\": 1, \"layout\": {},"),
            "/layout"),
        Arguments.of(
            "a member of a structure reference",
            document(
                SOURCE.replace("\"bundle\"", "\"hash\": \"x\", \"bundle\""),
                TARGET,
                VALID_MAPPINGS,
                UDFS),
            "/source/hash"),
        Arguments.of(
            "a function box's member on a source box, under a key that needs ~0 and ~1",
            withMappings(
                """
                {"/Q{urn:x~y}Invoice/Number": {"id": "t1", "result": "a1", "boxes": {
                  "a1": {"kind": "source", "field": "/Order/Number", "fn": "concat"}}}}"""),
            "/targetFieldMappings/~1Q{urn:x~0y}Invoice~1Number/boxes/a1/fn"),
        Arguments.of(
            "a formatVersion 2 member on a target field mapping",
            withMappings(
                """
                {"/Invoice/Number": {"id": "t1", "result": null, "switchedOff": "true", "boxes": {
                  "a1": {"kind": "source", "field": "/Order/Number"}}}}"""),
            TFM + "/switchedOff"),
        Arguments.of(
            "a member of a UDF declaration",
            withUdfs(UDFS.replace("\"source\"", "\"deterministic\": \"true\", \"source\"")),
            "/udfs/fmt/deterministic"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unknownMembers")
  void loadReportsUnknownMemberAtItsPointer(String what, String json, String pointer)
      throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json))))
        .containsExactly(errorAtPointer("unknown-member", pointer));
  }

  static Stream<Arguments> unknownBoxKinds() {
    return Stream.of(
        Arguments.of(
            "a kind no branch has",
            withBoxes("{\"c1\": {\"kind\": \"constant\", \"params\": {\"value\": \"x\"}}}"),
            BOX + "c1/kind"),
        Arguments.of(
            "a kind spelled with another case",
            withBoxes("{\"a1\": {\"kind\": \"Source\", \"field\": \"/Order/Number\"}}"),
            BOX + "a1/kind"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unknownBoxKinds")
  void loadReportsUnknownBoxKindAtKindPointer(String what, String json, String pointer)
      throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json))))
        .containsExactly(errorAtPointer("unknown-box-kind", pointer));
  }

  static Stream<Arguments> missingMembers() {
    return Stream.of(
        Arguments.of(
            "fn of a function box",
            withBoxes("{\"b1\": {\"kind\": \"function\", \"inputs\": [null]}}"),
            BOX + "b1"),
        Arguments.of(
            "udf of a udf box",
            withBoxes("{\"u1\": {\"kind\": \"udf\", \"inputs\": [null]}}"),
            BOX + "u1"),
        Arguments.of(
            "origin of an unresolved box",
            withBoxes("{\"x1\": {\"kind\": \"unresolved\", \"name\": \"CopyValue\"}}"),
            BOX + "x1"),
        Arguments.of(
            "field of a source box",
            withBoxes("{\"a1\": {\"kind\": \"source\", \"context\": \"/Order\"}}"),
            BOX + "a1"),
        Arguments.of(
            "result of a target field mapping, which is null rather than absent",
            withMappings(
                """
                {"/Invoice/Number": {"id": "t1", "boxes": {
                  "a1": {"kind": "source", "field": "/Order/Number"}}}}"""),
            TFM),
        Arguments.of(
            "source of a UDF declaration",
            withUdfs("{\"fmt\": {\"executionKind\": \"single\"}}"),
            "/udfs/fmt"),
        Arguments.of(
            "fingerprint of a structure reference",
            document(
                "{\"bundle\": [\"order.xsd\"], \"root\": {\"element\": \"Order\"}}",
                TARGET,
                VALID_MAPPINGS,
                UDFS),
            "/source"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("missingMembers")
  void loadReportsMissingMemberOfTheMatchedKind(String what, String json, String pointer)
      throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json))))
        .containsExactly(errorAtPointer("missing-member", pointer));
  }

  static Stream<Arguments> badIds() {
    String oneSource = "{\"kind\": \"source\", \"field\": \"/Order/Number\"}";
    return Stream.of(
        Arguments.of(
            "a target field mapping id with a space",
            withMappings(
                "{\"/Invoice/Number\": {\"id\": \"t 1\", \"result\": null, \"boxes\": {\"a1\": "
                    + oneSource
                    + "}}}"),
            errorAtPointer("pattern-mismatch", TFM + "/id")),
        Arguments.of(
            "an input with a dot",
            withBoxes(
                "{\"a1\": "
                    + oneSource
                    + ", \"b1\": {\"kind\": \"function\", \"fn\": \"concat\", \"inputs\": [\"a1\", \"a.1\"]}}"),
            errorAtPointer("pattern-mismatch", BOX + "b1/inputs/1")),
        Arguments.of(
            "a result of 65 characters",
            withMappings(
                "{\"/Invoice/Number\": {\"id\": \"t1\", \"result\": \""
                    + ID_65
                    + "\", \"boxes\": {\"a1\": "
                    + oneSource
                    + "}}}"),
            errorAtPointer("pattern-mismatch", TFM + "/result")),
        Arguments.of(
            "a UDF input name starting with a digit",
            withUdfs(UDFS.replace("[\"value\"]", "[\"1st\"]")),
            errorAtPointer("pattern-mismatch", "/udfs/fmt/inputs/0")),
        // a map closes with patternProperties on its key and additionalProperties: false, so a key
        // outside the pattern is an unknown member (ADR-0011)
        Arguments.of(
            "a box key with a dot",
            withBoxes("{\"a.1\": " + oneSource + "}"),
            errorAtPointer("unknown-member", BOX + "a.1")),
        Arguments.of(
            "a box key of 65 characters",
            withBoxes("{\"" + ID_65 + "\": " + oneSource + "}"),
            errorAtPointer("unknown-member", BOX + ID_65)),
        Arguments.of(
            "a UDF name starting with a digit",
            withUdfs(
                UDFS.replace(
                    "{\"fmt\":",
                    "{\"1fmt\": {\"executionKind\": \"single\", \"source\": \"udf/Udfs.java#f\"},"
                        + " \"fmt\":")),
            errorAtPointer("unknown-member", "/udfs/1fmt")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("badIds")
  void loadReportsBadIdPatternInValueAndInKey(String what, String json, String expected)
      throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json)))).containsExactly(expected);
  }

  static Stream<Arguments> outputPorts() {
    return Stream.of(
        Arguments.of(
            "an input",
            withBoxes(
                """
                {"a1": {"kind": "source", "field": "/Order/Number"},
                 "b1": {"kind": "function", "fn": "concat", "inputs": ["a1#1"]}}"""),
            BOX + "b1/inputs/0"),
        Arguments.of(
            "a result",
            withMappings(
                """
                {"/Invoice/Number": {"id": "t1", "result": "a1#1", "boxes": {
                  "a1": {"kind": "source", "field": "/Order/Number"}}}}"""),
            TFM + "/result"));
  }

  @ParameterizedTest(name = "in {0}")
  @MethodSource("outputPorts")
  void loadRefusesOutputPortReference(String where, String json, String pointer) throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json))))
        .containsExactly(errorAtPointer("pattern-mismatch", pointer));
  }

  static Stream<Arguments> nonStrings() {
    return Stream.of(
        Arguments.of(
            "a number as a field",
            withBoxes("{\"a1\": {\"kind\": \"source\", \"field\": 5}}"),
            BOX + "a1/field"),
        Arguments.of(
            "a boolean as a function name",
            withBoxes("{\"b1\": {\"kind\": \"function\", \"fn\": true}}"),
            BOX + "b1/fn"),
        Arguments.of(
            "a number in a bundle",
            document(
                SOURCE.replace("[\"order.xsd\"]", "[\"order.xsd\", 3]"),
                TARGET,
                VALID_MAPPINGS,
                UDFS),
            "/source/bundle/1"),
        Arguments.of(
            "a number as a target field mapping id",
            withMappings(
                """
                {"/Invoice/Number": {"id": 7, "result": null, "boxes": {
                  "a1": {"kind": "source", "field": "/Order/Number"}}}}"""),
            TFM + "/id"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("nonStrings")
  void loadRefusesNonStringValue(String what, String json, String pointer) throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json))))
        .containsExactly(errorAtPointer("wrong-type", pointer));
  }

  @Test
  void loadRefusesTargetFieldMappingWithoutBoxes() throws Exception {
    String emptyBoxes =
        withMappings("{\"/Invoice/Number\": {\"id\": \"t1\", \"result\": null, \"boxes\": {}}}");
    String noBoxes = withMappings("{\"/Invoice/Number\": {\"id\": \"t1\", \"result\": null}}");

    assertThat(refused(MappingModelFormat.load(utf8(emptyBoxes))))
        .containsExactly(errorAtPointer("invalid-value", TFM + "/boxes"));
    assertThat(refused(MappingModelFormat.load(utf8(noBoxes))))
        .containsExactly(errorAtPointer("missing-member", TFM));
  }

  static Stream<Arguments> invalidValues() {
    return Stream.of(
        Arguments.of(
            "an empty bundle",
            document(SOURCE.replace("[\"order.xsd\"]", "[]"), TARGET, VALID_MAPPINGS, UDFS),
            errorAtPointer("invalid-value", "/source/bundle")),
        Arguments.of(
            "a bundle naming one file twice",
            document(
                SOURCE,
                TARGET.replace("[\"invoice.xsd\"]", "[\"invoice.xsd\", \"invoice.xsd\"]"),
                VALID_MAPPINGS,
                UDFS),
            errorAtPointer("invalid-value", "/target/bundle")),
        Arguments.of(
            "an execution kind in upper case",
            withUdfs(UDFS.replace("\"single\"", "\"SINGLE\"")),
            errorAtPointer("invalid-value", "/udfs/fmt/executionKind")),
        Arguments.of(
            "a UDF parameter type outside string and int",
            withUdfs(UDFS.replace("\"int\"", "\"integer\"")),
            errorAtPointer("invalid-value", "/udfs/fmt/params/scale")),
        Arguments.of(
            "an origin outside po, cpi and editor",
            withBoxes(
                "{\"x1\": {\"kind\": \"unresolved\", \"name\": \"CopyValue\", \"origin\": \"sap\"}}"),
            errorAtPointer("invalid-value", BOX + "x1/origin")),
        Arguments.of(
            "a fingerprint in upper-case hex",
            document(
                SOURCE.replace(
                    "0123456789abcdef0123456789abcdef", "0123456789ABCDEF0123456789ABCDEF"),
                TARGET,
                VALID_MAPPINGS,
                UDFS),
            errorAtPointer("pattern-mismatch", "/source/fingerprint")),
        Arguments.of(
            "a fingerprint of 63 hex digits",
            document(
                SOURCE,
                TARGET.replace("fedcba9876543210\",", "fedcba987654321\","),
                VALID_MAPPINGS,
                UDFS),
            errorAtPointer("pattern-mismatch", "/target/fingerprint")),
        Arguments.of(
            "a UDF source without #method",
            withUdfs(UDFS.replace("udf/Udfs.java#fmt", "udf/Udfs.java")),
            errorAtPointer("pattern-mismatch", "/udfs/fmt/source")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("invalidValues")
  void loadReportsInvalidValueAndPatternMismatchAtTheirPointer(
      String what, String json, String expected) throws Exception {
    assertThat(refused(MappingModelFormat.load(utf8(json)))).containsExactly(expected);
  }
}
