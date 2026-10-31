package io.flottila.mapping.service;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import java.io.IOException;
import java.io.InputStream;
import java.lang.module.ModuleDescriptor;
import java.net.URL;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The service is the unnamed module, so javac does not keep it out of the engine's internals. These
 * rules do (ADR-0016, "Enforcement"). Rule A reads the exported packages from the engine jars'
 * {@code module-info.class}; there is no hand-written list.
 *
 * <p>The rules allow an empty set while the service and the engine have no classes of their own.
 * The ticket that adds the first service class (#28) removes {@code allowEmptyShould}, so a rule
 * can never pass because it matches nothing.
 */
class ArchitectureTest {

  private static final String ENGINE_MODULE_PREFIX = "io.flottila.mapping.";
  private static final String SERVICE_PACKAGE = "io.flottila.mapping.service";

  /** Rule A: service classes use only engine packages that the engine modules export. */
  @Test
  void ruleA_serviceUsesOnlyExportedEnginePackages() throws IOException {
    Set<String> exported = exportedEnginePackages();
    DescribedPredicate<JavaClass> unexportedEnginePackage =
        DescribedPredicate.describe(
            "classes in an engine package that its module does not export",
            c ->
                c.getPackageName().startsWith(ENGINE_MODULE_PREFIX)
                    && !isServicePackage(c.getPackageName())
                    && !exported.contains(c.getPackageName()));
    ArchRule rule =
        noClasses()
            .that()
            .resideInAPackage(SERVICE_PACKAGE + "..")
            .should()
            .dependOnClassesThat(unexportedEnginePackage)
            .allowEmptyShould(true);
    rule.check(importedClasses());
  }

  /** Rule B: no engine class depends on a framework or on the service. */
  @Test
  void ruleB_engineKnowsNoFrameworkAndNoService() {
    ArchRule rule =
        noClasses()
            .that()
            .resideInAPackage("io.flottila.mapping..")
            .and()
            .resideOutsideOfPackage(SERVICE_PACKAGE + "..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "io.quarkus..", "jakarta..", "com.fasterxml..", SERVICE_PACKAGE + "..")
            .allowEmptyShould(true);
    rule.check(importedClasses());
  }

  /** Rule C: every service class lives in the service package, so rule B can see it. */
  @Test
  void ruleC_everyServiceClassLivesInTheServicePackage() {
    JavaClasses serviceClasses =
        new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPath(Path.of("target", "classes"));
    ArchRule rule =
        classes().should().resideInAPackage(SERVICE_PACKAGE + "..").allowEmptyShould(true);
    rule.check(serviceClasses);
  }

  @Test
  void exportedPackagesAreReadFromTheEngineJars() throws IOException {
    assertThat(engineModuleNames())
        .as("module-info.class of the engine modules on the class path")
        .contains("io.flottila.mapping.api", "io.flottila.mapping.xdm");
  }

  private static boolean isServicePackage(String packageName) {
    return packageName.equals(SERVICE_PACKAGE) || packageName.startsWith(SERVICE_PACKAGE + ".");
  }

  private static JavaClasses importedClasses() {
    return new ClassFileImporter()
        .withImportOption(new ImportOption.DoNotIncludeTests())
        .importPackages("io.flottila.mapping");
  }

  private static Set<String> exportedEnginePackages() throws IOException {
    Set<String> exported = new HashSet<>();
    for (ModuleDescriptor descriptor : engineDescriptors()) {
      for (ModuleDescriptor.Exports exports : descriptor.exports()) {
        if (!exports.isQualified()) {
          exported.add(exports.source());
        }
      }
    }
    return exported;
  }

  private static List<String> engineModuleNames() throws IOException {
    return engineDescriptors().stream().map(ModuleDescriptor::name).toList();
  }

  private static List<ModuleDescriptor> engineDescriptors() throws IOException {
    List<ModuleDescriptor> descriptors = new ArrayList<>();
    var urls = ArchitectureTest.class.getClassLoader().getResources("module-info.class");
    while (urls.hasMoreElements()) {
      URL url = urls.nextElement();
      try (InputStream in = url.openStream()) {
        ModuleDescriptor descriptor = ModuleDescriptor.read(in);
        if (descriptor.name().startsWith(ENGINE_MODULE_PREFIX)) {
          descriptors.add(descriptor);
        }
      }
    }
    return descriptors;
  }
}
