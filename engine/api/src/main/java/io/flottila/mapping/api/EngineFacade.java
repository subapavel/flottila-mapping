package io.flottila.mapping.api;

import io.flottila.mapping.ir.IrOptimiser;
import io.flottila.mapping.ir.IrVerifier;
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
import io.flottila.mapping.runtime.Tracer;
import io.flottila.mapping.structure.Structure;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The engine facade the service calls (ADR-0016). It carries no compatibility promise and is not
 * the embedding API for Flottila.
 */
public final class EngineFacade {

  /** A facade; it holds no state. */
  public EngineFacade() {}

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
   * Compiles a mapping model (ADR-0016): load with stages 1 and 2, the source and target
   * structures, stage 3 and lowering, the IR verifier and, if asked, the optimiser, then the
   * closure compile. The first of these that refuses the model gives the result; the structures are
   * both read before either refusal is reported.
   *
   * @param model the mapping model's bytes
   * @param base the directory the model's schema bundle references are relative to
   * @return the compiled mapping, or the diagnostics that refuse it
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  public CompileResult compile(byte[] model, Path base, CompileOptions options)
      throws MalformedJsonException {
    return switch (MappingModelFormat.load(model)) {
      case Refused refused -> new CompileResult.Refused(refused.diagnostics());
      case Loaded(MappingModel loaded) -> compile(loaded, base, options);
    };
  }

  private static CompileResult compile(MappingModel model, Path base, CompileOptions options) {
    List<Diagnostic> refusals = new ArrayList<>();
    Optional<Structure> source = structure(base, model.source(), refusals);
    Optional<Structure> target = structure(base, model.target(), refusals);
    if (!refusals.isEmpty()) {
      return new CompileResult.Refused(refusals);
    }
    return switch (Lowering.lower(model, source.orElseThrow(), target.orElseThrow())) {
      case Refused refused -> new CompileResult.Refused(refused.diagnostics());
      case Lowered(TargetDocument document) -> {
        IrVerifier.verify(document);
        TargetDocument ir = options.optimised() ? IrOptimiser.optimise(document) : document;
        yield new CompileResult.Compiled(
            new CompiledMapping(Interpreter.compile(ir, options.traced())));
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
   * test-run compile's trace is recorded and dropped: spec 1 returns no trace.
   *
   * @throws MalformedInputException when the input is no well-formed XML document, or has a DOCTYPE
   * @throws java.util.concurrent.CancellationException when the thread is interrupted
   */
  // api requires runtime non-transitively (#26): a module that catches the exception requires
  // runtime itself; the facade's callers, the service and the oracle, are on the class path
  @SuppressWarnings("exports")
  public byte[] run(CompiledMapping mapping, byte[] input) throws MalformedInputException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      mapping.executable().run(new ByteArrayInputStream(input), out, new Tracer());
    } catch (IOException e) {
      // only the output stream can throw it, and a ByteArrayOutputStream never does
      throw new UncheckedIOException(e);
    }
    return out.toByteArray();
  }
}
