package io.flottila.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import io.flottila.mapping.mapping.LoadResult;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.MappingModelFormat;
import io.flottila.mapping.mapping.StructureRef;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.JsonRoot;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.WsdlDirection;
import io.flottila.mapping.structure.WsdlOperation;
import io.flottila.mapping.structure.WsdlRoot;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The fingerprint pin (ADR-0009 as amended on 2026-11-05, #91): the fingerprint of every structure
 * a corpus mapping uses, the spec-2 subset among them, as a literal. Compile refuses a stored
 * fingerprint that differs from its bundle's, so a reader change that alters the canonical text of
 * one of these structures would refuse every corpus mapping over it; it fails here first, by name.
 */
class FingerprintPinTest {

  /** By the bundle file under {@code corpus/structures/} and the root element, a space between. */
  private static final Map<String, String> PINNED =
      Map.ofEntries(
          entry(
              "json-schema/run-input.schema.json $",
              "sha256:3489768361f8b16d79fcca7f687e5f669511108cb743826bfa741a2b643830c7"),
          entry(
              "observations/nil.schema.json $",
              "sha256:c4c151c16fe989cda60ff2ef006d0cac0768d05331ec0158e4ca6ab3ec5ad5a8"),
          entry(
              "observations/src-orders.xsd Orders",
              "sha256:5e9bdd3db3b284fc086f0233797ede5e4f3fb874bd696ba3f496dd30bffef9a7"),
          entry(
              "observations/tgt-attr.xsd Flagged",
              "sha256:b56d01b2f49ebd527be872f30b54d71b988318a613bd035d7c04148e656c739b"),
          entry(
              "observations/tgt-create.xsd Create",
              "sha256:c55781b0218fbd5796a6bb9e47dda32fbd3cb7129744178ee56130aeaa3c986f"),
          entry(
              "observations/tgt-gen.xsd Gens",
              "sha256:4a92b5bce393664363954017c2b1029537235b8a4557f9a2a220c66d516f4e35"),
          entry(
              "observations/tgt-list.xsd Out",
              "sha256:626cbacff639a86b480bb3c20cc032d8aa47ad341d9111e31882ad30ca6eca70"),
          entry(
              "observations/tgt-nested.xsd Doc",
              "sha256:b332e167f64d36905b0ae08963a21b6d358bc7e29454797506150420956ac187"),
          entry(
              "observations/tgt-parents.xsd Parents",
              "sha256:2f05337dcfccb424e2a353eb4b124a3641ae56c154a742b5ba2e77c95c7c502d"),
          entry(
              "observations/tgt-required-attr.xsd Coded",
              "sha256:231ac22e1a8229cce19e6ab94298d8843aa7da573fbe9b8a5d844a5b05d112b7"),
          entry(
              "observations/tgt-unmapped.xsd Unmapped",
              "sha256:bb054118c01ca0072e0e8be95386b7c8fb4c8ab366cbd7f92bff8debbded1706"),
          entry(
              "skeleton/order.xsd Q{urn:flottila:corpus:skeleton}Order",
              "sha256:df1714b8b2e4b09e326626a2ea72780bf6298a0ca733c69f5586ea657e4bd90d"));

  /** The root of a key whose structure is a JSON root (#98). */
  private static final String JSON_ROOT = "$";

  /**
   * WSDL roots (#96): by the bundle files under {@code corpus/structures/}, a space between, then
   * {@code |} and the selector ({@code <interface> <operation> <direction> [<fault>]}).
   */
  private static final Map<String, String> PINNED_WSDL =
      Map.ofEntries(
          entry(
              "files-and-names/import-location/common/types.xsd"
                  + " files-and-names/import-location/po/order.xsd wsdl/order-11.wsdl"
                  + " | Q{urn:flottila:corpus:wsdl11}OrderPort Submit input",
              "sha256:510d96ec830e4ad8aa2e477a6fe73640f58587cc84ce10ec68ce666ca65edd16"),
          entry(
              "files-and-names/import-location/common/types.xsd"
                  + " files-and-names/import-location/po/order.xsd wsdl/order-11.wsdl"
                  + " | Q{urn:flottila:corpus:wsdl11}OrderPort Submit output",
              "sha256:facdda4e20e0833ad276202aa9f4c563264b3b071e5c12825ba01082ba1cbc85"));

  /** The prefix of a corpus mapping's bundle reference: mappings sit beside structures. */
  private static final String STRUCTURES = "../structures/";

  @Test
  void every_pinned_structure_loads_with_its_literal_fingerprint() {
    Map<String, String> loaded = new TreeMap<>();
    for (String key : PINNED.keySet()) {
      String[] fileAndRoot = key.split(" ", 2);
      Path file = Path.of(fileAndRoot[0]);
      StructureResult result =
          Structures.load(
              DirectoryResolver.over(CorpusStructures.directory(file.getParent().toString())),
              new SchemaBundle(List.of(file.getFileName().toString())),
              fileAndRoot[1].equals(JSON_ROOT) ? new JsonRoot() : new ElementRoot(fileAndRoot[1]));
      assertThat(result).as(key).isInstanceOf(StructureResult.Loaded.class);
      loaded.put(key, ((StructureResult.Loaded) result).structure().fingerprint());
    }

    assertThat(loaded).isEqualTo(new TreeMap<>(PINNED));
  }

  @Test
  void every_pinned_WSDL_structure_loads_with_its_literal_fingerprint() {
    Path structures = CorpusStructures.directory("wsdl").getParent();
    Map<String, String> loaded = new TreeMap<>();
    for (String key : PINNED_WSDL.keySet()) {
      String[] filesAndSelector = key.split(" \\| ", 2);
      String[] selector = filesAndSelector[1].split(" ");
      WsdlDirection direction = WsdlDirection.valueOf(selector[2].toUpperCase(Locale.ROOT));
      Optional<String> fault = selector.length > 3 ? Optional.of(selector[3]) : Optional.empty();
      StructureResult result =
          Structures.load(
              DirectoryResolver.over(structures),
              new SchemaBundle(List.of(filesAndSelector[0].split(" "))),
              new WsdlRoot(new WsdlOperation(selector[0], selector[1], direction, fault)));
      assertThat(result).as(key).isInstanceOf(StructureResult.Loaded.class);
      loaded.put(key, ((StructureResult.Loaded) result).structure().fingerprint());
    }

    assertThat(loaded).isEqualTo(new TreeMap<>(PINNED_WSDL));
  }

  /**
   * Every side of every corpus mapping names a pinned structure and stores its pinned fingerprint,
   * so a corpus mapping over a structure this test does not pin fails here.
   */
  @Test
  void every_structure_a_corpus_mapping_uses_is_pinned_with_its_stored_fingerprint()
      throws Exception {
    Map<String, String> stale = new TreeMap<>();
    List<Path> mappings = corpusMappings();
    assertThat(mappings).as("corpus mappings").isNotEmpty();
    for (Path mapping : mappings) {
      MappingModel model = model(mapping);
      for (StructureRef side : List.of(model.source(), model.target())) {
        String key = key(side);
        if (!side.fingerprint().equals(PINNED.getOrDefault(key, PINNED_WSDL.get(key)))) {
          stale.put(mapping.getFileName() + " " + key, side.fingerprint());
        }
      }
    }

    // the corpus's two deliberately stale mappings, and nothing else (structure/fingerprint/*)
    assertThat(stale)
        .containsOnlyKeys(
            "fingerprint-stale-source.mapping.json skeleton/order.xsd"
                + " Q{urn:flottila:corpus:skeleton}Order",
            "fingerprint-stale-target.mapping.json skeleton/order.xsd"
                + " Q{urn:flottila:corpus:skeleton}Order");
  }

  private static String key(StructureRef side) {
    List<String> files = side.bundle().files();
    if (side.root() instanceof WsdlRoot(WsdlOperation operation)) {
      return wsdlKey(files, operation);
    }
    assertThat(files).as("a corpus bundle of the spec-2 subset").hasSize(1);
    assertThat(files.getFirst()).startsWith(STRUCTURES);
    // a JSON source's root is $ (#98)
    String root =
        side.root() instanceof JsonRoot ? JSON_ROOT : ((ElementRoot) side.root()).element();
    return files.getFirst().substring(STRUCTURES.length()) + " " + root;
  }

  /** A key of {@link #PINNED_WSDL}. */
  private static String wsdlKey(List<String> files, WsdlOperation operation) {
    assertThat(files)
        .as("a WSDL bundle under corpus/structures")
        .allMatch(f -> f.startsWith(STRUCTURES));
    return String.join(" ", files.stream().map(f -> f.substring(STRUCTURES.length())).toList())
        + " | "
        + operation.interfaceName()
        + " "
        + operation.operation()
        + " "
        + operation.direction().name().toLowerCase(Locale.ROOT)
        + operation.fault().map(f -> " " + f).orElse("");
  }

  private static MappingModel model(Path mapping) throws Exception {
    LoadResult result = MappingModelFormat.load(Files.readAllBytes(mapping));
    assertThat(result).as("%s", mapping).isInstanceOf(Loaded.class);
    return ((Loaded) result).model();
  }

  /** Every {@code corpus/mappings/*.mapping.json}, sorted. */
  private static List<Path> corpusMappings() throws IOException {
    Path mappings = CorpusStructures.directory("skeleton").getParent().resolveSibling("mappings");
    try (Stream<Path> files = Files.list(mappings)) {
      return files
          .filter(p -> p.getFileName().toString().endsWith(".mapping.json"))
          .sorted()
          .toList();
    }
  }
}
