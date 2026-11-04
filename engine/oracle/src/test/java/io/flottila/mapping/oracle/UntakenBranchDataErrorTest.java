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
import java.nio.file.Path;
import net.sf.saxon.s9api.SaxonApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Every input of a single-value call is evaluated before the call, as PO computes every input queue
 * of a box before the box runs (F-22, ADR-0006): an {@code if} evaluates both branches, so a data
 * error in the branch its condition does not take is raised at its box, in the runtime and in
 * Saxon-HE. On tgt-list's All, {@code if(Sku, Qty, divide(1, 0))} with every Sku {@code true}
 * raises err:FOAR0001 at the divide box D1. Witness: with {@code divide(1, 2)} both back ends run
 * and agree, the else branch's 0.5 taken where a Sku is {@code false}. The model is no corpus case
 * and needs no observation row; this class is no corpus or differential class, so the ratchet does
 * not read its test as a case id (scripts/ratchet.java).
 */
class UntakenBranchDataErrorTest {

  private static final String FINGERPRINT = "sha256:" + "0".repeat(64);

  @TempDir Path dir;

  private final EngineFacade facade = new EngineFacade();

  /**
   * All from F1, if over Sku, Qty and D1, the division of the constant C1 1 by the constant C2
   * {@code divisor}: a single value, which F1's Lift reads in its body (ADR-0006 since #83).
   */
  private static byte[] model(String divisor) {
    return """
        {"formatVersion": 1,
         "source": {"bundle": ["src-orders.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Orders"}},
         "target": {"bundle": ["tgt-list.xsd"], "fingerprint": "%1$s",
                    "root": {"element": "Out"}},
         "targetFieldMappings": {
           "/Out/All": {"id": "T1", "result": "F1", "boxes": {
             "F1": {"kind": "function", "fn": "if", "inputs": ["S1", "S2", "D1"]},
             "D1": {"kind": "function", "fn": "divide", "inputs": ["C1", "C2"]},
             "C1": {"kind": "function", "fn": "constant", "params": {"value": "1"}},
             "C2": {"kind": "function", "fn": "constant", "params": {"value": "%2$s"}},
             "S1": {"kind": "source", "field": "/Orders/Order/Line/Sku", "context": "/Orders"},
             "S2": {"kind": "source", "field": "/Orders/Order/Line/Qty", "context": "/Orders"}}}}}
        """
        .formatted(FINGERPRINT, divisor)
        .getBytes(UTF_8);
  }

  /** One Order whose Lines carry the Skus {@code true} and {@code second}, Qty 4 and 6. */
  private static byte[] input(String second) {
    return ("<Orders><Order><Id>o1</Id>"
            + "<Line><Sku>true</Sku><Qty>4</Qty></Line>"
            + "<Line><Sku>"
            + second
            + "</Sku><Qty>6</Qty></Line>"
            + "</Order></Orders>")
        .getBytes(UTF_8);
  }

  private static Path structures() {
    return CaseFiles.corpus().resolve("structures/observations");
  }

  private CompiledMapping compiled(byte[] model, CompileOptions options, String what)
      throws Exception {
    CompileResult result = facade.compile(model, structures(), options);
    assertThat(result).as(what).isInstanceOf(CompileResult.Compiled.class);
    return ((CompileResult.Compiled) result).mapping();
  }

  @Test
  void theUntakenBranchsDataErrorIsRaisedAtItsBoxOnBothBackEnds() throws Exception {
    String fine = "if(Sku, Qty, divide(1, 2)) on All";
    byte[] runs = model("2");
    ExportResult.Exported witness = SaxonRunner.exported(facade.export(runs, structures()), fine);
    byte[] mixed = input("false");
    for (CompileOptions options :
        new CompileOptions[] {CompileOptions.DEPLOY, CompileOptions.TEST_RUN}) {
      byte[] ours = facade.run(compiled(runs, options, fine), mixed);
      assertThat(new String(ours, UTF_8))
          .as("%s: ours, %s", fine, options)
          .contains("<All>4</All>")
          .contains("<All>0.5</All>");
      byte[] saxon =
          SaxonRunner.run(witness.stylesheet(), witness.helperModule(), mixed, dir.resolve("fine"));
      SaxonRunner.assertAgree(saxon, ours, fine + ", " + options);
    }

    String what = "if(Sku, Qty, divide(1, 0)) on All";
    byte[] fails = model("0");
    ExportResult.Exported exported = SaxonRunner.exported(facade.export(fails, structures()), what);
    byte[] untaken = input("true");
    for (CompileOptions options :
        new CompileOptions[] {CompileOptions.DEPLOY, CompileOptions.TEST_RUN}) {
      Throwable error = catchThrowable(() -> facade.run(compiled(fails, options, what), untaken));
      assertThat(error).as("%s: ours, %s", what, options).isInstanceOf(MappingRunException.class);
      MappingRunException run = (MappingRunException) error;
      assertThat(run.code()).as("%s: ours", what).isEqualTo("err:FOAR0001");
      assertThat(run.authoringId().value()).as("%s: ours", what).isEqualTo("D1");
    }
    SaxonApiException raised =
        SaxonRunner.raised(
            exported.stylesheet(), exported.helperModule(), untaken, dir.resolve("fails"), what);
    SaxonRunner.assertSameError(raised, "err:FOAR0001", what);
    SaxonRunner.assertNamesItsPlace(raised.getMessage(), "err:FOAR0001", "D1", what);
  }
}
