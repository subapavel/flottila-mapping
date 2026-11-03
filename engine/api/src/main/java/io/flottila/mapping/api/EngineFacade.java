package io.flottila.mapping.api;

import io.flottila.mapping.ir.IrOptimiser;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.LoadResult;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.Lowered;
import io.flottila.mapping.mapping.Lowering;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.MappingModelFormat;
import io.flottila.mapping.mapping.Refused;
import io.flottila.mapping.mapping.StructureRef;
import io.flottila.mapping.runtime.Interpreter;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.runtime.MappingRunException;
import io.flottila.mapping.runtime.Tracer;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.xslt.export.XsltExporter;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;

/**
 * The engine facade the service calls (ADR-0016). It carries no compatibility promise and is not
 * the embedding API for Flottila.
 */
public final class EngineFacade {

  /** The runtime error of a test run that exceeds its timeout (ADR-0014, ADR-0015). */
  private static final String TIMEOUT = "flottila:TIMEOUT";

  /** How {@link #testRun} waits for its run: the wall clock, unless a test gives its own. */
  private final Deadline deadline;

  /** A facade; it holds no mutable state, and its test runs wait by the wall clock. */
  public EngineFacade() {
    this((run, timeout, tracer) -> run.get(timeout.toNanos(), TimeUnit.NANOSECONDS));
  }

  /** A facade whose test runs wait by {@code deadline}: a test's fake clock (CODING_STANDARDS). */
  EngineFacade(Deadline deadline) {
    this.deadline = deadline;
  }

  /**
   * How a test run waits for its run until its timeout (ADR-0014): the wall clock, or a test's
   * clock that reaches the timeout at a point of the run it picks by the run's tracer.
   */
  @FunctionalInterface
  interface Deadline {

    /**
     * The run's output once it is done.
     *
     * @throws TimeoutException once the timeout is reached first
     * @throws ExecutionException when the run failed, its cause
     * @throws InterruptedException when the waiting thread is interrupted
     */
    byte[] await(Future<byte[]> run, Duration timeout, Tracer tracer)
        throws InterruptedException, ExecutionException, TimeoutException;
  }

  /**
   * Loads a mapping model through validation stages 1 and 2 (ADR-0011).
   *
   * @param json the document's bytes
   * @return the model, or the diagnostics that refuse it
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  public LoadResult load(byte[] json) throws MalformedJsonException {
    return MappingModelFormat.load(json);
  }

  /** The canonical form of {@code model} (ADR-0010). */
  public byte[] save(MappingModel model) {
    return MappingModelFormat.save(model);
  }

  /**
   * A new mapping model in {@code formatVersion} 1 (ADR-0010) between two structures, with no
   * target field mapping and no UDF.
   *
   * @param source the source structure's schema bundle, root and fingerprint
   * @param target the target structure's schema bundle, root and fingerprint
   * @return the model, not yet saved
   */
  public MappingModel newMapping(StructureRef source, StructureRef target) {
    return new MappingModel(1, source, target, Map.of(), Map.of());
  }

  /**
   * Compiles a mapping model (ADR-0016): load with stages 1 and 2, the source and target
   * structures, stage 3 and lowering, the optimiser if {@code options} ask for it, then the closure
   * compile. The first of these that refuses the model gives the result; the structures are both
   * read before either refusal is reported.
   *
   * @param model the mapping model's bytes
   * @param base the directory the model's schema bundle references are relative to
   * @return the compiled mapping, or the diagnostics that refuse it
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  public CompileResult compile(byte[] model, Path base, CompileOptions options)
      throws MalformedJsonException {
    return loadAndLower(
        model,
        base,
        CompileResult.Refused::new,
        document -> {
          // lowering has verified the IR; the optimiser verifies it again (ADR-0006)
          TargetDocument ir = options.optimised() ? IrOptimiser.optimise(document) : document;
          return new CompileResult.Compiled(
              new CompiledMapping(Interpreter.compile(ir, options.traced())));
        });
  }

  /**
   * Exports a mapping model to XSLT 3.0 in the portable profile (ADR-0023): load, structures, stage
   * 3 and lowering as {@link #compile} does them, then the export of the unoptimised IR. A refused
   * model gives no stylesheet, not even of the target fields that would export.
   *
   * @param model the mapping model's bytes
   * @param base the directory the model's schema bundle references are relative to
   * @return the stylesheet and its helper module, or the diagnostics that refuse the model
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  public ExportResult export(byte[] model, Path base) throws MalformedJsonException {
    return loadAndLower(
        model,
        base,
        ExportResult.Refused::new,
        document ->
            new ExportResult.Exported(XsltExporter.export(document), XsltExporter.helperModule()));
  }

  /**
   * The chain compile and export share: load with stages 1 and 2, the source and target structures,
   * then stage 3 and lowering. The first of these that refuses the model gives {@code refused} its
   * diagnostics, which the result sorts; the structures are both read before either refusal is
   * reported. A model that lowers gives {@code lowered} its unoptimised IR.
   */
  private static <R> R loadAndLower(
      byte[] model,
      Path base,
      Function<List<Diagnostic>, R> refused,
      Function<TargetDocument, R> lowered)
      throws MalformedJsonException {
    return switch (MappingModelFormat.load(model)) {
      case Refused r -> refused.apply(r.diagnostics());
      case Loaded(MappingModel loaded) -> {
        List<Diagnostic> refusals = new ArrayList<>();
        Optional<Structure> source = structure(base, loaded.source(), refusals);
        Optional<Structure> target = structure(base, loaded.target(), refusals);
        if (!refusals.isEmpty()) {
          yield refused.apply(refusals);
        }
        yield switch (Lowering.lower(loaded, source.orElseThrow(), target.orElseThrow())) {
          case Refused r -> refused.apply(r.diagnostics());
          case Lowered(TargetDocument document) -> lowered.apply(document);
        };
      }
    };
  }

  /** The structure {@code ref} names, or empty once its load error is added to {@code refusals}. */
  private static Optional<Structure> structure(
      Path base, StructureRef ref, List<Diagnostic> refusals) {
    return switch (Structures.load(base, ref.bundle(), ref.root())) {
      case StructureResult.Loaded(Structure structure) -> Optional.of(structure);
      case StructureResult.Refused(Diagnostic diagnostic) -> {
        refusals.add(diagnostic);
        yield Optional.empty();
      }
    };
  }

  /**
   * Runs one input message through a compiled mapping and returns the target message's bytes. A
   * test-run compile's trace is recorded and dropped; {@link #testRun} returns it.
   *
   * @throws MalformedInputException when the input is no well-formed XML document, or has a DOCTYPE
   * @throws MappingRunException when the run meets a runtime error in its data, with its code and
   *     authoring id (ADR-0015 since #52)
   * @throws java.util.concurrent.CancellationException when the thread is interrupted
   */
  public byte[] run(CompiledMapping mapping, byte[] input) throws MalformedInputException {
    return run(mapping, input, new Tracer());
  }

  /** {@link #run}, reporting to {@code tracer}. */
  private static byte[] run(CompiledMapping mapping, byte[] input, Tracer tracer)
      throws MalformedInputException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      mapping.executable().run(new ByteArrayInputStream(input), out, tracer);
    } catch (IOException e) {
      // only the output stream can throw it, and a ByteArrayOutputStream never does
      throw new UncheckedIOException(e);
    }
    return out.toByteArray();
  }

  /**
   * A test run (ADR-0014, "Running"): {@link #run} on a platform thread of its own, never a virtual
   * one (ADR-0020), for at most {@code timeout}. A runtime error in the run's data is the result's
   * runtime error, with its code, message and authoring id (ADR-0015 since #52). Past the timeout
   * the run is interrupted, never stopped, and the result is the runtime error {@code
   * flottila:TIMEOUT}, with no authoring id; the run itself ends at its next interrupt check, in
   * the parse or a slot loop.
   *
   * <p>Each result carries the run's trace (ADR-0015 "Trace" since #53), built here from the
   * tracer's reports, with each entry capped at {@code traceLimit}: the whole trace with the
   * output, the trace up to the error with a runtime error, and at the timeout a snapshot of the
   * reports so far, which the run's later reports never reach (ADR-0014 since #53). A compile
   * without tracing never reports, so its trace is empty.
   *
   * @param mapping a compiled mapping
   * @param input the input message's bytes
   * @param timeout how long the run may take
   * @param traceLimit the trace limit: the most slots, contexts or occurrence records one trace
   *     entry keeps, at least 1
   * @return the target message, or the runtime error that stopped the run
   * @throws IllegalArgumentException when {@code traceLimit} is less than 1; nothing runs
   * @throws MalformedInputException when the input is no well-formed XML document, or has a DOCTYPE
   * @throws CancellationException when the calling thread is interrupted while it waits; its
   *     interrupt status is kept, and the run is interrupted too
   * @throws IllegalStateException when the run fails with an unchecked throwable, its cause
   */
  public TestRunResult testRun(
      CompiledMapping mapping, byte[] input, Duration timeout, int traceLimit)
      throws MalformedInputException {
    if (traceLimit < 1) {
      throw new IllegalArgumentException("a trace limit is at least 1, not " + traceLimit);
    }
    Tracer tracer = new Tracer();
    FutureTask<byte[]> task = new FutureTask<>(() -> run(mapping, input, tracer));
    // a daemon, as a virtual thread is, so that a run which ignores its interrupt never holds
    // the JVM open (ADR-0020)
    Thread.ofPlatform().name("flottila test run").daemon(true).start(task);
    try {
      byte[] output = deadline.await(task, timeout, tracer);
      return new TestRunResult.Output(output, TraceBuilder.build(tracer.reports(), traceLimit));
    } catch (TimeoutException late) {
      // the run reports on until its next interrupt check: first the snapshot, a copy of the
      // reports so far taken under the tracer's lock, then the interrupt, and last the trace,
      // built from the copy (ADR-0014 since #53)
      List<Tracer.Report> soFar = tracer.reports();
      task.cancel(true);
      return new TestRunResult.RuntimeError(
          TIMEOUT,
          "the test run took longer than its timeout of " + timeout.toMillis() + " ms",
          Optional.empty(),
          TraceBuilder.build(soFar, traceLimit));
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new CancellationException("the test run was interrupted while it was awaited");
    } catch (ExecutionException failed) {
      // run declares only MalformedInputException; anything else it throws is unchecked
      switch (failed.getCause()) {
        case MalformedInputException malformed -> throw malformed;
        case MappingRunException error -> {
          return new TestRunResult.RuntimeError(
              error.code(),
              error.getMessage(),
              Optional.of(error.authoringId()),
              TraceBuilder.build(tracer.reports(), traceLimit));
        }
        default -> throw new IllegalStateException("the test run failed", failed.getCause());
      }
    } finally {
      // a no-op once the run is done or cancelled; otherwise it interrupts the run's thread
      task.cancel(true);
    }
  }
}
