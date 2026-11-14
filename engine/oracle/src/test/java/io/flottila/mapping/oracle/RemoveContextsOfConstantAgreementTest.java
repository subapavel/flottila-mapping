package io.flottila.mapping.oracle;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.ExportResult;
import io.flottila.mapping.structure.importer.ReferenceResolver;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.SplittableRandom;
import java.util.random.RandomGenerator;
import java.util.stream.LongStream;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * removeContexts over a constant is a generating block on both back ends (F-51, #230; ADR-0004 and
 * ADR-0006 as amended): the corpus mapping remove-contexts-constant of {@code
 * fn/removeContexts/004} (obs-lift-reuse lift-4, PO 7.50 and CPI), Item per Order, V from count
 * over the constant k and W from removeContexts over the constant k. For n Orders, whatever they
 * hold, our runtime as deployed writes n Items, each with one W k, and one V 1, in the first Item
 * only: n W and min(n, 1) V. Then Saxon-HE runs the export on the same input and {@link
 * SaxonRunner#assertAgree} judges. Lift-4 is the case n = 3; the expectation for other n is the
 * design's rule, W under every parent occurrence and V as {@code fn/constant/006}. A seeded
 * generator, the seed in the case name (ADR-0018): seed s draws {@code s mod 7} Orders, so the
 * seeds cross no Order, one Order and several. This class is no corpus or differential class, so
 * the ratchet does not read its tests as case ids (scripts/ratchet.java).
 */
class RemoveContextsOfConstantAgreementTest {

  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
  private static final List<String> VALUES = List.of("a", "1", "", "k", "o2");

  @TempDir Path dir;

  private static Path mapping() {
    return CaseFiles.corpus().resolve("mappings/remove-contexts-constant.mapping.json");
  }

  private static ReferenceResolver base() {
    return DirectoryResolver.over(mapping().getParent());
  }

  /** Ours: the corpus mapping compiled as deployed, run on {@code input}. */
  private static byte[] ours(byte[] input) throws Exception {
    EngineFacade facade = new EngineFacade();
    CompileResult result =
        facade.compile(Files.readAllBytes(mapping()), base(), CompileOptions.DEPLOY);
    if (!(result instanceof CompileResult.Compiled(CompiledMapping compiled))) {
      throw new AssertionError("remove-contexts-constant: expected Compiled, got " + result);
    }
    return facade.run(compiled, input);
  }

  /** Saxon's: the corpus mapping exported through the facade, run on {@code input}. */
  private byte[] saxon(byte[] input) throws Exception {
    ExportResult.Exported exported =
        SaxonRunner.exported(
            new EngineFacade().export(Files.readAllBytes(mapping()), base()),
            "remove-contexts-constant");
    return SaxonRunner.run(exported.stylesheet(), exported.helperModule(), input, dir);
  }

  private static String pick(RandomGenerator random) {
    return VALUES.get(random.nextInt(VALUES.size()));
  }

  /**
   * {@code n} Orders, each with content drawn from {@code random} in src-orders' order: an Id or
   * none, up to two Tags, up to two Lines with a Sku and a Qty or none, a Memo or none. No source
   * field is read, so the output must not depend on any of it.
   */
  private static byte[] orders(int n, RandomGenerator random) {
    StringBuilder xml = new StringBuilder("<Orders>");
    for (int o = 1; o <= n; o++) {
      xml.append("<Order>");
      if (random.nextBoolean()) {
        xml.append("<Id>o").append(o).append("</Id>");
      }
      for (int t = random.nextInt(3); t > 0; t--) {
        xml.append("<Tag>").append(pick(random)).append("</Tag>");
      }
      for (int l = random.nextInt(3); l > 0; l--) {
        xml.append("<Line>");
        if (random.nextBoolean()) {
          xml.append("<Sku>").append(pick(random)).append("</Sku>");
        }
        if (random.nextBoolean()) {
          xml.append("<Qty>").append(pick(random)).append("</Qty>");
        }
        xml.append("</Line>");
      }
      if (random.nextBoolean()) {
        xml.append("<Memo><Text>").append(pick(random)).append("</Text></Memo>");
      }
      xml.append("</Order>");
    }
    return xml.append("</Orders>").toString().getBytes(UTF_8);
  }

  static LongStream seeds() {
    return LongStream.rangeClosed(0, 20);
  }

  @ParameterizedTest(name = "seed {0}")
  @MethodSource("seeds")
  void everyItemGetsTheBlockAndOnlyTheFirstTheCountOnBothBackEnds(long seed) throws Exception {
    int n = (int) (seed % 7);
    byte[] input = orders(n, new SplittableRandom(seed));
    String what = "seed " + seed + ", " + n + " Orders";
    // witness: the input holds the Orders the seed names
    assertThat(new String(input, UTF_8).split("<Order>", -1)).as(what).hasSize(n + 1);

    byte[] ours = ours(input);

    assertThat(new String(ours, UTF_8))
        .as("%s: n W k, one V 1 in the first Item", what)
        .isEqualTo(
            n == 0
                ? DECLARATION + "<Out/>"
                : DECLARATION
                    + "<Out><Item><V>1</V><W>k</W></Item>"
                    + "<Item><W>k</W></Item>".repeat(n - 1)
                    + "</Out>");
    SaxonRunner.assertAgree(saxon(input), ours, what);
  }
}
