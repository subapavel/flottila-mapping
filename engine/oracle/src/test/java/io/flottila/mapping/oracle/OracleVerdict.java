package io.flottila.mapping.oracle;

import org.xmlunit.builder.DiffBuilder;
import org.xmlunit.builder.Input;
import org.xmlunit.diff.Diff;

/**
 * The golden-corpus verdict (ADR-0018): XMLUnit {@code checkForSimilar()} with {@code
 * ignoreElementContentWhitespace()}, so an expected file may be indented and carry PO's prefixes,
 * while whitespace inside a value still counts. {@code ignoreWhitespace} and {@code
 * normalizeWhitespace} are never used.
 */
final class OracleVerdict {

  private OracleVerdict() {}

  static Diff similar(byte[] expected, byte[] actual) {
    return DiffBuilder.compare(Input.fromByteArray(expected))
        .withTest(Input.fromByteArray(actual))
        .checkForSimilar()
        .ignoreElementContentWhitespace()
        .build();
  }
}
