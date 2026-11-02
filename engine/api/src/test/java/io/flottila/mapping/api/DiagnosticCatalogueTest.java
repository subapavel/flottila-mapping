package io.flottila.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.classfile.ClassFile;
import java.lang.classfile.constantpool.PoolEntry;
import java.lang.classfile.constantpool.StringEntry;
import java.lang.module.ModuleFinder;
import java.lang.module.ModuleReader;
import java.lang.module.ModuleReference;
import java.lang.module.ResolvedModule;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The diagnostic catalogue (ADR-0018 as amended by F-9): every engine module declares its codes as
 * the {@code public static final String} constants of one {@code <Module>Diagnostics} class. This
 * test reads the engine modules the facade resolves, from their own locations, so the test classes
 * patched into this module are not scanned.
 */
class DiagnosticCatalogueTest {

  private static final Predicate<String> KEBAB =
      Pattern.compile("[a-z][a-z0-9]*(-[a-z0-9]+)*").asMatchPredicate();

  /** A string that looks like a code: kebab-case words, at least two of them. */
  private static final Predicate<String> CODE_SHAPED =
      Pattern.compile("[a-z][a-z0-9]*(-[a-z0-9]+)+").asMatchPredicate();

  /** In this class's constant pool only: the witness that the scan sees string constants. */
  private static final String NOT_A_CODE = "not-a-catalogue-code";

  private static final String MAPPING = "io.flottila.mapping.mapping.MappingDiagnostics";
  private static final String IMPORT =
      "io.flottila.mapping.structure.importer.StructureImportDiagnostics";

  /** An engine module as built, without the test classes surefire patches into it. */
  private record EngineModule(String name, ModuleReference reference) {}

  private static List<EngineModule> engineModules() {
    return ModuleLayer.boot().configuration().modules().stream()
        .map(ResolvedModule::reference)
        .filter(r -> r.descriptor().name().startsWith("io.flottila.mapping"))
        .map(
            r -> {
              String name = r.descriptor().name();
              Path location = Path.of(r.location().orElseThrow());
              return new EngineModule(name, ModuleFinder.of(location).find(name).orElseThrow());
            })
        .sorted((a, b) -> a.name().compareTo(b.name()))
        .toList();
  }

  /** The {@code .class} resources of a module, without its descriptor. */
  private static List<String> classFiles(EngineModule module) {
    try (ModuleReader reader = module.reference().open();
        Stream<String> names = reader.list()) {
      return names
          .filter(n -> n.endsWith(".class") && !n.endsWith("module-info.class"))
          .sorted()
          .toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static byte[] read(EngineModule module, String classFile) {
    try (ModuleReader reader = module.reference().open();
        InputStream in = reader.open(classFile).orElseThrow()) {
      return in.readAllBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /**
   * The catalogue: per {@code *Diagnostics} class outside {@code .internal}, its codes in order.
   */
  private static Map<String, List<String>> catalogue() throws Exception {
    Map<String, List<String>> catalogue = new TreeMap<>();
    for (EngineModule module : engineModules()) {
      for (String classFile : classFiles(module)) {
        String className = classFile.substring(0, classFile.length() - 6).replace('/', '.');
        if (!className.endsWith("Diagnostics") || className.contains(".internal.")) {
          continue;
        }
        List<String> codes = new ArrayList<>();
        for (Field field : Class.forName(className).getFields()) {
          int modifiers = field.getModifiers();
          if (Modifier.isStatic(modifiers)
              && Modifier.isFinal(modifiers)
              && field.getType() == String.class) {
            codes.add((String) field.get(null));
          }
        }
        catalogue.put(className, codes);
      }
    }
    return catalogue;
  }

  /** The code-shaped string constants of one class file. */
  private static Set<String> codeShapedStrings(byte[] classFile) {
    Set<String> found = new TreeSet<>();
    for (PoolEntry entry : ClassFile.of().parse(classFile).constantPool()) {
      if (entry instanceof StringEntry string && CODE_SHAPED.test(string.stringValue())) {
        found.add(string.stringValue());
      }
    }
    return found;
  }

  @Test
  void codesAreKebabCaseAndUniqueAcrossModules() throws Exception {
    Map<String, List<String>> catalogue = catalogue();
    List<String> all = catalogue.values().stream().flatMap(List::stream).toList();

    assertThat(catalogue).containsKeys(MAPPING, IMPORT);
    assertThat(catalogue.get(MAPPING))
        .contains(
            // stage 1 and 2 (#24, ADR-0011)
            "format-version-unsupported",
            "unknown-member",
            "missing-member",
            "wrong-type",
            "pattern-mismatch",
            "invalid-value",
            "schema-violation",
            "unknown-box-kind",
            "duplicate-authoring-id",
            "unknown-box-reference",
            "cross-target-field-reference",
            "box-cycle",
            "context-not-ancestor",
            "undeclared-udf",
            // stage 3 (#26)
            "unsupported-box-kind",
            "unresolved-function",
            "unsupported-field",
            "orphaned-reference",
            "unconnected-target-field");
    assertThat(catalogue.get(IMPORT))
        .containsExactlyInAnyOrder(
            "schema-not-well-formed",
            "schema-construct-unsupported",
            "schema-invalid",
            "schema-root-not-found",
            "schema-unreadable",
            "root-selector-unsupported");
    assertThat(all).filteredOn(KEBAB.negate()).as("codes that are not kebab-case").isEmpty();
    assertThat(all).as("codes across all modules").doesNotHaveDuplicates();
    // witness: the kebab check refuses what is not kebab-case
    assertThat(
            List.of(
                "unknownMember", "Unknown-member", "unknown_member", "unknown--member", "-x", "x-"))
        .noneMatch(KEBAB);
  }

  @Test
  void everyCodeShapedConstantIsACatalogueCode() throws Exception {
    Set<String> codes =
        catalogue().values().stream().flatMap(List::stream).collect(Collectors.toSet());
    List<EngineModule> modules = engineModules();
    Map<String, Set<String>> classesByString = new TreeMap<>();
    for (EngineModule module : modules) {
      for (String classFile : classFiles(module)) {
        for (String s : codeShapedStrings(read(module, classFile))) {
          classesByString.computeIfAbsent(s, k -> new TreeSet<>()).add(classFile);
        }
      }
    }

    assertThat(modules)
        .extracting(EngineModule::name)
        .contains(
            "io.flottila.mapping.api",
            "io.flottila.mapping.mapping",
            "io.flottila.mapping.ir",
            "io.flottila.mapping.xdm",
            "io.flottila.mapping.runtime",
            "io.flottila.mapping.serializer",
            "io.flottila.mapping.structure",
            "io.flottila.mapping.structure.importer");
    // witnesses: the scan meets the catalogue's own constants, and finds a non-code constant
    assertThat(classesByString).containsKeys("unsupported-box-kind", "schema-not-well-formed");
    byte[] self =
        DiagnosticCatalogueTest.class
            .getResourceAsStream("DiagnosticCatalogueTest.class")
            .readAllBytes();
    assertThat(codeShapedStrings(self)).contains(NOT_A_CODE);
    assertThat(codes).doesNotContain(NOT_A_CODE);

    Map<String, Set<String>> offenders = new TreeMap<>(classesByString);
    offenders.keySet().removeAll(codes);
    assertThat(offenders).as("code-shaped constants that are no catalogue code").isEmpty();
  }
}
