package io.flottila.mapping.service;

import io.quarkus.runtime.Startup;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.CopyOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.eclipse.microprofile.config.Config;

/**
 * The workspace: the only class that resolves paths (ADR-0024). Ids, base directories and bundle
 * references pass the pattern, the normalised prefix and the real-path prefix, in that order.
 */
@ApplicationScoped
@Startup
public class Workspace {

  private static final String SEGMENT = "[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}";

  /** A mapping id (ADR-0024); its last segment must not be reserved as well. */
  private static final Pattern ID = Pattern.compile(SEGMENT + "(/" + SEGMENT + "){0,15}");

  /** A base directory: an id, or {@code ""} for the root. */
  private static final Pattern BASE = Pattern.compile("(" + ID.pattern() + ")?");

  private static final Pattern BUNDLE =
      Pattern.compile(
          "(\\.\\./){0,16}[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*");

  /** Last segments of the action paths, so routing never depends on the router. */
  private static final Set<String> RESERVED = Set.of("test", "compile", "refresh", "udfs");

  private static final String SUFFIX = ".mapping.json";

  /**
   * Writes of one file are serialised by its stripe, so two creates of one id cannot both pass the
   * move's existence check; the number of stripes is fixed.
   */
  private static final int STRIPES = 64;

  private final Path root;
  private final Object[] locks = new Object[STRIPES];

  /**
   * The workspace of {@code flottila.mapping.workspace}, made at startup. The property has no
   * default, so a service without one does not start.
   *
   * @param config the service's configuration
   * @throws IOException if the directory does not exist
   */
  @Inject
  Workspace(Config config) throws IOException {
    this(config.getValue("flottila.mapping.workspace", Path.class));
  }

  /**
   * A workspace over {@code directory}; its real path, resolved once here, is the root.
   *
   * @param directory the configured {@code flottila.mapping.workspace}
   * @throws IOException if the directory does not exist
   */
  public Workspace(Path directory) throws IOException {
    root = directory.toRealPath();
    for (int i = 0; i < STRIPES; i++) {
      locks[i] = new Object();
    }
  }

  /**
   * The ids of the workspace's mapping model files, sorted by id. The walk follows no link, prunes
   * every directory whose path is no base, and skips a file or directory it cannot read. It keeps a
   * file only if its id passes the pattern and its real path lies inside the workspace, so a
   * dangling link is skipped too.
   */
  public List<String> list() throws IOException {
    List<String> ids = new ArrayList<>();
    Files.walkFileTree(
        root,
        new SimpleFileVisitor<>() {
          @Override
          public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
            return BASE.matcher(root.relativize(dir).toString()).matches()
                ? FileVisitResult.CONTINUE
                : FileVisitResult.SKIP_SUBTREE;
          }

          @Override
          public FileVisitResult visitFileFailed(Path file, IOException unreadable) {
            return FileVisitResult.CONTINUE;
          }

          @Override
          public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
              throws IOException {
            String relative = root.relativize(file).toString();
            if (relative.endsWith(SUFFIX)) {
              String id = relative.substring(0, relative.length() - SUFFIX.length());
              if (isId(id) && insideByRealPath(file)) {
                ids.add(id);
              }
            }
            return FileVisitResult.CONTINUE;
          }
        });
    ids.sort(null);
    return ids;
  }

  /** The bytes of the mapping model file of {@code id}. */
  public byte[] read(String id) throws IOException, WorkspacePathException {
    Path file = existing(id);
    try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
      return in.readAllBytes();
    }
  }

  /**
   * Steps 1 to 3 for the mapping model file of {@code id}, which must exist. The PUT endpoint
   * checks its id with it before it reads the body.
   *
   * @return the file's real path
   * @throws NoSuchFileException if there is no mapping model file of {@code id}
   */
  public Path existing(String id) throws IOException, WorkspacePathException {
    return real(mappingModelFile(id));
  }

  /**
   * Replaces the mapping model file of {@code id} atomically. Through a link it writes the link's
   * target and keeps the link.
   */
  public void save(String id, byte[] canonical) throws IOException, WorkspacePathException {
    write(
        existing(id),
        canonical,
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING);
  }

  /** Writes the mapping model file of a new {@code id}; never replaces one. */
  public void create(String id, byte[] canonical) throws IOException, WorkspacePathException {
    Path file = mappingModelFile(id);
    write(real(file.getParent()).resolve(file.getFileName()), canonical);
  }

  /**
   * The real path of the directory that holds, or would hold, the mapping model file of {@code id}:
   * the directory its bundle references are relative to.
   */
  public Path mappingDirectory(String id) throws IOException, WorkspacePathException {
    return real(mappingModelFile(id).getParent());
  }

  /** The real path of the directory {@code base} names; {@code ""} is the root. */
  public Path directory(String base) throws IOException, WorkspacePathException {
    return real(inside(root, matching(base, BASE)));
  }

  /**
   * Refuses a bundle reference that leaves the workspace from {@code directory}. A file inside the
   * workspace that is missing passes: the engine reports it. Its nearest existing ancestor must lie
   * inside the workspace by its real path. A dangling link has no real path, and its target might
   * appear outside later, so a reference to or through one is refused (ADR-0024).
   *
   * @param directory a real directory of the workspace, as {@link #directory} or {@link
   *     #mappingDirectory} return it
   */
  public void checkBundle(Path directory, List<String> bundle)
      throws IOException, WorkspacePathException {
    for (String reference : bundle) {
      Path existing = inside(directory, matching(reference, BUNDLE));
      while (Files.notExists(existing, LinkOption.NOFOLLOW_LINKS)) {
        existing = existing.getParent();
      }
      try {
        real(existing);
      } catch (NoSuchFileException danglingLink) {
        throw new WorkspacePathException(reference);
      }
    }
  }

  private static boolean isId(String id) {
    return ID.matcher(id).matches() && !RESERVED.contains(id.substring(id.lastIndexOf('/') + 1));
  }

  /** Steps 1 and 2 for an id: the path of its mapping model file, not yet resolved on disk. */
  private Path mappingModelFile(String id) throws WorkspacePathException {
    if (!isId(id)) {
      throw new WorkspacePathException(id);
    }
    return inside(root, id + SUFFIX);
  }

  /** Step 1: the pattern, on the decoded text, before any file system call. */
  private static String matching(String path, Pattern pattern) throws WorkspacePathException {
    if (!pattern.matcher(path).matches()) {
      throw new WorkspacePathException(path);
    }
    return path;
  }

  /** Step 2: the normalised path from {@code from} lies under the root. */
  private Path inside(Path from, String relative) throws WorkspacePathException {
    Path path = from.resolve(relative).normalize();
    if (!path.startsWith(root)) {
      throw new WorkspacePathException(relative);
    }
    return path;
  }

  /** Step 3: the real path of an existing file or directory lies under the root. */
  private Path real(Path path) throws IOException, WorkspacePathException {
    Path real = path.toRealPath();
    if (!real.startsWith(root)) {
      throw new WorkspacePathException(root.relativize(path).toString());
    }
    return real;
  }

  private boolean insideByRealPath(Path file) throws IOException {
    try {
      return file.toRealPath().startsWith(root);
    } catch (NoSuchFileException danglingLink) {
      return false;
    }
  }

  /**
   * Writes a new temporary file with a unique name in the real parent of {@code target}, then moves
   * it onto {@code target} with {@code options}, under the target's lock. No file that existed
   * before the call is opened, so a {@code .<name>.tmp} left beside the target stays as it is. The
   * temporary file never outlives the call.
   */
  private void write(Path target, byte[] bytes, CopyOption... options) throws IOException {
    synchronized (locks[Math.floorMod(target.hashCode(), STRIPES)]) {
      Path temp =
          Files.createTempFile(target.getParent(), "." + target.getFileName() + ".", ".tmp");
      try {
        Files.write(temp, bytes, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
        Files.move(temp, target, options);
      } finally {
        Files.deleteIfExists(temp);
      }
    }
  }
}
