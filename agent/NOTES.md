# Notes

Module notes by section, read on demand.

## Cloud environment (observed 2026-10-30)

- `java -version`: 25.0.5.0.3 LTS (Oracle HotSpot). `JAVA_TOOL_OPTIONS` sets proxy + truststore.
- `node --version`: v22.22.0.
- `mvn -v`: Apache Maven 3.9.11 (`/opt/maven`).
- `gh` 2.89.0 (< 2.94: no `--blocked-by` / `--add-sub-issue` flags; use REST anyway).
- `gh issue list`: EXECUTED_FAIL — HTTP 403, GraphQL is blocked from Claude Code sessions.
- `gh api repos/{owner}/{repo}/issues`: VERIFIED_PASS — REST works. Use the
  "Cloud VM: REST only" table in `docs/agents/issue-tracker.md` for every issue operation.
- `gh auth status` reports the GH_TOKEN invalid; ignore it, the proxy authenticates REST calls.
- Labels from `scripts/bootstrap-github.sh` exist on `subapavel/flottila-mapping`.
- Context7 (`.mcp.json`, https://mcp.context7.com/mcp): host reachable (initialize → 200), but
  `resolve-library-id` returns "Monthly quota exceeded" without an API key, and no context7
  tools are attached to the session → ENVIRONMENT_BLOCKED. Fallback: `javap` on the jar in
  `~/.m2` / the package's `.d.ts`. Owner action: add a Context7 API key to the environment.
