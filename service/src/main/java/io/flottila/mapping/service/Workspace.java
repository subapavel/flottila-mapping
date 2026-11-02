package io.flottila.mapping.service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

// stub for red (#28)
/**
 * The workspace: the only class that resolves paths (ADR-0024). Ids, base directories and bundle
 * references pass the pattern, the normalised prefix and the real-path prefix, in that order.
 */
public class Workspace {

  /**
   * A workspace over {@code directory}; its real path, resolved once here, is the root.
   *
   * @param directory the configured {@code flottila.mapping.workspace}
   */
  public Workspace(Path directory) {}

  /** The ids of the workspace's mappings, sorted by id. */
  public List<String> list() throws IOException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }

  /** The bytes of the mapping file of {@code id}. */
  public byte[] read(String id) throws IOException, WorkspacePathException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }

  /** Replaces the mapping file of {@code id} atomically. */
  public void save(String id, byte[] canonical) throws IOException, WorkspacePathException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }

  /** Writes the mapping file of a new {@code id}; never replaces one. */
  public void create(String id, byte[] canonical) throws IOException, WorkspacePathException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }

  /** The real path of the directory {@code base} names; {@code ""} is the root. */
  public Path directory(String base) throws IOException, WorkspacePathException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }

  /**
   * Refuses a bundle reference that leaves the workspace from {@code directory}. A file inside the
   * workspace that is missing passes: the engine reports it.
   */
  public void checkBundle(Path directory, List<String> bundle)
      throws IOException, WorkspacePathException {
    throw new UnsupportedOperationException("stub for red (#28)");
  }
}
