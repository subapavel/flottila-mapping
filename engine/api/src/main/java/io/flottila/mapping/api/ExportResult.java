package io.flottila.mapping.api;

import io.flottila.mapping.mapping.Diagnostic;
import java.util.List;

// stub for red (#27): the shape of the #27 design; the implementer sorts Refused by
// Diagnostic.ORDER
/** The result of an export: the stylesheet and its helper module, or the refusing diagnostics. */
public sealed interface ExportResult {

  /**
   * @param stylesheet the exported stylesheet
   * @param helperModule the text of {@code po-runtime.xsl}
   */
  record Exported(String stylesheet, String helperModule) implements ExportResult {}

  /**
   * @param diagnostics the refusing stage's diagnostics
   */
  record Refused(List<Diagnostic> diagnostics) implements ExportResult {}
}
