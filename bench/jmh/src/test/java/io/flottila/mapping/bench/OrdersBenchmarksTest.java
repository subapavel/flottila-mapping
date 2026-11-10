package io.flottila.mapping.bench;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.api.CompileResult;
import org.junit.jupiter.api.Test;

/**
 * Each {@code orders} benchmark once, without JMH, as its fork runs it after the trial's setup: it
 * times a run that writes the target message and a compile that is not refused. That the message is
 * right is the differential case {@code bench/orders/001}.
 */
class OrdersBenchmarksTest {

  @Test
  void theSmallLatencyBenchmarkRunsTheSmallInput() throws Exception {
    OrdersBenchmarks.Small small = new OrdersBenchmarks.Small();
    small.setUp();

    byte[] output = new OrdersBenchmarks().orders_small_latency(small);

    // the first order's number, date, customer and price, and the last order's last pick
    assertThat(new String(output, UTF_8))
        .startsWith("<?xml")
        .contains("\"urn:flottila:corpus:bench:orders\"")
        .contains(">SO-100001<", ">2026-06-30<", ">Brookfield, Kira<", ">371.55<")
        .endsWith("NORTH</ns0:Warehouse><ns0:Sku>SKU-99013</ns0:Sku></ns0:Pick></ns0:OrderBatch>");
  }

  @Test
  void theCompileBenchmarkCompilesTheModelAsATestRun() throws Exception {
    OrdersBenchmarks.Model model = new OrdersBenchmarks.Model();
    model.setUp();

    assertThat(new OrdersBenchmarks().compile_orders(model))
        .isInstanceOf(CompileResult.Compiled.class);
  }
}
