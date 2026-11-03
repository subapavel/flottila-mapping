package io.flottila.mapping.oracle;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.api.ExportResult;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import javax.xml.transform.stream.StreamSource;
import net.sf.saxon.s9api.Processor;
import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.Xslt30Transformer;

/**
 * The Saxon side of the differential oracle (ADR-0018, #27 design): Saxon-HE 12.5 runs an exported
 * stylesheet, which imports the helper module from its own directory, with the serialization its
 * {@code xsl:output} asks for and no {@code Serializer.Property} of ours. The agreement of the two
 * sides is {@link OracleVerdict#identical} plus equal {@link OracleVerdict#declarations}.
 */
final class SaxonRunner {

  /** The file name the stylesheet imports; renaming it breaks exports handed out (ADR-0023). */
  static final String HELPER_MODULE = "po-runtime.xsl";

  private SaxonRunner() {}

  /** The stylesheet and helper of {@code result}; a refused export fails the caller. */
  static ExportResult.Exported exported(ExportResult result, String what) {
    if (result instanceof ExportResult.Exported exported) {
      return exported;
    }
    throw new AssertionError(what + ": export refused: " + result);
  }

  /**
   * Writes {@code mapping.xsl} and {@code po-runtime.xsl} into {@code dir}, compiles the first with
   * a fresh {@code Processor(false)} and runs it on {@code input}.
   */
  static byte[] run(String stylesheet, String helperModule, byte[] input, Path dir)
      throws Exception {
    Files.createDirectories(dir);
    Path mapping = Files.writeString(dir.resolve("mapping.xsl"), stylesheet);
    Files.writeString(dir.resolve(HELPER_MODULE), helperModule);
    Processor processor = new Processor(false);
    Xslt30Transformer transformer =
        processor.newXsltCompiler().compile(new StreamSource(mapping.toFile())).load30();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    transformer.transform(
        new StreamSource(new ByteArrayInputStream(input)), transformer.newSerializer(out));
    return out.toByteArray();
  }

  /** The namespace URI of each prefix a runtime error's QName takes (ADR-0015, ADR-0025). */
  private static final Map<String, String> ERROR_NAMESPACES =
      Map.of("po", "urn:flottila:mapping:po");

  /**
   * The error Saxon raises when it runs {@code stylesheet} on {@code input}, as {@link #run} does;
   * fails when it writes output instead.
   */
  static SaxonApiException raised(
      String stylesheet, String helperModule, byte[] input, Path dir, String what)
      throws Exception {
    try {
      byte[] output = run(stylesheet, helperModule, input, dir);
      throw new AssertionError(
          what + ": expected Saxon to raise an error, it wrote " + new String(output, UTF_8));
    } catch (SaxonApiException raised) {
      return raised;
    }
  }

  /**
   * Saxon raised the runtime error {@code code}, a QName such as {@code po:MINOCCURS}: the same
   * namespace URI and local name (ADR-0018 since #52), whatever its prefix.
   */
  static void assertSameError(SaxonApiException saxon, String code, String what) {
    int colon = code.indexOf(':');
    assertThat(colon).as("%s: %s is a QName", what, code).isPositive();
    String namespace = ERROR_NAMESPACES.get(code.substring(0, colon));
    assertThat(namespace).as("%s: the namespace of %s", what, code).isNotNull();
    QName raised = saxon.getErrorCode();
    assertThat(raised).as("%s: Saxon's error code, %s", what, saxon.getMessage()).isNotNull();
    // getNamespace, not getNamespaceURI, which Saxon 12.5 deprecates (javap) and -Werror refuses
    assertThat("Q{" + raised.getNamespace() + "}" + raised.getLocalName())
        .as("%s: Saxon's error, %s", what, saxon.getMessage())
        .isEqualTo("Q{" + namespace + "}" + code.substring(colon + 1));
  }

  /**
   * The message of the runtime error {@code code} starts with the place it is raised at (ADR-0026,
   * F-19): {@code the target field mapping <id> } for {@code po:MINOCCURS}, {@code the function box
   * <id>: } for a function's data error, {@code <id>} being {@code authoringId}.
   */
  static void assertNamesItsPlace(String message, String code, String authoringId, String what) {
    String place =
        code.equals("po:MINOCCURS")
            ? "the target field mapping " + authoringId + " "
            : "the function box " + authoringId + ": ";
    assertThat(message).as("%s: the message names its place", what).startsWith(place);
  }

  /** {@code saxon} and {@code ours} agree: identical, and declared on the same elements. */
  static void assertAgree(byte[] saxon, byte[] ours, String what) {
    assertThat(OracleVerdict.identical(saxon, ours).hasDifferences())
        .as("%s: %s", what, OracleVerdict.identical(saxon, ours))
        .isFalse();
    assertThat(OracleVerdict.declarations(ours))
        .as("%s: namespace declarations per element, ours against Saxon's", what)
        .isEqualTo(OracleVerdict.declarations(saxon));
  }
}
