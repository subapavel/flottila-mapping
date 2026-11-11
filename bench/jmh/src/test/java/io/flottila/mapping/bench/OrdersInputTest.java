package io.flottila.mapping.bench;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

/**
 * The digest test of the {@code orders} generator (#181, #183): every run of a benchmark measures
 * the same bytes, and the small input is the differential case {@code bench/orders/001}. A change
 * of the generator or of {@code bench.json} changes the pin, and is a finding that resets the
 * mapping's baselines (#181, user story 21).
 */
class OrdersInputTest {

  /** The SHA-256 of the small input, hex. */
  private static final String SMALL_SHA256 =
      "67ed8560c684e9078f7c52a2ebe88416c2795946c9f829526dd2f7f53ef3a8ed";

  @Test
  void theSmallInputIsPinned() throws Exception {
    byte[] small = BenchMapping.orders().small();

    // 8-10 kB under either reading of a kB (ADR-0021)
    assertThat(small.length).as("the small input's size").isBetween(8192, 10_000);
    assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(small)))
        .as("the small input's SHA-256")
        .isEqualTo(SMALL_SHA256);
  }

  @Test
  void theSmallInputIsTheDifferentialCase() throws Exception {
    Path committed =
        Path.of(System.getProperty("flottila.corpus")).resolve("cases/bench/orders/001/input.xml");

    assertThat(BenchMapping.orders().small()).isEqualTo(Files.readAllBytes(committed));
  }
}
