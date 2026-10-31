module io.flottila.mapping.api {
  requires transitive io.flottila.mapping.mapping;
  requires io.flottila.mapping.runtime;
  requires io.flottila.mapping.structure.importer;
  requires transitive io.flottila.mapping.structure;
  requires io.flottila.mapping.xslt.export;
  requires io.flottila.mapping.udf.compiler;

  exports io.flottila.mapping.api;
}
