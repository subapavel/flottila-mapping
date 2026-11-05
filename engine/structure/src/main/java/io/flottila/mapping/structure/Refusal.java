package io.flottila.mapping.structure;

// stub: #92 test-author. The type of the approved design, so that the #92 tests compile; the
// implementer replaces this file.
public record Refusal(Refusal.Reason reason, String file, int line, int column) {

  // stub: #92 test-author
  public enum Reason {
    AMBIGUOUS_FIELD_PATH;

    // stub: #92 test-author
    public String code() {
      throw new UnsupportedOperationException("stub: #92 test-author");
    }
  }
}
