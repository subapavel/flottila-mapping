package io.flottila.mapping.mapping;

import com.github.erosb.jsonsKema.IJsonValue;
import io.flottila.mapping.mapping.internal.CanonicalWriter;
import io.flottila.mapping.mapping.internal.ModelCheck;
import io.flottila.mapping.mapping.internal.ModelReader;
import io.flottila.mapping.mapping.internal.SchemaStage;
import io.flottila.mapping.mapping.internal.StrictJsonReader;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Loads and saves mapping models in {@code formatVersion} 1 (ADR-0010, ADR-0011). Loading runs
 * validation stages 1 (schema) and 2 (model check); saving writes the canonical form, the only
 * spelling of a model.
 */
public final class MappingModelFormat {

  /** Diagnostics are sorted by location, then code. */
  private static final Comparator<Diagnostic> ORDER =
      Comparator.comparing((Diagnostic d) -> place(d.location())).thenComparing(Diagnostic::code);

  private MappingModelFormat() {}

  /**
   * Reads a mapping model. A refusal is a result: stage 1 refuses a document the schema does not
   * accept, or a newer {@code formatVersion}, and stage 2 refuses a model that fails the model
   * check. Stage 2 runs only on a document that stage 1 accepts.
   *
   * @param json the document's bytes
   * @return the model, or the diagnostics of the stage that refused it
   * @throws MalformedJsonException if the bytes are no JSON document (ADR-0011: a transport error)
   */
  public static LoadResult load(byte[] json) throws MalformedJsonException {
    IJsonValue document = StrictJsonReader.read(json);
    List<Diagnostic> schema = SchemaStage.check(document);
    if (!schema.isEmpty()) {
      return refused(schema);
    }
    MappingModel model = ModelReader.read(document);
    List<Diagnostic> check = ModelCheck.check(model);
    return check.isEmpty() ? new Loaded(model) : refused(check);
  }

  /** The canonical form of {@code model}: the bytes a save writes. */
  public static byte[] save(MappingModel model) {
    return CanonicalWriter.write(model);
  }

  private static Refused refused(List<Diagnostic> diagnostics) {
    List<Diagnostic> sorted = new ArrayList<>(diagnostics);
    sorted.sort(ORDER);
    return new Refused(sorted);
  }

  private static String place(Location location) {
    return switch (location) {
      case AtPointer p -> p.pointer();
      case AtAuthoringId a -> a.id().value();
    };
  }
}
