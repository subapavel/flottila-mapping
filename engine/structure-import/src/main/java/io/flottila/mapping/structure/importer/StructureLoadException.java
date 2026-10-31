package io.flottila.mapping.structure.importer;

import java.io.Serial;

/**
 * A schema bundle that cannot be read into a structure. It carries a stable kebab-case code and the
 * position in the schema file that caused it (ADR-0008, ADR-0015). Lines and columns are 1-based:
 *
 * <ul>
 *   <li>{@code schema-not-well-formed}: where the XML parser stops;
 *   <li>a refused construct ({@code schema-construct-unsupported}, {@code schema-invalid}): the end
 *       of its start tag, or the end of refused text;
 *   <li>{@code schema-root-not-found}: the end of the {@code xs:schema} start tag;
 *   <li>an error about a whole file ({@code schema-unreadable}, {@code root-selector-unsupported},
 *       a bundle of other than one file): line 1, column 1.
 * </ul>
 */
public final class StructureLoadException extends Exception {

  @Serial private static final long serialVersionUID = 1L;

  private final String code;
  private final String file;
  private final int line;
  private final int column;

  public StructureLoadException(String code, String file, int line, int column, String message) {
    super(message);
    this.code = code;
    this.file = file;
    this.line = line;
    this.column = column;
  }

  public String code() {
    return code;
  }

  /** The file as the schema bundle refers to it. */
  public String file() {
    return file;
  }

  public int line() {
    return line;
  }

  public int column() {
    return column;
  }
}
