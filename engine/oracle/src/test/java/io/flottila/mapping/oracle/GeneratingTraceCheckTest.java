package io.flottila.mapping.oracle;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.api.Trace;
import io.flottila.mapping.ir.AtomicType;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Witness of the corpus trace check's result entry (#83): a generating field, whose graph has no
 * source-field box, may have an atomic entry; a field read from a source field may not. Not a
 * corpus or differential class, so the ratchet does not read its test as a case id
 * (scripts/ratchet.java).
 */
class GeneratingTraceCheckTest {

  private static final Trace.Entry ATOMIC = new Trace.Atomic(AtomicType.STRING, "k");
  private static final Trace.Entry QUEUE = new Trace.Queue(List.of(List.of("k")), false, 1, 1);

  private static Map<String, Object> link(String resultKind) {
    return Map.of(
        "id", "T1",
        "result", "B1",
        "boxes", Map.of("B1", Map.of("kind", resultKind)));
  }

  @Test
  void onlyAGeneratingFieldMayHaveAnAtomicEntry() {
    Map<String, Object> generating = link("function");
    Map<String, Object> read = link("source");

    assertThatCode(() -> GoldenCorpusTest.checkResultEntry(generating, ATOMIC, "generating"))
        .doesNotThrowAnyException();
    assertThatCode(() -> GoldenCorpusTest.checkResultEntry(generating, QUEUE, "generating"))
        .doesNotThrowAnyException();
    assertThatCode(() -> GoldenCorpusTest.checkResultEntry(read, QUEUE, "read"))
        .doesNotThrowAnyException();
    // the witness: a field read from a source field with an atomic entry fails
    assertThatThrownBy(() -> GoldenCorpusTest.checkResultEntry(read, ATOMIC, "read"))
        .isInstanceOf(AssertionError.class);
    // no entry at all fails either way
    assertThatThrownBy(() -> GoldenCorpusTest.checkResultEntry(generating, null, "generating"))
        .isInstanceOf(AssertionError.class);
  }
}
