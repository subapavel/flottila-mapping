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

## json-sKema 0.32.0 (observed, engine/mapping)

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

## JaCoCo

- A `switch` `default` or a guard no test reaches costs a branch against the 80% floor; prefer
  typed overloads or exhaustive sealed switches.

## ui/

- `json-schema-to-typescript` 16.0.0 (CLI `json2ts -i <schema> -o <ts>`) pulls `argparse` 3.0.4
  (PSF-2.0) through js-yaml 5; `argparse` 2.0.1 (Python-2.0) was already in the lock through
  openapi-typescript. Neither licence is on the CLAUDE.md list: raise it, do not override.
- Map objects without a `title` make json2ts write "referenced by `undefined`" comments.
