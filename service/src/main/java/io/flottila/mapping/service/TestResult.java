package io.flottila.mapping.service;

import org.eclipse.microprofile.openapi.annotations.media.DiscriminatorMapping;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * The result of a test run (ADR-0015, ADR-0024): output, or the diagnostics that refuse the working
 * copy. Spec 1 returns no trace.
 */
@Schema(
    oneOf = {TestOutput.class, TestRefused.class},
    discriminatorProperty = "kind",
    discriminatorMapping = {
      @DiscriminatorMapping(value = TestOutput.KIND, schema = TestOutput.class),
      @DiscriminatorMapping(value = TestRefused.KIND, schema = TestRefused.class)
    })
public sealed interface TestResult permits TestOutput, TestRefused {}
