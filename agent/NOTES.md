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
- Context7, first check: without a key `resolve-library-id` returned "Monthly quota exceeded"
  → ENVIRONMENT_BLOCKED. Fixed by the owner (env key) and fe59d68 (`.mcp.json` header).
- Context7, re-check 2026-10-30:
  - `CONTEXT7_API_KEY` in the environment: VERIFIED_PASS (set; value never printed).
  - Direct POST `resolve-library-id` "vert.x" with the key header: VERIFIED_PASS — returns the
    library list (`/eclipse-vertx/vert.x`, versions 5.1.8), no quota error.
  - Context7 MCP tools in the session (ToolSearch "context7"): EXECUTED_FAIL — none attached,
    and the server is not even listed as failed. Likely cause: the session started with
    `/home/user` (multi-repo root) as working directory, so no repo's `.mcp.json` was read.
    Saxon `resolve-library-id` / `query-docs` via MCP: NOT_RUN (no tools).
  - `.mcp.json` already carries `"headers": {"CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"}` on
    `main` (fe59d68): nothing to change. Next: a new session opened on this repo.
  - Until the tools attach, Context7 is usable by direct `curl` POST to the endpoint (above).
- `curl https://help.sap.com/` and `https://community.sap.com/`: ENVIRONMENT_BLOCKED — proxy
  refuses the CONNECT tunnel (403, http_code 000); the hosts are outside the network policy.
