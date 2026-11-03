package io.flottila.mapping.service;

import static io.flottila.mapping.service.ProblemMappers.PROBLEM_JSON;
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
import io.flottila.mapping.api.TestRunResult;
import io.flottila.mapping.api.Trace;
import io.flottila.mapping.ir.AuthoringId;
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
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.headers.Header;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;

/**
 * {@code /api/mappings} (ADR-0014, ADR-0015, ADR-0024): list, create, open and save the mappings of
 * the workspace, and test-run a working copy. A saved model's bytes never pass through Jackson:
 * {@code save} reads the body as bytes, so the engine's strict reader sees them as sent, and every
 * answer is the engine's canonical form. A test run's working copy is a member of a JSON request
 * body: Jackson parses it into a tree, and {@code test} writes that tree back to bytes with {@code
 * writeValueAsBytes}, so the engine reads Jackson's serialisation, not the bytes as sent.
 */
@jakarta.ws.rs.Path("/api/mappings")
public class MappingsResource {

  /** The mapping model's schema, next to {@code openapi.json} in {@code contract/}. */
  static final String MODEL = "./mapping-model.schema.json";

  static final String ROOT_SELECTOR = MODEL + "#/$defs/rootSelector";

  private static final String ID = "{id: .+}";

  private static final String ETAG = "\"sha256:<hex>\" of the canonical bytes (ADR-0024)";

  private final Workspace workspace;
  private final ObjectMapper json;
  private final EngineFacade facade = new EngineFacade();

  /** {@code flottila.mapping.test-timeout}: how long a test run may take (ADR-0014). */
  private final Duration timeout;

  /** {@code flottila.mapping.trace-limit}: the most one trace entry keeps (ADR-0015, "Trace"). */
  private final int traceLimit;

  @Inject
  MappingsResource(Workspace workspace, ObjectMapper json, Config config) {
    this.workspace = workspace;
    this.json = json;
    this.timeout = config.getValue("flottila.mapping.test-timeout", Duration.class);
    this.traceLimit = ServiceConfig.traceLimit(config);
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
      headers = {
        @Header(
            name = "ETag",
            description = ETAG,
            required = true,
            schema = @Schema(type = SchemaType.STRING)),
        @Header(
            name = "Location",
            description = "The new mapping's URI",
            required = true,
            schema = @Schema(type = SchemaType.STRING))
      },
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  @APIResponse(
      responseCode = "400",
      description = "invalid-workspace-path, malformed-json or invalid-request",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "404",
      description = "not-found: the mapping's directory",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "409",
      description = "mapping-exists",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "415",
      description = "unsupported-media-type",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "422",
      description = "model-refused: a structure cannot be loaded",
      content =
          @Content(
              mediaType = PROBLEM_JSON,
              schema = @Schema(implementation = RefusedProblem.class)))
  public Response create(CreateMappingRequest request)
      throws IOException,
          WorkspacePathException,
          InvalidRequestException,
          MalformedJsonException,
          ModelRefusedException,
          NoSuchAlgorithmException {
    InvalidRequestException.present(request);
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
        canonical(facade.save(facade.newMapping(source.orElseThrow(), target.orElseThrow())));
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
      headers =
          @Header(
              name = "ETag",
              description = ETAG,
              required = true,
              schema = @Schema(type = SchemaType.STRING)),
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  @APIResponse(
      responseCode = "400",
      description = "invalid-workspace-path",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "404",
      description = "not-found: no mapping of this id",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "422",
      description = "model-refused: the stored file is no JSON document or no valid model",
      content =
          @Content(
              mediaType = PROBLEM_JSON,
              schema = @Schema(implementation = RefusedProblem.class)))
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
   * Save (ADR-0015): stages 1 and 2 only, so a stage 3 error still saves. The id and its mapping
   * model file are checked before the body is read. {@code If-Match} is not enforced until spec 6.
   */
  @PUT
  @jakarta.ws.rs.Path(ID)
  @Consumes(APPLICATION_JSON)
  @Produces(APPLICATION_JSON)
  @APIResponse(
      responseCode = "200",
      description = "The saved mapping in canonical form, with its new ETag",
      headers =
          @Header(
              name = "ETag",
              description = ETAG,
              required = true,
              schema = @Schema(type = SchemaType.STRING)),
      content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
  @APIResponse(
      responseCode = "400",
      description = "invalid-workspace-path or malformed-json",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "404",
      description = "not-found: no mapping of this id",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "415",
      description = "unsupported-media-type",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "422",
      description = "model-refused: validation stage 1 or 2 refuses the model",
      content =
          @Content(
              mediaType = PROBLEM_JSON,
              schema = @Schema(implementation = RefusedProblem.class)))
  public Response save(
      @PathParam("id") String id,
      @RequestBody(content = @Content(mediaType = APPLICATION_JSON, schema = @Schema(ref = MODEL)))
          InputStream body)
      throws IOException,
          WorkspacePathException,
          MalformedJsonException,
          ModelRefusedException,
          NoSuchAlgorithmException {
    workspace.existing(id);
    byte[] canonical = canonical(body.readAllBytes());
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
  @APIResponse(
      responseCode = "200",
      description =
          "The output, the diagnostics that refuse the working copy, or the runtime error",
      content =
          @Content(
              mediaType = APPLICATION_JSON,
              schema = @Schema(implementation = TestResult.class)))
  @APIResponse(
      responseCode = "400",
      description = "invalid-workspace-path, malformed-json, invalid-request or malformed-input",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "404",
      description = "not-found: the mapping's directory",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  @APIResponse(
      responseCode = "415",
      description = "unsupported-media-type",
      content =
          @Content(mediaType = PROBLEM_JSON, schema = @Schema(implementation = Problem.class)))
  public TestResult test(@PathParam("id") String id, TestRequest request)
      throws IOException,
          WorkspacePathException,
          InvalidRequestException,
          MalformedJsonException,
          MalformedInputException,
          JsonProcessingException {
    InvalidRequestException.present(request);
    Path directory = workspace.mappingDirectory(id);
    byte[] model = json.writeValueAsBytes(request.model());
    return switch (facade.load(model)) {
      case Refused(List<Diagnostic> diagnostics) -> new TestRefused(DiagnosticDto.all(diagnostics));
      case Loaded(MappingModel loaded) -> run(directory, model, loaded, request.input());
    };
  }

  /**
   * Checks the working copy's bundle references, then compiles it and runs it for at most the
   * test-run timeout, with the engine's trace capped at the trace limit.
   */
  private TestResult run(Path directory, byte[] model, MappingModel loaded, String input)
      throws IOException, WorkspacePathException, MalformedJsonException, MalformedInputException {
    workspace.checkBundle(directory, loaded.source().bundle().files());
    workspace.checkBundle(directory, loaded.target().bundle().files());
    return switch (facade.compile(model, directory, CompileOptions.TEST_RUN)) {
      case CompileResult.Refused(List<Diagnostic> diagnostics) ->
          new TestRefused(DiagnosticDto.all(diagnostics));
      case CompileResult.Compiled(CompiledMapping compiled) ->
          switch (facade.testRun(compiled, input.getBytes(UTF_8), timeout, traceLimit)) {
            case TestRunResult.Output(byte[] output, Trace trace) ->
                new TestOutput(new String(output, UTF_8), List.of(), TraceEntryDto.all(trace));
            case TestRunResult.RuntimeError(
                    String code,
                    String message,
                    Optional<AuthoringId> authoringId,
                    Trace trace) ->
                new TestError(
                    new RuntimeErrorDto(code, message, authoringId.map(AuthoringId::value)),
                    List.of(),
                    TraceEntryDto.all(trace));
          };
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
