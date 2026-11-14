package io.flottila.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Whether a compile runs the optimiser (ADR-0006, ADR-0021): a deploy does, a test run does not.
 * The optimiser has no pass yet and only verifies the IR again, so optimised and unoptimised IR run
 * the same; IR the verifier refuses is what tells them apart (#233). Lowering verifies every IR it
 * gives, so such IR reaches {@link EngineFacade#compiledIr} only from a test.
 */
class EngineFacadeOptimiserTest {

  private static final AuthoringId T1 = new AuthoringId("t1");

  /** The root's text reads a variable no scope binds. */
  private static final TargetDocument UNBOUND_VARIABLE =
      new TargetDocument(
          "",
          new Name("", "Out"),
          "root",
          List.of(new TextConstructor(new VarRef("unbound", AtomicType.STRING, T1), T1)));

  @Test
  void theVerifierRefusesTheDocument() {
    assertThatThrownBy(() -> IrVerifier.verify(UNBOUND_VARIABLE))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void anOptimisedCompileRunsTheOptimiser() {
    assertThatThrownBy(() -> EngineFacade.compiledIr(UNBOUND_VARIABLE, CompileOptions.DEPLOY))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void anUnoptimisedCompileKeepsTheLoweredIr() {
    assertThat(EngineFacade.compiledIr(UNBOUND_VARIABLE, CompileOptions.TEST_RUN))
        .isSameAs(UNBOUND_VARIABLE);
  }
}
