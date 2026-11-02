package io.flottila.mapping.service;

import java.util.List;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * The target message of a test run.
 *
 * @param kind {@value #KIND}
 * @param output the target message
 * @param diagnostics the warnings of the compile
 */
public record TestOutput(
    @Schema(required = true, constValue = TestOutput.KIND) String kind,
    @Schema(required = true) String output,
    @Schema(required = true) List<DiagnosticDto> diagnostics)
    implements TestResult {

  static final String KIND = "output";

  TestOutput(String output, List<DiagnosticDto> diagnostics) {
    this(KIND, output, diagnostics);
  }
}
