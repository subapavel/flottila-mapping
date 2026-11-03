package io.flottila.mapping.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.ExportResult;
import io.flottila.mapping.oracle.CaseFiles.CorpusCase;
import io.flottila.mapping.runtime.MappingRunException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.io.TempDir;

/**
 * The differential oracle (ADR-0018, #27 design): every corpus case that expects {@code output} or
 * {@code none} is exported through the engine facade, run by Saxon-HE 12.5 on the case's input, and
 * run by our runtime as deployed; the two outputs must be identical, with the same namespace
 * declarations per element. One dynamic test per case, named by its case id, so the surefire report
 * names it {@code cases() <case id>} as the ratchet reads it (scripts/ratchet.java). A refused
 * export fails the case.
 */
class DifferentialOracleTest {

  /** Per case a directory for its stylesheet and helper module; a field keeps the name cases(). */
  @TempDir Path dir;

  @TestFactory
  Stream<DynamicTest> cases() {
    // since #52 a runtime-error case is differential too: Saxon raises the same error QName
    List<CorpusCase> covered =
        CaseFiles.all().stream()
            .filter(
                c ->
                    List.of("output", "none").contains(c.expect())
                        || GoldenCorpusTest.expectsRuntimeError(c))
            .toList();
    assertThat(covered)
        .as("cases under %s that expect output or none", CaseFiles.cases())
        .isNotEmpty();
    return IntStream.range(0, covered.size())
        .mapToObj(
            i ->
                dynamicTest(
                    covered.get(i).id(),
                    () -> check(covered.get(i), dir.resolve(String.valueOf(i)))));
  }

  private static void check(CorpusCase c, Path caseDir) throws Exception {
    Path mapping = CaseFiles.corpus().resolve(c.mapping());
    byte[] model = Files.readAllBytes(mapping);
    Path base = mapping.getParent();
    byte[] input = Files.readAllBytes(c.input());
    EngineFacade facade = new EngineFacade();

    ExportResult.Exported exported = SaxonRunner.exported(facade.export(model, base), c.id());
    CompileResult result = facade.compile(model, base, CompileOptions.DEPLOY);
    if (!(result instanceof CompileResult.Compiled(CompiledMapping compiled))) {
      throw new AssertionError(c.id() + ": expected Compiled, got " + result);
    }

    if (GoldenCorpusTest.expectsRuntimeError(c)) {
      // ADR-0018 since #52: both sides raise the case's error QName on its input
      String code = (String) c.expectedError().get("code");
      SaxonRunner.assertSameError(
          SaxonRunner.raised(
              exported.stylesheet(), exported.helperModule(), input, caseDir, c.id()),
          code,
          c.id());
      assertThatThrownBy(() -> facade.run(compiled, input))
          .as("%s: ours", c.id())
          .isInstanceOfSatisfying(
              MappingRunException.class, e -> assertThat(e.code()).isEqualTo(code));
      return;
    }

    byte[] saxon = SaxonRunner.run(exported.stylesheet(), exported.helperModule(), input, caseDir);
    byte[] ours = facade.run(compiled, input);

    SaxonRunner.assertAgree(saxon, ours, c.id());
  }
}
