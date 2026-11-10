package io.flottila.mapping.bench;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.structure.importer.ReferenceResolver;
import java.util.concurrent.TimeUnit;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.BenchmarkMode;
import org.openjdk.jmh.annotations.Fork;
import org.openjdk.jmh.annotations.Level;
import org.openjdk.jmh.annotations.Measurement;
import org.openjdk.jmh.annotations.Mode;
import org.openjdk.jmh.annotations.OutputTimeUnit;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.annotations.Warmup;

/**
 * The {@code orders} benchmarks of ADR-0021, end to end through {@code engine/api}: input bytes in,
 * output bytes out. A method's name is its scenario with {@code _} for {@code /}: {@code
 * orders_small_latency} is {@code orders/small/latency}, and its {@code -prof gc} metric {@code
 * gc.alloc.rate.norm} is {@code orders/small/alloc}; {@code compile_orders} is {@code
 * compile/orders}. The defaults are the ratchet's runs (ADR-0021): three forks of three warm-up and
 * five measured iterations of one second; the command line overrides them.
 */
@BenchmarkMode(Mode.AverageTime)
@Fork(3)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 1)
public class OrdersBenchmarks {

  /** The small input and the mapping compiled once, as a deploy compiles it. */
  @State(Scope.Benchmark)
  public static class Small {
    EngineFacade facade;
    CompiledMapping compiled;
    byte[] input;

    @Setup(Level.Trial)
    public void setUp() throws MalformedJsonException {
      BenchMapping orders = BenchMapping.orders();
      facade = new EngineFacade();
      compiled = orders.compile(facade, CompileOptions.DEPLOY);
      input = orders.small();
    }
  }

  /** The model's bytes and its resolver, whose schema files are in memory. */
  @State(Scope.Benchmark)
  public static class Model {
    EngineFacade facade;
    byte[] model;
    ReferenceResolver resolver;

    @Setup(Level.Trial)
    public void setUp() throws MalformedJsonException {
      BenchMapping orders = BenchMapping.orders();
      facade = new EngineFacade();
      model = orders.model();
      resolver = orders.resolver();
      // reads the schema files into the resolver's memory, and proves that the model compiles
      orders.compile(facade, CompileOptions.TEST_RUN);
    }
  }

  /** {@code orders/small/latency}: one run of the small input, µs/op. */
  @Benchmark
  @OutputTimeUnit(TimeUnit.MICROSECONDS)
  public byte[] orders_small_latency(Small small) throws MalformedInputException {
    return small.facade.run(small.compiled, small.input);
  }

  /**
   * {@code compile/orders}: the service's compile of a test run, ms/op, from the model's bytes, the
   * structure read included.
   */
  @Benchmark
  @OutputTimeUnit(TimeUnit.MILLISECONDS)
  public CompileResult compile_orders(Model model) throws MalformedJsonException {
    return model.facade.compile(model.model, model.resolver, CompileOptions.TEST_RUN);
  }
}
