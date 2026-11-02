package io.flottila.mapping.oracle;

import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.api.ExportResult;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.transform.stream.StreamSource;
import net.sf.saxon.s9api.Processor;
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
