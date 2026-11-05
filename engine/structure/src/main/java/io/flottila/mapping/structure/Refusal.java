package io.flottila.mapping.structure;

/**
 * Why a mapping may not use a field that loads and shows (ADR-0008 "Refused when a mapping uses the
 * field", GLOSSARY "Refused field"), and where the declaration that causes it stands. The reason
 * enters the fingerprint; the position does not (ADR-0009, #92).
 *
 * @param reason why the field is refused
 * @param file the schema file, as the bundle names it
 * @param line the line of the declaration, where its start tag ends
 * @param column the column of the declaration, where its start tag ends
 */
public record Refusal(Refusal.Reason reason, String file, int line, int column) {

  /** A reason a field is refused. */
  public enum Reason {
    /** Two or more sibling declarations with one step, which no field path tells apart. */
    AMBIGUOUS_FIELD_PATH("ambiguous-field-path");

    private final String code;

    Reason(String code) {
      this.code = code;
    }

    /** The reason's code: the diagnostic code a mapping that uses the field is refused with. */
    public String code() {
      return code;
    }
  }
}
