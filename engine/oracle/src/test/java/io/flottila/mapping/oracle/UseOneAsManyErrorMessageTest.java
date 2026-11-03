package io.flottila.mapping.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.ExportResult;
import io.flottila.mapping.oracle.CaseFiles.CorpusCase;
import io.flottila.mapping.runtime.MappingRunException;
import java.nio.file.Files;
import java.nio.file.Path;
import net.sf.saxon.s9api.SaxonApiException;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * po:USEONEASMANY says which count failed (ADR-0025), on both back ends and in the same words: the
 * corpus's three useOneAsMany error cases, each its counts from its note. The QName is the
 * differential oracle's; this class is no corpus or differential class, so the ratchet does not
 * read its tests as case ids (scripts/ratchet.java).
 */
class UseOneAsManyErrorMessageTest {

  @TempDir Path dir;

  @ParameterizedTest(name = "{0}")
  @CsvSource(
      delimiter = '|',
      value = {
        "fn/useOneAsMany/006 | as many slots in its third input as in its second: the third has 2"
            + " slots, the second 3",
        "fn/useOneAsMany/007 | as many slots in its third input as in its second: the third has 3"
            + " slots, the second 2",
        "fn/useOneAsMany/008 | one value of its first input per context of its second: the first"
            + " has 3 values, the second 4 contexts"
      })
  void bothBackEndsSayWhichCountFailed(String id, String count) throws Exception {
    CorpusCase c = CaseFiles.read(CaseFiles.cases(), CaseFiles.cases().resolve(id));
    Path mapping = CaseFiles.corpus().resolve(c.mapping());
    byte[] model = Files.readAllBytes(mapping);
    byte[] input = Files.readAllBytes(c.input());
    EngineFacade facade = new EngineFacade();
    CompileResult result = facade.compile(model, mapping.getParent(), CompileOptions.DEPLOY);
    assertThat(result).as(id).isInstanceOf(CompileResult.Compiled.class);
    CompiledMapping compiled = ((CompileResult.Compiled) result).mapping();
    ExportResult.Exported exported =
        SaxonRunner.exported(facade.export(model, mapping.getParent()), id);
    String message = "useOneAsMany needs " + count;

    Throwable ours = catchThrowable(() -> facade.run(compiled, input));
    SaxonApiException saxon =
        SaxonRunner.raised(exported.stylesheet(), exported.helperModule(), input, dir, id);

    assertThat(ours).as("%s: ours", id).isInstanceOf(MappingRunException.class);
    assertThat(ours.getMessage()).as("%s: ours", id).isEqualTo(message);
    SaxonRunner.assertSameError(saxon, "po:USEONEASMANY", id);
    assertThat(saxon.getMessage()).as("%s: Saxon's", id).isEqualTo(message);
  }
}
