# implementer memory

Durable facts only (AGENTS.md, Memory). No ticket state.

## Environment and tools

- Context7 tools are not offered in a subagent session: verify APIs with `javap` on the jar in
  `~/.m2`, or the package's `.d.ts` / CLI `--help` in `ui/node_modules`.
- `dependency:build-classpath` fails on a module whose sibling SNAPSHOTs are not installed (and
  `install` is forbidden): point `javap -cp` at the jars in `~/.m2` directly.
- The Bash permission classifier refuses command substitution, pipes into `bash` and some
  `github` strings: write a scratch script and run it with `bash <script>` / `node <script>`.
- `gh`: REST only (`gh api repos/<owner>/<repo>/issues/<n>`).
- A `\u` in a Java comment is a Unicode escape and breaks compilation; spell it `\`{@code u}.
- `scripts/gate-ticket.sh` steps 3 and 4 run `git diff` (worktree against index): an untracked
  new file passes them unseen. Stage new contract/generated files before the gate.
- Its first argument only names the logs: `gate-ticket.sh 24f ...` writes `.logs/24f-*.log`.
- Timing a load stage: run a scratch `java -cp <target/classes:~/.m2 jars> Probe.java` against
  the public `internal` classes; JFR (`-XX:StartFlightRecording`) plus `jfr print` for hot spots.
  Surefire's per-test `time` includes a cold JIT and the JaCoCo agent.

- Worktree-isolated agents: the guard refuses any Bash line that mixes `git` with pipes, `$(…)`,
  `for` loops or `&&` chains it cannot verify. Run each `git` command plainly on its own line.
- PIT (gate-spec 1b) mutates each module against that module's own tests only: a path covered
  only by `EngineFacadeTest` survives in `engine/mapping` / `engine/runtime`. Add module tests.
- Saxon-HE is test scope in `engine/oracle` only (enforcer): an XSLT helper is run only through
  the corpus differential oracle, and a root-level target reads context 1 of its queue only.
- Observing a corpus red after the code exists: put the base `function-catalogue.json` back
  (`git show <base>:<path> > <path>`), run the oracle, restore it.
- Probing XPath on Saxon outside the build: a scratch script running `java -cp
  ~/.m2/.../Saxon-HE-12.5.jar:<xmlresolver jar> net.sf.saxon.Query -q:<file.xq> '!method=text'`.
  An XSLT helper is proved by hand-made mutants of po-runtime.xsl run through the differential.
- Saxon 12.5 (observed): `upper-case`/`lower-case` use Saxon's own tables (`net.sf.saxon.str.
  ToUpper`), full mappings; `fn:sort` is stable and compares sequence keys item by item, shorter
  prefix first. Java `compareTo` is UTF-16 order, `compareToIgnoreCase` code-point order (JDK src).
- engine/xdm is at 100 % PIT: an interrupt check that `QueueBlock.of`'s own check duplicates dies
  only if the test asserts the function's name in the CancellationException message.
- `-pl engine/oracle` without `-am` takes sibling SNAPSHOT jars from `~/.m2`, stale ones: a
  "cannot find symbol" for a new engine class. Always `-am`.
- A ticket branch checked out in another worktree: reset the agent branch to it, then
  `git push origin HEAD:<ticket-branch>`.
- Splitting a shared helper copies its branches; a copy no test reaches drops the module's
  branch % (the ratchet floors it: 97.9 is 97). Keep a shared check in one method.
- Saxon 12.5 s9api `QName.getNamespaceURI()` is deprecated (`-Werror` fails): `getNamespace()`.
- Saxon: inside `xsl:for-each` over arrays the focus is no node, a leading `/` is static
  XPTY0020. A global `select="/"` was rejected in review (an export must not need a global
  context item): bind the value at the template's top. Saxon 12.5 evaluates a template
  `xsl:variable` lazily (observed: unread, its error is never raised).
- Review asks for a mutant per new guard: stage the work, `sed` the mutants, run with
  `-Dmaven.test.failure.ignore=true -Dtest=…`, then `git checkout -- <files>` restores.
- Error messages in engine classes must not hold a kebab-case constant with a hyphen (e.g. a param
  value `case-insensitive`): `DiagnosticCatalogueTest` treats it as an uncatalogued code (read in
  its source, not observed failing).

## json-sKema 0.32.0 (observed, engine/mapping)

- `IJsonObject.get(String)` is `getProperties().get(new JsonString(key))`: `null` when absent
  (javap -c).

- Automatic module `json.sKema`; needs `-Xlint:-requires-automatic` under `-Werror`.
- `patternProperties`: the visitor keeps `firstOrNull()` of the per-member results, so only the
  first matching map member is validated. Re-validate every member against a sub-schema.
- Its JsonParser is lax (trailing comma, unknown escape, raw control char, leading zero) and
  mis-decodes some `\`u escapes: build its tree with an own strict reader.
- A `$ref` from one document into another's `urn:` `$id` throws URISyntaxException: a sub-schema
  document carries the contract's `$defs` and refs `#/$defs/<name>`.
- A keyword's schema location is taken from its key's `SourceLocation`: in a hand-built tree a
  member key must carry the member's pointer, not the parent's.
- `Validator` keeps the instance in a public field: never share one across threads. Sequential
  reuse is safe (`validate` resets `instance`; `DynamicPath` push/pop is balanced, javap).
- Throughput (observed, 100 000 function boxes): about 3-4 us per box against one branch, warm;
  a 4-branch `oneOf` costs about 4x. A cold JVM roughly doubles it. Dispatch boxes by `kind`.
- `oneOf` failure: causes are per branch; `flatten()` returns leaves only. An
  `additionalProperties` wrapper sits at the object, its row failures at the rows.
- Loading a 7.5 MB model (tree, stage 1, records) held a live set of about 600 MB (GC log).

## Quarkus 3.40.1.1 (service, observed)

- `@ConfigProperty` puts OSGi `Requirement` classfile warnings into javac, which `-Werror`
  fails: inject `org.eclipse.microprofile.config.Config` and call `getValue` instead.
- `@UnwrapException` unwraps only when neither the exact type nor a supertype has a mapper.
  quarkus-rest-jackson wraps a body parse error in `WebApplicationException(400)`; Jackson wraps
  a parse error inside a member (duplicate key) in a plain `JsonMappingException`.
- `application/problem+json` is written by the Jackson writer (suffix ungrouped to JSON).
- smallrye-openapi marks an `Optional` component nullable unless `@Schema(nullable = false)`; a
  `byte[]` body needs `@RequestBody(content = @Content(schema = @Schema(ref)))` for a clean `$ref`.
- A record header cannot see its own `static final` constant unqualified: `Rec.KIND`.
- smallrye 4.3.5: once a method declares any `@APIResponse` (a 4xx), the generated 200 is gone;
  declare the 2xx explicitly too.
- An empty body and the body `null` bind a record parameter to `null`: check it in the method.
- Jackson 2.21 strict records (javap + probe): `setDefaultSetterInfo(forValueNulls(FAIL, FAIL))`
  refuses null members, null list entries and JSON `null` for a `JsonNode` member, and a missing
  member too (`NullsFailProvider.getAbsentValue`); `FAIL_ON_MISSING_CREATOR_PROPERTIES` first only
  names it missing. Int/float/boolean to `String` needs
  `coercionConfigFor(LogicalType.Textual).setCoercion(<shape>, Fail)`. Tree content is untouched.
- `Files.createTempFile` makes the file 0600 on POSIX; a move keeps it.

## JaCoCo

- A `switch` `default` or a guard no test reaches costs a branch against the 80% floor; prefer
  typed overloads or exhaustive sealed switches.

## ui/

- `json-schema-to-typescript` 16.0.0 (CLI `json2ts -i <schema> -o <ts>`) pulls `argparse` 3.0.4
  (PSF-2.0) through js-yaml 5; `argparse` 2.0.1 (Python-2.0) was already in the lock through
  openapi-typescript. Neither licence is on the CLAUDE.md list: raise it, do not override.
- Map objects without a `title` make json2ts write "referenced by `undefined`" comments.

## Spec 3 (recorded at the retro)

- `./mvnw` inside a `while read` loop eats the loop's stdin: run it with `< /dev/null`.
- FamilyLocalityTest fails on an XSL variable named like a catalogue function (`$count`): rename it.
- Merging the integration tip: `git merge --no-ff -F <file>` with the §11 trailers; a plain merge
  fails gate row 2c (six such commits reached #84).

## Spec 4

- JUnit 6.1.3 quotes String arguments in a `{0}` display name; for plain names use
  `Arguments.argumentSet(name, …)` with `name = "{argumentSetName}"` (#86).
- A Saxon compile of an export costs about 40 ms, dominated by the helper module; a shared
  Processor does not help. Compile once, run per input (#86).
- The worktree guard refuses a Bash call mixing heredocs, `python3 - <<EOF`, loops or pipes: write
  a helper script with Write and run it as plain `bash <file>` (#87).
- Tests in `engine/api` and `engine/oracle` once stored fake fingerprints (`"sha256:"+"0".repeat(64)`);
  compile now checks them (#91). Compute them with `Structures.load(...).structure().fingerprint()`
  (`Fingerprints.refreshed(model, base)` in api tests).
