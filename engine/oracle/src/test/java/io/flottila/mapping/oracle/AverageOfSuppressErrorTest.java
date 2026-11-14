package io.flottila.mapping.oracle;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.ExportResult;
import io.flottila.mapping.runtime.MappingRunException;
import io.flottila.mapping.structure.importer.ReferenceResolver;
import java.nio.file.Path;
import net.sf.saxon.s9api.SaxonApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@code average} of a context that holds only SUPPRESS has no value to divide by: the run stops
 * with err:FOAR0001 at the average box, PO's "Division undefined" (F-45), in the runtime and in the
 * export under Saxon-HE. The runtime's {@code StatisticFamilyTest} has the case; the corpus case
 * {@code fn/average/003} covers an empty context only, so this is the export's test of SUPPRESS.
 * Witness: {@code average} of Qty runs and agrees on both back ends. The models are no corpus cases
 * and need no observation row; this class is no corpus or differential class, so the ratchet does
 * not read its test as a case id (scripts/ratchet.java).
 */
class AverageOfSuppressErrorTest {

  /**
   * The fingerprints of {@code src-orders.xsd} and {@code tgt-list.xsd}, which compile checks
   * (#91); {@code FingerprintPinTest} in {@code engine/api} pins them.
   */
  private static final String SOURCE_FINGERPRINT =
      "sha256:5e9bdd3db3b284fc086f0233797ede5e4f3fb874bd696ba3f496dd30bffef9a7";

  private static final String TARGET_FINGERPRINT =
      "sha256:626cbacff639a86b480bb3c20cc032d8aa47ad341d9111e31882ad30ca6eca70";

  private static final String CODE = "err:FOAR0001";

  @TempDir Path dir;

  private final EngineFacade facade = new EngineFacade();

  /**
   * All from F1, {@code average} of the box {@code input}, beside the {@code boxes} building it.
   */
  private static byte[] model(String input, String boxes) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%2$s",
                    "root": {"element": "Out"}},
         "targetFieldMappings": {
           "/Out/All": {"id": "T1", "result": "F1", "boxes": {
             "F1": {"kind": "function", "fn": "average", "inputs": ["%3$s"]},
             %4$s}}}}
        """
        .formatted(SOURCE_FINGERPRINT, TARGET_FINGERPRINT, input, boxes)
        .getBytes(UTF_8);
  }

  /**
   * {@code createIf(Sku)}: C1 over S1, Sku in the context Orders; a Sku {@code false} gives a
   * SUPPRESS slot.
   */
  private static byte[] suppress() {
    return model(
        "C1",
        """
        "C1": {"kind": "function", "fn": "createIf", "inputs": ["S1"]},
        "S1": {"kind": "source", "field": "/Orders/Order/Line/Sku", "context": "/Orders"}""");
  }

  /** {@code Qty} in the context Orders: the values of its one context. */
  private static byte[] values() {
    return model(
        "S2",
        """
        "S2": {"kind": "source", "field": "/Orders/Order/Line/Qty", "context": "/Orders"}""");
  }

  /** One Order whose Lines carry the Skus {@code first} and {@code second}, Qty 4 and 6. */
  private static byte[] input(String first, String second) {
    return ("<Orders><Order><Id>o1</Id>"
            + "<Line><Sku>"
            + first
            + "</Sku><Qty>4</Qty></Line>"
            + "<Line><Sku>"
            + second
            + "</Sku><Qty>6</Qty></Line>"
            + "</Order></Orders>")
        .getBytes(UTF_8);
  }

  private static ReferenceResolver structures() {
    return DirectoryResolver.over(CaseFiles.corpus().resolve("structures/observations"));
  }

  private CompiledMapping compiled(byte[] model, CompileOptions options, String what)
      throws Exception {
    CompileResult result = facade.compile(model, structures(), options);
    assertThat(result).as(what).isInstanceOf(CompileResult.Compiled.class);
    return ((CompileResult.Compiled) result).mapping();
  }

  @Test
  void averageOfAContextOfSuppressOnlyRaisesFoar0001AtItsBoxOnBothBackEnds() throws Exception {
    String fine = "average of Qty on All";
    byte[] runs = values();
    ExportResult.Exported witness = SaxonRunner.exported(facade.export(runs, structures()), fine);
    for (CompileOptions options :
        new CompileOptions[] {CompileOptions.DEPLOY, CompileOptions.TEST_RUN}) {
      byte[] ours = facade.run(compiled(runs, options, fine), input("false", "false"));
      assertThat(new String(ours, UTF_8))
          .as("%s: ours, %s", fine, options)
          .contains("<Out><All>5</All></Out>");
      byte[] saxon =
          SaxonRunner.run(
              witness.stylesheet(),
              witness.helperModule(),
              input("false", "false"),
              dir.resolve("fine"));
      SaxonRunner.assertAgree(saxon, ours, fine + ", " + options);
    }

    String what = "average of createIf(Sku) on All, every Sku false";
    byte[] fails = suppress();
    byte[] allSuppress = input("false", "false");
    ExportResult.Exported exported = SaxonRunner.exported(facade.export(fails, structures()), what);
    for (CompileOptions options :
        new CompileOptions[] {CompileOptions.DEPLOY, CompileOptions.TEST_RUN}) {
      Throwable error =
          catchThrowable(() -> facade.run(compiled(fails, options, what), allSuppress));
      assertThat(error).as("%s: ours, %s", what, options).isInstanceOf(MappingRunException.class);
      MappingRunException run = (MappingRunException) error;
      assertThat(run.code()).as("%s: ours", what).isEqualTo(CODE);
      assertThat(run.authoringId().value()).as("%s: ours", what).isEqualTo("F1");
      assertThat(run.getMessage())
          .as("%s: ours", what)
          .endsWith("average: context 1 holds no value, division undefined");
    }
    SaxonApiException raised =
        SaxonRunner.raised(
            exported.stylesheet(),
            exported.helperModule(),
            allSuppress,
            dir.resolve("raises"),
            what);
    SaxonRunner.assertSameError(raised, CODE, what);
    SaxonRunner.assertNamesItsPlace(raised.getMessage(), CODE, "F1", what);
    assertThat(raised.getMessage())
        .as("%s: Saxon's message", what)
        .contains("average: context 1 holds no value, division undefined");
  }
}
