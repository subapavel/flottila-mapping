package io.flottila.mapping.service;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The workspace is the security boundary (ADR-0024, glossary "Workspace path", "Workspace escape"):
 * an id, a base directory or a bundle reference that leaves it is a {@link WorkspacePathException}
 * and never a read or a write.
 *
 * <p>Each test lays out {@code tmp/ws} (the workspace) next to {@code tmp/outside}, whose files no
 * call may read or change. A mapping file's content is its id, so a read shows which file it read.
 */
class WorkspaceTest {

  private static final byte[] OUTSIDE = "outside: never read, never written".getBytes(UTF_8);
  private static final byte[] NEW = "{\"written\": true}".getBytes(UTF_8);

  @TempDir Path tmp;

  /** The workspace's real path. */
  private Path root;

  private Path outside;
  private Workspace workspace;

  @BeforeEach
  void layOut() throws IOException {
    root = Files.createDirectory(tmp.resolve("ws")).toRealPath();
    outside = Files.createDirectory(tmp.resolve("outside")).toRealPath();
    Files.write(outside.resolve("evil.mapping.json"), OUTSIDE);
    Files.write(outside.resolve("evil.xsd"), OUTSIDE);
    // what "../evil" would read from the workspace
    Files.write(tmp.resolve("evil.mapping.json"), OUTSIDE);
    mapping("a/b");
    workspace = new Workspace(tmp.resolve("ws"));
  }

  @Test
  void refusesDotDot() throws Exception {
    mapping("x");
    Map<String, String> before = besideTheWorkspace();

    // ids: no segment starts with a dot, so ".." never appears, not even where it stays inside
    for (String id :
        List.of(
            "..", "../evil", "../outside/evil", "a/..", "a/../x", "a/../../evil", ".x", "a/.b")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
      assertRefused(() -> workspace.create(id, NEW), id);
    }
    for (String base : List.of("..", "../outside", "a/..", "a/../a", ".", "a/.")) {
      assertRefused(() -> workspace.directory(base), base);
    }
    // bundle references: ".." only as a leading run, and never above the root
    Path a = root.resolve("a");
    for (String ref : List.of("a/../x.xsd", "./x.xsd", "../../outside/evil.xsd", "../../x.xsd")) {
      assertRefused(() -> workspace.checkBundle(a, List.of(ref)), ref);
    }
    assertRefused(() -> workspace.checkBundle(root, List.of("../outside/evil.xsd")), "from root");
    // one bad reference refuses the bundle
    assertRefused(
        () -> workspace.checkBundle(a, List.of("b.xsd", "../../outside/evil.xsd")), "second ref");

    assertThat(besideTheWorkspace()).isEqualTo(before);
    // the same shapes inside the workspace are workspace paths
    assertThat(workspace.read("a/b")).asString(UTF_8).isEqualTo("a/b");
    assertThat(workspace.read("x")).asString(UTF_8).isEqualTo("x");
    assertThat(workspace.directory("a")).isEqualTo(root.resolve("a"));
    assertThatNoException()
        .isThrownBy(() -> workspace.checkBundle(a, List.of("../x.xsd", "b.xsd")));
  }

  @Test
  void refusesAbsolute() throws Exception {
    Map<String, String> before = besideTheWorkspace();
    String insideAbsolute = root.resolve("a/b").toString();

    // a leading "/" is refused even where the path lies inside the workspace
    for (String id : List.of("/a/b", insideAbsolute, outside.resolve("evil").toString(), "/")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
      assertRefused(() -> workspace.create(id, NEW), id);
    }
    for (String base : List.of("/", root.toString(), outside.toString(), "/a")) {
      assertRefused(() -> workspace.directory(base), base);
    }
    for (String ref :
        List.of(outside.resolve("evil.xsd").toString(), root.resolve("a/x.xsd").toString())) {
      assertRefused(() -> workspace.checkBundle(root, List.of(ref)), ref);
    }

    assertThat(besideTheWorkspace()).isEqualTo(before);
    assertThat(workspace.read("a/b")).asString(UTF_8).isEqualTo("a/b");
  }

  @Test
  void refusesPercentEncoded() throws Exception {
    // files whose names are the encoded text exist: only the refusal keeps them from a read
    mapping("%2e%2e");
    mapping("a%2Fb");
    Files.createDirectories(root.resolve("%2e%2e"));
    Map<String, String> before = besideTheWorkspace();

    // the text is already decoded once (ADR-0024): what is left of a "%" is never decoded again
    for (String id : List.of("%2e%2e", "%2e%2e%2fevil", "%252e%252e", "a%2Fb", "a%2fb", "%")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
      assertRefused(() -> workspace.create(id, NEW), id);
    }
    for (String base : List.of("%2e%2e", "a%2F", "%252e")) {
      assertRefused(() -> workspace.directory(base), base);
    }
    for (String ref : List.of("%2e%2e/outside/evil.xsd", "a%2Fb.xsd", "%252e%252e/x.xsd")) {
      assertRefused(() -> workspace.checkBundle(root, List.of(ref)), ref);
    }

    assertThat(besideTheWorkspace()).isEqualTo(before);
    assertThat(workspace.read("a/b")).asString(UTF_8).isEqualTo("a/b");
  }

  @Test
  void refusesNul() throws Exception {
    Map<String, String> before = besideTheWorkspace();

    for (String id : List.of("a\0", "a/b\0", "\0", "a\0/../../evil")) {
      assertRefused(() -> workspace.read(id), printable(id));
      assertRefused(() -> workspace.save(id, NEW), printable(id));
      assertRefused(() -> workspace.create(id, NEW), printable(id));
    }
    for (String base : List.of("a\0", "\0")) {
      assertRefused(() -> workspace.directory(base), printable(base));
    }
    for (String ref : List.of("x.xsd\0", "\0../outside/evil.xsd")) {
      assertRefused(() -> workspace.checkBundle(root, List.of(ref)), printable(ref));
    }

    assertThat(besideTheWorkspace()).isEqualTo(before);
    assertThat(workspace.read("a/b")).asString(UTF_8).isEqualTo("a/b");
  }

  @Test
  void refusesWindowsSeparatorAndDrive() throws Exception {
    // on this file system "\" and ":" are file name characters: such files exist here
    mapping("a\\b");
    mapping("c:a");
    Map<String, String> before = besideTheWorkspace();

    for (String id :
        List.of("a\\b", "..\\evil", "..\\outside\\evil", "C:", "C:/a/b", "c:a", "a/b:c")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
      assertRefused(() -> workspace.create(id, NEW), id);
    }
    for (String base : List.of("a\\", "C:", "C:\\", "..\\outside")) {
      assertRefused(() -> workspace.directory(base), base);
    }
    for (String ref :
        List.of("..\\..\\outside\\evil.xsd", "C:\\evil.xsd", "c:evil.xsd", "a:b.xsd")) {
      assertRefused(() -> workspace.checkBundle(root, List.of(ref)), ref);
    }

    assertThat(besideTheWorkspace()).isEqualTo(before);
    assertThat(workspace.read("a/b")).asString(UTF_8).isEqualTo("a/b");
  }

  @Test
  void refusesReservedLastSegment() throws Exception {
    // the action paths (ADR-0024); such files exist, and no id names them
    for (String id : List.of("test", "a/test", "a/compile", "a/refresh", "a/udfs")) {
      mapping(id);
    }
    mapping("test/a");
    mapping("a/tests");
    Map<String, String> before = besideTheWorkspace();
    Map<String, String> workspaceBefore = tree(root);

    for (String id : List.of("test", "a/test", "a/compile", "a/refresh", "a/udfs")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
      assertRefused(() -> workspace.create(id, NEW), id);
    }
    assertRefused(() -> workspace.create("a/b/test", NEW), "a/b/test");

    assertThat(tree(root)).isEqualTo(workspaceBefore);
    assertThat(besideTheWorkspace()).isEqualTo(before);
    // reserved only as the last segment, and only as the whole segment
    assertThat(workspace.read("test/a")).asString(UTF_8).isEqualTo("test/a");
    assertThat(workspace.read("a/tests")).asString(UTF_8).isEqualTo("a/tests");
  }

  @Test
  void refusesSymlinkFileDirectoryAndBundlePointingOut() throws Exception {
    Path links = Files.createDirectory(root.resolve("links"));
    Files.createSymbolicLink(
        links.resolve("out.mapping.json"), Path.of("../../outside/evil.mapping.json"));
    Files.createSymbolicLink(
        links.resolve("abs.mapping.json"), outside.resolve("evil.mapping.json"));
    Files.createSymbolicLink(links.resolve("outdir"), Path.of("../../outside"));
    Files.createSymbolicLink(links.resolve("out.xsd"), Path.of("../../outside/evil.xsd"));
    // dangling: a write that followed it would create outside/ghost.mapping.json
    Files.createSymbolicLink(
        links.resolve("ghost.mapping.json"), Path.of("../../outside/ghost.mapping.json"));
    Map<String, String> before = besideTheWorkspace();

    // a file link: the last component
    for (String id : List.of("links/out", "links/abs")) {
      assertRefused(() -> workspace.read(id), id);
      assertRefused(() -> workspace.save(id, NEW), id);
    }
    // a directory link: a component before the last, which NOFOLLOW_LINKS alone does not guard
    assertRefused(() -> workspace.read("links/outdir/evil"), "links/outdir/evil");
    assertRefused(() -> workspace.save("links/outdir/evil", NEW), "links/outdir/evil");
    assertRefused(() -> workspace.create("links/outdir/new", NEW), "links/outdir/new");
    assertRefused(() -> workspace.directory("links/outdir"), "links/outdir");
    // a bundle reference through either kind of link
    assertRefused(() -> workspace.checkBundle(root, List.of("links/out.xsd")), "links/out.xsd");
    assertRefused(
        () -> workspace.checkBundle(root, List.of("links/outdir/evil.xsd")), "outdir/evil.xsd");
    assertRefused(() -> workspace.checkBundle(links, List.of("outdir/evil.xsd")), "from links");
    // a dangling link out: whatever the refusal, never a write through it
    assertThatThrownBy(() -> workspace.save("links/ghost", NEW))
        .isInstanceOfAny(WorkspacePathException.class, NoSuchFileException.class);
    assertThatThrownBy(() -> workspace.create("links/ghost", NEW))
        .isInstanceOfAny(
            WorkspacePathException.class,
            NoSuchFileException.class,
            FileAlreadyExistsException.class);

    assertThat(besideTheWorkspace()).isEqualTo(before);
    assertThat(Files.readAllBytes(outside.resolve("evil.mapping.json"))).isEqualTo(OUTSIDE);
  }

  @Test
  void followsSymlinkInside() throws Exception {
    mapping("real/m");
    Files.write(root.resolve("real/s.xsd"), OUTSIDE);
    Files.createSymbolicLink(root.resolve("alias.mapping.json"), Path.of("real/m.mapping.json"));
    Files.createSymbolicLink(
        root.resolve("abs-alias.mapping.json"), root.resolve("real/m.mapping.json"));
    Files.createSymbolicLink(root.resolve("linked"), Path.of("real"));
    Files.createSymbolicLink(root.resolve("s-alias.xsd"), Path.of("real/s.xsd"));

    assertThat(workspace.read("alias")).asString(UTF_8).isEqualTo("real/m");
    assertThat(workspace.read("abs-alias")).asString(UTF_8).isEqualTo("real/m");
    assertThat(workspace.read("linked/m")).asString(UTF_8).isEqualTo("real/m");
    assertThat(workspace.directory("linked")).isEqualTo(root.resolve("real"));
    assertThatNoException()
        .isThrownBy(
            () ->
                workspace.checkBundle(
                    root, List.of("linked/s.xsd", "s-alias.xsd", "linked/missing.xsd")));
    assertThatNoException()
        .isThrownBy(() -> workspace.checkBundle(root.resolve("linked"), List.of("s.xsd")));

    // a save through a link writes in the real parent: the link stays, its target changes
    workspace.save("alias", NEW);
    assertThat(Files.isSymbolicLink(root.resolve("alias.mapping.json"))).isTrue();
    assertThat(Files.readAllBytes(root.resolve("real/m.mapping.json"))).isEqualTo(NEW);
    assertThat(workspace.read("linked/m")).isEqualTo(NEW);
  }

  @Test
  void patternRefusalTouchesNoFileSystem() throws Exception {
    // the root was resolved when the workspace was made; now it is gone
    deleteTree(root);
    assertThat(Files.exists(root)).isFalse();

    for (String id : List.of("../evil", "a\\b", "%2e%2e", "a/test", "/abs", ".x", "a\0")) {
      assertRefused(() -> workspace.read(id), printable(id));
      assertRefused(() -> workspace.save(id, NEW), printable(id));
      assertRefused(() -> workspace.create(id, NEW), printable(id));
    }
    for (String base : List.of("..", "/", "a\\b", "%2e")) {
      assertRefused(() -> workspace.directory(base), base);
    }
    for (String ref : List.of("/etc/passwd", "a\\b.xsd", "a/../x.xsd", "%2e%2e/x.xsd")) {
      assertRefused(() -> workspace.checkBundle(root, List.of(ref)), ref);
    }

    // the witness: a workspace path does reach the (missing) file system, so it is no refusal
    assertThatExceptionOfType(NoSuchFileException.class).isThrownBy(() -> workspace.read("a/b"));
    // and nothing was made again: not the root, not a file next to it
    try (Stream<Path> left = Files.list(tmp)) {
      assertThat(left.map(p -> p.getFileName().toString()).sorted().toList())
          .containsExactly("evil.mapping.json", "outside");
    }
  }

  @Test
  void listPrunesDotDirectoriesAndFollowsNoLink() throws Exception {
    mapping("m");
    mapping("b/c");
    mapping("b-c");
    // never mappings: a dot segment, a name the pattern refuses, a reserved last segment
    mapping(".git/x");
    mapping("b/.hidden/y");
    mapping(".dot");
    mapping("bad name");
    mapping("sp ace/z");
    mapping("d/test");
    mapping("b/%2e");
    Files.write(root.resolve("notes.txt"), OUTSIDE);
    Files.write(root.resolve("m.mapping.json.bak"), OUTSIDE);
    Files.write(outside.resolve("o.mapping.json"), OUTSIDE);
    // links: a directory link out and one inside are not walked; a file link out fails step 3;
    // a file link inside passes it
    Files.createSymbolicLink(root.resolve("outdir"), Path.of("../outside"));
    Files.createSymbolicLink(root.resolve("inlink"), Path.of("b"));
    Files.createSymbolicLink(
        root.resolve("out.mapping.json"), Path.of("../outside/evil.mapping.json"));
    Files.createSymbolicLink(root.resolve("in.mapping.json"), Path.of("b/c.mapping.json"));

    // sorted by id as text: '-' sorts before '/', so "b-c" comes before "b/c"
    assertThat(workspace.list()).containsExactly("a/b", "b-c", "b/c", "in", "m");
  }

  // --- [P] every accepted path resolves inside the workspace ---

  private static final long SEED = 0x2028_5EEDL;
  private static final int CASES = 900;

  /** ADR-0024, verbatim: the oracle the generated paths are judged by. */
  private static final Pattern ID_PATTERN =
      Pattern.compile(
          "[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}(/[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}){0,15}");

  private static final Pattern BUNDLE_PATTERN =
      Pattern.compile(
          "(\\.\\./){0,16}[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*");

  private static final Set<String> RESERVED = Set.of("test", "compile", "refresh", "udfs");

  /** The directory generated bundle references are resolved from: two levels below the root. */
  private static final String BUNDLE_DIRECTORY = "a/a";

  enum Kind {
    ID,
    BASE,
    BUNDLE
  }

  @ParameterizedTest(name = "{0}: {1}")
  @MethodSource("generatedPaths")
  void everyAcceptedPathResolvesInsideTheWorkspace(Kind kind, String path) throws Exception {
    Map<String, String> before = besideTheWorkspace();
    switch (kind) {
      case ID -> {
        if (isId(path)) {
          mapping(path);
          assertThat(workspace.read(path)).asString(UTF_8).isEqualTo(path);
        } else {
          assertRefused(() -> workspace.read(path), printable(path));
        }
      }
      case BASE -> {
        if (isBase(path)) {
          Path directory = Files.createDirectories(root.resolve(path)).toRealPath();
          assertThat(workspace.directory(path)).isEqualTo(directory);
        } else {
          assertRefused(() -> workspace.directory(path), printable(path));
        }
      }
      case BUNDLE -> {
        Path from = Files.createDirectories(root.resolve(BUNDLE_DIRECTORY));
        if (isInsideBundleRef(path)) {
          assertThatNoException().isThrownBy(() -> workspace.checkBundle(from, List.of(path)));
        } else {
          assertRefused(() -> workspace.checkBundle(from, List.of(path)), printable(path));
        }
      }
    }
    assertThat(besideTheWorkspace()).isEqualTo(before);
  }

  static Stream<Arguments> generatedPaths() {
    SplittableRandom random = new SplittableRandom(SEED);
    List<Arguments> cases = new ArrayList<>();
    int[] accepted = new int[Kind.values().length];
    int[] refused = new int[Kind.values().length];
    int escapesThePatternAllows = 0;
    for (int i = 0; i < CASES; i++) {
      Kind kind = Kind.values()[i % Kind.values().length];
      String path = generate(random);
      boolean accepts =
          switch (kind) {
            case ID -> isId(path);
            case BASE -> isBase(path);
            case BUNDLE -> isInsideBundleRef(path);
          };
      if (accepts) {
        accepted[kind.ordinal()]++;
      } else {
        refused[kind.ordinal()]++;
      }
      if (kind == Kind.BUNDLE && BUNDLE_PATTERN.matcher(path).matches() && !accepts) {
        escapesThePatternAllows++;
      }
      cases.add(
          Arguments.of(
              Named.of("seed " + Long.toHexString(SEED) + " #" + i + " " + kind, kind),
              Named.of(printable(path), path)));
    }
    for (Kind kind : Kind.values()) {
      cases.add(Arguments.of(Named.of("empty " + kind, kind), Named.of("\"\"", "")));
    }
    // the generator must reach every outcome, or the property holds vacuously
    for (Kind kind : Kind.values()) {
      if (accepted[kind.ordinal()] < 20 || refused[kind.ordinal()] < 20) {
        throw new IllegalStateException(
            "seed %x: %s accepted %d, refused %d"
                .formatted(SEED, kind, accepted[kind.ordinal()], refused[kind.ordinal()]));
      }
    }
    if (escapesThePatternAllows < 5) {
      throw new IllegalStateException(
          "seed %x: only %d bundle references climb above the root"
              .formatted(SEED, escapesThePatternAllows));
    }
    return cases.stream();
  }

  /**
   * Segments over {@code a . \ % : NUL}, joined by {@code /}: half of them after a run of one to
   * four {@code ..}, so bundle references climb above the root; sometimes absolute or with "//".
   */
  private static String generate(SplittableRandom random) {
    List<String> segments = new ArrayList<>();
    if (random.nextBoolean()) {
      for (int up = 1 + random.nextInt(4); up > 0; up--) {
        segments.add("..");
      }
    }
    for (int names = 1 + random.nextInt(4); names > 0; names--) {
      segments.add(segment(random));
    }
    StringBuilder path = new StringBuilder(random.nextInt(12) == 0 ? "/" : "");
    for (int s = 0; s < segments.size(); s++) {
      if (s > 0) {
        path.append(random.nextInt(20) == 0 ? "//" : "/");
      }
      path.append(segments.get(s));
    }
    return path.toString();
  }

  private static String segment(SplittableRandom random) {
    char[] alphabet = {'a', '.', '\\', '%', ':', '\0'};
    int pick = random.nextInt(10);
    if (pick < 4) {
      return "a";
    } else if (pick < 5) {
      return "..";
    } else if (pick < 6) {
      return ".";
    }
    StringBuilder segment = new StringBuilder();
    for (int length = 1 + random.nextInt(3); length > 0; length--) {
      // 'a' twice as often, so mixed segments are often names
      int index = random.nextInt(alphabet.length + 1);
      segment.append(index >= alphabet.length ? 'a' : alphabet[index]);
    }
    return segment.toString();
  }

  private static boolean isId(String path) {
    return ID_PATTERN.matcher(path).matches()
        && !RESERVED.contains(path.substring(path.lastIndexOf('/') + 1));
  }

  private static boolean isBase(String path) {
    return path.isEmpty() || ID_PATTERN.matcher(path).matches();
  }

  /** The pattern, then the normalised path from {@link #BUNDLE_DIRECTORY} stays under the root. */
  private static boolean isInsideBundleRef(String path) {
    if (!BUNDLE_PATTERN.matcher(path).matches()) {
      return false;
    }
    Path root = Path.of("/ws");
    return root.resolve(BUNDLE_DIRECTORY).resolve(path).normalize().startsWith(root);
  }

  // --- helpers ---

  /** Writes the mapping file of {@code id}, whose content is the id. */
  private void mapping(String id) throws IOException {
    Path file = root.resolve(id + ".mapping.json");
    Files.createDirectories(file.getParent());
    Files.write(file, id.getBytes(UTF_8));
  }

  private static void assertRefused(ThrowingCallable call, String path) {
    assertThatExceptionOfType(WorkspacePathException.class).as(path).isThrownBy(call);
  }

  private static String printable(String path) {
    return path.replace("\0", "<NUL>");
  }

  /** Every entry of {@code tmp} outside the workspace, with each regular file's bytes. */
  private Map<String, String> besideTheWorkspace() throws IOException {
    Map<String, String> entries = new TreeMap<>();
    for (Map.Entry<String, String> e : tree(tmp).entrySet()) {
      if (!tmp.resolve(e.getKey()).startsWith(tmp.resolve("ws"))) {
        entries.put(e.getKey(), e.getValue());
      }
    }
    return entries;
  }

  /** Every entry under {@code directory}, links not followed, with each regular file's bytes. */
  private static Map<String, String> tree(Path directory) throws IOException {
    Map<String, String> entries = new TreeMap<>();
    try (Stream<Path> walk = Files.walk(directory)) {
      walk.forEach(
          p -> {
            String content;
            try {
              content =
                  Files.isSymbolicLink(p)
                      ? "link " + Files.readSymbolicLink(p)
                      : Files.isDirectory(p)
                          ? "directory"
                          : HexFormat.of().formatHex(Files.readAllBytes(p));
            } catch (IOException e) {
              throw new UncheckedIOException(e);
            }
            entries.put(directory.relativize(p).toString(), content);
          });
    }
    return entries;
  }

  private static void deleteTree(Path directory) throws IOException {
    try (Stream<Path> walk = Files.walk(directory)) {
      for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
        Files.delete(p);
      }
    }
  }
}
