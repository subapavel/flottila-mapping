package io.flottila.mapping.service;

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;
import static java.nio.charset.StandardCharsets.UTF_8;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.flottila.mapping.api.CompileOptions;
import io.flottila.mapping.api.CompileResult;
import io.flottila.mapping.api.CompiledMapping;
import io.flottila.mapping.api.EngineFacade;
import io.flottila.mapping.api.StructureResult;
import io.flottila.mapping.api.Structures;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.Loaded;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.Refused;
import io.flottila.mapping.mapping.StructureRef;
import io.flottila.mapping.runtime.MalformedInputException;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;

/**
 * {@code /api/mappings} (ADR-0014, ADR-0015, ADR-0024): list, create, open and save the mappings of
 * the workspace, and test-run a working copy. Model bytes never pass through Jackson, so the
 * engine's strict reader sees them as sent and every answer is the engine's canonical form.
 */
@jakarta.ws.rs.Path("/api/mappings")
public class MappingsResource {

  /** The mapping model's schema, next to {@code openapi.json} in {@code contract/}. */
  static final String MODEL = "./mapping-model.schema.json";

  static final String ROOT_SELECTOR = MODEL + "#/$defs/rootSelector";

  private static final String ID = "{id: .+}";

  private final Workspace workspace;
  private final ObjectMapper json;
  private final EngineFacade facade = new EngineFacade();

  @Inject
  MappingsResource(Workspace workspace, ObjectMapper json) {
    this.workspace = workspace;
    this.json = json;
  }

  /** The workspace's mappings, sorted by id. */
  @GET
  @Produces(APPLICATION_JSON)
  public List<MappingSummary> list() throws IOException {
    return workspace.list().stream().map(MappingSummary::of).toList();
  }

  /**
   * A new mapping with both structures' fingerprints and no target field mapping. Its directory
   * must exist; an existing id is 409.
   */
  @POST
  @Consumes(APPLICATION_JSON)
  @Produces(APPLICATION_JSON)
  @APIResponse(
      responseCode = "201",
      description = "The new mapping in canonical form, with its ETag and Location",
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  public Response create(CreateMappingRequest request)
      throws IOException,
          WorkspacePathException,
          InvalidRequestException,
          MalformedJsonException,
          ModelRefusedException,
          NoSuchAlgorithmException {
    Path directory = workspace.mappingDirectory(request.id());
    workspace.checkBundle(directory, request.source().bundle());
    workspace.checkBundle(directory, request.target().bundle());
    List<Diagnostic> refusals = new ArrayList<>();
    Optional<StructureRef> source = structure(directory, request.source(), refusals);
    Optional<StructureRef> target = structure(directory, request.target(), refusals);
    if (!refusals.isEmpty()) {
      throw new ModelRefusedException(
          "a structure of the new mapping cannot be loaded", DiagnosticDto.all(refusals));
    }
    byte[] canonical =
        canonical(
            facade.save(
                new MappingModel(
                    1, source.orElseThrow(), target.orElseThrow(), Map.of(), Map.of())));
    workspace.create(request.id(), canonical);
    return model(Response.created(URI.create("/api/mappings/" + request.id())), canonical);
  }

  /** The stored mapping in canonical form, with its ETag. */
  @GET
  @jakarta.ws.rs.Path(ID)
  @Produces(APPLICATION_JSON)
  @APIResponse(
      responseCode = "200",
      description = "The mapping in canonical form, with its ETag",
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  public Response get(@PathParam("id") String id)
      throws IOException, WorkspacePathException, ModelRefusedException, NoSuchAlgorithmException {
    byte[] stored = workspace.read(id);
    try {
      return model(Response.ok(), canonical(stored));
    } catch (MalformedJsonException e) {
      // a stored file that is no JSON document is refused like a model, with no diagnostics
      throw new ModelRefusedException(e.getMessage(), List.of());
    }
  }

  /**
   * Save (ADR-0015): stages 1 and 2 only, so a stage 3 error still saves. {@code If-Match} is not
   * enforced until spec 6.
   */
  @PUT
  @jakarta.ws.rs.Path(ID)
  @Consumes(APPLICATION_JSON)
  @Produces(APPLICATION_JSON)
  @APIResponse(
      responseCode = "200",
      description = "The saved mapping in canonical form, with its new ETag",
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  public Response save(
      @PathParam("id") String id,
      @RequestBody(content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
          byte[] model)
      throws IOException,
          WorkspacePathException,
          MalformedJsonException,
          ModelRefusedException,
          NoSuchAlgorithmException {
    byte[] canonical = canonical(model);
    workspace.save(id, canonical);
    return model(Response.ok(), canonical);
  }

  /**
   * A test run of the working copy in the body, never the stored file (ADR-0015). The id only
   * locates the directory its bundle references are relative to.
   */
  @POST
  @jakarta.ws.rs.Path(ID + "/test")
  @Consumes(APPLICATION_JSON)
  @Produces(APPLICATION_JSON)
  public TestResult test(@PathParam("id") String id, TestRequest request)
      throws IOException,
          WorkspacePathException,
          MalformedJsonException,
          MalformedInputException,
          JsonProcessingException {
    Path directory = workspace.mappingDirectory(id);
    byte[] model = json.writeValueAsBytes(request.model());
    return switch (facade.load(model)) {
      case Refused(List<Diagnostic> diagnostics) -> new TestRefused(DiagnosticDto.all(diagnostics));
      case Loaded(MappingModel loaded) -> run(directory, model, loaded, request.input());
    };
  }

  /** Checks the working copy's bundle references, then compiles and runs it. */
  private TestResult run(Path directory, byte[] model, MappingModel loaded, String input)
      throws IOException, WorkspacePathException, MalformedJsonException, MalformedInputException {
    workspace.checkBundle(directory, loaded.source().bundle().files());
    workspace.checkBundle(directory, loaded.target().bundle().files());
    return switch (facade.compile(model, directory, CompileOptions.TEST_RUN)) {
      case CompileResult.Refused(List<Diagnostic> diagnostics) ->
          new TestRefused(DiagnosticDto.all(diagnostics));
      case CompileResult.Compiled(CompiledMapping compiled) ->
          new TestOutput(new String(facade.run(compiled, input.getBytes(UTF_8)), UTF_8), List.of());
    };
  }

  /**
   * The structure {@code choice} names, or empty once its load error is added to {@code refusals}.
   */
  private static Optional<StructureRef> structure(
      Path directory, StructureChoice choice, List<Diagnostic> refusals)
      throws InvalidRequestException {
    SchemaBundle bundle = new SchemaBundle(choice.bundle());
    RootSelector root = RootSelectorJson.read(choice.root());
    return switch (Structures.load(directory, bundle, root)) {
      case StructureResult.Loaded(Structure structure) ->
          Optional.of(new StructureRef(bundle, root, structure.fingerprint()));
      case StructureResult.Refused(Diagnostic diagnostic) -> {
        refusals.add(diagnostic);
        yield Optional.empty();
      }
    };
  }

  /** The canonical form of a model that passes stages 1 and 2 (ADR-0010, ADR-0011). */
  private byte[] canonical(byte[] model) throws MalformedJsonException, ModelRefusedException {
    return switch (facade.load(model)) {
      case Loaded(MappingModel loaded) -> facade.save(loaded);
      case Refused(List<Diagnostic> diagnostics) ->
          throw new ModelRefusedException(
              "the mapping model is refused by validation stage 1 or 2",
              DiagnosticDto.all(diagnostics));
    };
  }

  /** A model answer: the canonical bytes and their ETag (ADR-0024). */
  private static Response model(Response.ResponseBuilder response, byte[] canonical)
      throws NoSuchAlgorithmException {
    String sha256 =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical));
    return response
        .type(APPLICATION_JSON)
        .header("ETag", "\"sha256:" + sha256 + "\"")
        .entity(canonical)
        .build();
  }
}
