package io.flottila.mapping.service;

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;

import io.flottila.mapping.api.StructureResult;
import io.flottila.mapping.api.Structures;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

/**
 * {@code POST /api/structures} (ADR-0015, ADR-0024): a structure's graph and fingerprint, or its
 * load error as a 200 {@code refused}.
 */
@jakarta.ws.rs.Path("/api/structures")
public class StructuresResource {

  private final Workspace workspace;

  @Inject
  StructuresResource(Workspace workspace) {
    this.workspace = workspace;
  }

  @POST
  @Consumes(APPLICATION_JSON)
  @Produces(APPLICATION_JSON)
  public StructureResponse load(StructureRequest request)
      throws IOException, WorkspacePathException, InvalidRequestException {
    Path base = workspace.directory(request.base());
    workspace.checkBundle(base, request.bundle());
    SchemaBundle bundle = new SchemaBundle(request.bundle());
    return switch (Structures.load(base, bundle, RootSelectorJson.read(request.root()))) {
      case StructureResult.Loaded(Structure structure) -> StructureLoaded.of(structure);
      case StructureResult.Refused(Diagnostic diagnostic) ->
          new StructureRefused(List.of(DiagnosticDto.of(diagnostic)));
    };
  }
}
