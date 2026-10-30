# The service is a Quarkus application over a JPMS engine, and it keeps mappings as files in a workspace

Status: accepted (2026-10-30, grilling #12)

FOUNDING §11 sketches JPMS modules for everything, "the service" included. The owner wants the
service in Quarkus, the same as Flottila's future backend. Quarkus builds and runs an
application on the class path. So the engine stays JPMS and the service does not.

## Modules

- The **engine** modules (`xdm`, IR, runtime, the mapping front end, `structure`,
  `structure-import`, the exporter and the later XSLT modules) have a `module-info` and are
  tested on the module path.
- The engine knows nothing of Quarkus, Jakarta or Jackson. Its records carry no annotations.
  The service alone maps between engine types and the wire.
- The **service** is a Quarkus 3.40 (LTS) application with no `module-info`. It uses the engine
  jars on the class path and `quarkus-rest` (Jakarta REST) with Jackson. It uses no Vert.x API
  directly. Alignment with Flottila is at the Quarkus level. Quarkus 3.40 ships Vert.x 4.5,
  not Vert.x 5.
- On the class path JPMS does not enforce `exports`, so ArchUnit does:
  - the service uses only the engine's exported packages;
  - no engine module depends on the service, `io.quarkus`, `jakarta` or `com.fasterxml`.
  #13 writes these rules.
- This refines FOUNDING §11. "The service" is not a JPMS module.

## Workspace and persistence

- The service runs over one **workspace**: a directory, typically a git working tree, set by
  `flottila.mapping.workspace`. The dev profile points at `corpus/`.
- Every `**/*.mapping.json` under the workspace is a mapping. Listing walks the directory.
  There is no database and no index.
- A mapping's **id** is its path relative to the workspace without `.mapping.json`, for example
  `orders/order-to-invoice`. Its **name** is the last segment. Neither is written into the
  file, so ADR-0010's format does not change. In milestone 1, renaming or moving a mapping
  means moving the file outside the editor.
- **Save** writes canonical form atomically (a temp file, then a rename). It never commits.
  Git is the author's business, or the host's.
- The ETag of a mapping is the SHA-256 of its canonical bytes. Save requires `If-Match`. If
  the file changed on disk (a `git pull`, another editor), Save answers 409 and the editor
  offers a reload.
- Saves are serialised per id inside the process. One service instance per workspace is
  supported.
- Schemas reach the workspace through git or the file system. The API has no upload.

## References

- The engine resolves references through a port, `ReferenceResolver`. It turns a mapping file
  and a reference into bytes and a name for messages.
- The service's resolver accepts only paths relative to the mapping file that stay inside the
  workspace. A path that leaves it (`../../etc/passwd`) is an error, never a read. This is a
  security boundary and has a mandatory test.
- In milestone 1 a shared-package reference (`package@version:/path`) is a design-time error,
  "package references need a host resolver". Flottila supplies its resolver later. The engine
  does not change.

## Running

- The service binds to `127.0.0.1` by default. Another address can be configured, and the
  service logs a warning, because milestone 1 has no authentication. The service serves no
  CORS headers.
- Compile and test run on worker threads, never on the event loop.
- A test run has a timeout, 10 s by default. On timeout it gives the runtime error
  `flottila:TIMEOUT` with the trace so far. The engine checks for interruption in its loops
  over slots, so cancelling is cooperative. A runaway UDF is #16's concern.
- Out of milestone 1: authentication, multi-user editing, several workspaces, and an
  embedding API for Flottila.

## Considered options

- **Vert.x 5 or a minimal JDK HTTP server** (the ticket's first framing): replaced by the
  owner's choice of Quarkus.
- **The whole product on the module path**, the service included: rejected. Quarkus builds a
  class-path application, and its modularity support is experimental (jlink).
- **Jackson annotations on engine records**: rejected. They tie the engine to one wire library
  and to Flottila's stack.
- **A database**: rejected for milestone 1. ADR-0010 makes a mapping a file in git, and a
  second store would drift from it.
- **Save as a git commit**: rejected. Commits belong to the author and the host. ADR-0013
  already rejects autosave.
- **An id or a name inside the file**: rejected. It duplicates the path and goes stale on a
  move.
- **Resolving package references from a local directory in milestone 1**: rejected. It would
  invent a package layout before Flottila defines one.

## Consequences

- Observed on 2026-10-30, in a scratch directory, not committed:
  - Quarkus 3.40.1.1 on Java 25 starts a test app in 4.1 s, the packaged app in 0.9 s
    (RSS 126 MB) and dev mode in about 26 s (app RSS about 454 MB);
  - an engine jar with `module-info` on the class path gives no warning;
  - json-sKema 0.32.0 runs in test and dev mode with the BOM's kotlin-stdlib 2.4.10. On the
    module path it still needs `--add-modules kotlin.stdlib` (ADR-0008).
- The Quarkus dependency tree adds MIT-0 (`reactive-streams`) and EDL 1.0 (`jakarta.activation`,
  `jakarta.xml.bind`; the text is BSD-3-Clause). The owner added both to the licence list in
  `CLAUDE.md`. Dual licences (EPL-2.0 OR GPL-2.0 with CPE, EPL-1.0 OR Apache-2.0) are taken
  under their allowed alternative.
- Maven Central answered HTTP 429 to the VM. The Google mirror of Central
  (`maven-central.storage-download.googleapis.com/maven2`) served every artefact. #13
  decides whether the build uses it.
