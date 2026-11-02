module io.flottila.mapping.xslt.export {
  requires io.flottila.mapping.mapping;
  // stub for red (#27): transitive and the export below are the #27 design's module shape
  requires transitive io.flottila.mapping.ir;
  requires io.flottila.mapping.structure;

  exports io.flottila.mapping.xslt.export;
}
