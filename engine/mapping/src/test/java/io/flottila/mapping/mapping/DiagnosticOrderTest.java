package io.flottila.mapping.mapping;

import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.ir.AuthoringId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * {@code Diagnostic.ORDER} sorts by location, then code, for every location kind: a JSON pointer
 * and an authoring id by their text, a file position by file, then line and column as numbers. #26
 * does not fix the order between kinds; it only has to be a total order, so every shuffle of the
 * same diagnostics sorts the same.
 */
class DiagnosticOrderTest {

  private static Diagnostic at(Location location, String code) {
    return new Diagnostic(Severity.ERROR, code, location, "message");
  }

  private static AtAuthoringId id(String value) {
    return new AtAuthoringId(new AuthoringId(value));
  }

  private static AtFilePosition file(String file, int line, int column) {
    return new AtFilePosition(file, line, column);
  }

  @Test
  void sortsAllThreeLocationKinds() {
    // each list in its expected order
    List<Diagnostic> pointers =
        List.of(
            at(new AtPointer(""), "format-version-unsupported"),
            at(new AtPointer("/source/bundle"), "wrong-type"),
            at(new AtPointer("/target"), "missing-member"));
    List<Diagnostic> ids =
        List.of(
            at(id("a1"), "box-cycle"),
            at(id("a1"), "unknown-box-reference"),
            at(id("b1"), "box-cycle"));
    // line 9 before 10 and column 4 before 30: numbers, not text
    List<Diagnostic> files =
        List.of(
            at(file("a.xsd", 12, 5), "schema-invalid"),
            at(file("b.xsd", 9, 4), "schema-construct-unsupported"),
            at(file("b.xsd", 9, 4), "schema-invalid"),
            at(file("b.xsd", 9, 30), "schema-invalid"),
            at(file("b.xsd", 10, 1), "schema-invalid"));
    List<Diagnostic> all = Stream.of(pointers, ids, files).flatMap(List::stream).toList();

    List<List<Diagnostic>> sortings = new ArrayList<>();
    for (long seed = 1; seed <= 20; seed++) {
      List<Diagnostic> shuffled = new ArrayList<>(all);
      Collections.shuffle(shuffled, new Random(seed));
      shuffled.sort(Diagnostic.ORDER);
      sortings.add(shuffled);
    }

    List<Diagnostic> sorted = sortings.getFirst();
    assertThat(sortings).allSatisfy(s -> assertThat(s).isEqualTo(sorted));
    assertThat(sorted.stream().filter(d -> d.location() instanceof AtPointer))
        .containsExactlyElementsOf(pointers);
    assertThat(sorted.stream().filter(d -> d.location() instanceof AtAuthoringId))
        .containsExactlyElementsOf(ids);
    assertThat(sorted.stream().filter(d -> d.location() instanceof AtFilePosition))
        .containsExactlyElementsOf(files);
  }
}
