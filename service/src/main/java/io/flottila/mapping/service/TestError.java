package io.flottila.mapping.service;

import java.util.List;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A test run that stopped with a runtime error: no output (ADR-0015, "Diagnostics and errors").
 *
 * @param kind {@value #KIND}
 * @param error the runtime error
 * @param diagnostics the warnings of the compile
 */
public record TestError(
    @Schema(required = true, constValue = TestError.KIND) String kind,
    @Schema(required = true) RuntimeErrorDto error,
    @Schema(required = true) List<DiagnosticDto> diagnostics)
    implements TestResult {

  static final String KIND = "error";

  TestError(RuntimeErrorDto error, List<DiagnosticDto> diagnostics) {
    this(KIND, error, diagnostics);
  }
}
