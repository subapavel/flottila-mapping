package io.flottila.mapping.oracle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Every corpus case whose provenance is {@code assumed} is waiting for an owner's observation in
 * SAP PO (ADR-0018 "Observed cases"). A case missing from every observation request would never be
 * observed. Each case id must be named in a {@code request.md} under {@code corpus/observations},
 * and that request's directory must hold the case's input file, so the owner can rebuild it.
 */
class ObservationRequestsCoverAssumedCasesTest {

  private static final Path OBSERVATIONS = CaseFiles.corpus().resolve("observations");

  private static List<Path> requests() throws IOException {
    try (Stream<Path> all = Files.walk(OBSERVATIONS)) {
      return all.filter(p -> p.getFileName().toString().equals("request.md")).sorted().toList();
    }
  }

  private static boolean names(String request, String caseId) {
    return Pattern.compile("(?<![\\w/.-])" + Pattern.quote(caseId) + "(?![\\w/])")
        .matcher(request)
        .find();
  }

  private static String normalised(Path xml) throws IOException {
    return Files.readString(xml, StandardCharsets.UTF_8).replaceAll("\\s+", "");
  }

  @Test
  void namesMatchWholeIdsOnly() {
    assertTrue(names("see `fn/sort/001`.", "fn/sort/001"));
    assertFalse(names("see `fn/sort/0011`.", "fn/sort/001"));
    assertFalse(names("see `xfn/sort/001`.", "fn/sort/001"));
    assertFalse(names("see `fn/sort/001/x`.", "fn/sort/001"));
  }

  @Test
  void everyAssumedCaseIsInAnObservationRequestWithItsInput() throws IOException {
    List<CaseFiles.CorpusCase> assumed =
        CaseFiles.all().stream().filter(c -> c.provenance().equals("assumed")).toList();
    assertFalse(assumed.isEmpty(), "no assumed cases: the check would pass for nothing");

    List<Path> requests = requests();
    List<String> missing = new ArrayList<>();
    List<String> noInput = new ArrayList<>();
    for (CaseFiles.CorpusCase c : assumed) {
      List<Path> holders = new ArrayList<>();
      for (Path r : requests) {
        if (names(Files.readString(r, StandardCharsets.UTF_8), c.id())) {
          holders.add(r);
        }
      }
      if (holders.isEmpty()) {
        missing.add(c.id());
        continue;
      }
      String input = normalised(c.input());
      boolean ready = false;
      for (Path r : holders) {
        try (Stream<Path> files = Files.list(r.getParent())) {
          ready |=
              files
                  .filter(f -> f.getFileName().toString().matches(".*\\.(xml|json)"))
                  .anyMatch(
                      f -> {
                        try {
                          return normalised(f).equals(input);
                        } catch (IOException e) {
                          throw new java.io.UncheckedIOException(e);
                        }
                      });
        }
      }
      if (!ready) {
        noInput.add(c.id());
      }
    }
    assertEquals(List.of(), missing, "assumed cases in no observation request");
    assertEquals(List.of(), noInput, "assumed cases whose input is not in their request's kit");
  }
}
