package io.flottila.mapping.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.mapping.AtAuthoringId;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.oracle.CaseFiles.CorpusCase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.xmlunit.diff.Diff;

/**
 * The golden-corpus oracle (ADR-0018): one dynamic test per case, named by its case id, so the
 * surefire report names it {@code cases() <case id>} as the ratchet reads it
 * (scripts/ratchet.java). A case passes only when its four metamorphic variants, optimised and
 * unoptimised IR each with and without a tracer, give byte-identical output and that output is
 * similar to {@code expected.xml}.
 */
class GoldenCorpusTest {

  private static final List<CompileOptions> VARIANTS =
      List.of(
          new CompileOptions(true, false),
          new CompileOptions(true, true),
          new CompileOptions(false, false),
          new CompileOptions(false, true));

  @TestFactory
  Stream<DynamicTest> cases() {
    List<CorpusCase> cases = CaseFiles.all();
    assertThat(cases).as("cases under %s", CaseFiles.cases()).isNotEmpty();
    return cases.stream().map(c -> dynamicTest(c.id(), () -> check(c)));
  }

  private static void check(CorpusCase c) throws Exception {
    assertThat(c.provenance()).isIn("observed", "documented", "assumed", "decided");
    assertThat(c.ref()).isNotBlank();
    assertThat(c.expect()).isIn("output", "error", "none");
    Path mapping = CaseFiles.corpus().resolve(c.mapping());
    byte[] model = Files.readAllBytes(mapping);
    Path base = mapping.getParent();
    EngineFacade facade = new EngineFacade();

    if (c.expect().equals("error")) {
      // a design-time error: every variant refuses with the expected code at the authoring id
      Map<String, Object> expected = c.expectedError();
      String code = (String) expected.get("code");
      AtAuthoringId at = new AtAuthoringId(new AuthoringId((String) expected.get("authoringId")));
      for (CompileOptions options : VARIANTS) {
        CompileResult result = facade.compile(model, base, options);
        if (!(result instanceof CompileResult.Refused(List<Diagnostic> diagnostics))) {
          throw new AssertionError(c.id() + " " + options + ": expected Refused, got " + result);
        }
        assertThat(diagnostics)
            .as("%s %s", c.id(), options)
            .anySatisfy(
                d -> {
                  assertThat(d.code()).isEqualTo(code);
                  assertThat(d.location()).isEqualTo(at);
                });
      }
      return;
    }

    byte[] input = Files.readAllBytes(c.input());
    Map<CompileOptions, byte[]> outputs = new LinkedHashMap<>();
    for (CompileOptions options : VARIANTS) {
      CompileResult result = facade.compile(model, base, options);
      if (!(result instanceof CompileResult.Compiled(CompiledMapping compiled))) {
        throw new AssertionError(c.id() + " " + options + ": expected Compiled, got " + result);
      }
      outputs.put(options, facade.run(compiled, input));
    }
    byte[] first = outputs.get(VARIANTS.getFirst());
    outputs.forEach(
        (options, output) ->
            assertThat(output)
                .as("%s byte-identical to %s", options, VARIANTS.getFirst())
                .isEqualTo(first));

    if (c.expect().equals("output")) {
      Diff diff = OracleVerdict.similar(Files.readAllBytes(c.expectedOutput()), first);
      assertThat(diff.hasDifferences()).as("%s: %s", c.id(), diff).isFalse();
    }
  }
}
