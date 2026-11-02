package io.flottila.mapping.xslt.export;

import io.flottila.mapping.ir.TargetDocument;

// stub for red (#27): the signatures of the #27 design; the implementer writes the bodies
/** The portable XSLT 3.0 export of unoptimised IR (ADR-0023). */
public final class XsltExporter {

  /** The file name of the helper module every export imports (ADR-0023). */
  public static final String HELPER_MODULE = "po-runtime.xsl";

  private XsltExporter() {}

  /** The stylesheet of {@code document}. */
  public static String export(TargetDocument document) {
    // stub for red (#27)
    throw new UnsupportedOperationException("#27");
  }

  /** The text of the helper module. */
  public static String helperModule() {
    // stub for red (#27)
    throw new UnsupportedOperationException("#27");
  }
}
