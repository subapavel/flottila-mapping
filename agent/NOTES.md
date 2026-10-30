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
  - Context7 MCP tools: earlier sessions ran from `/home/user` and the server sat at "Pending
    approval"; fixed by 90ffa60 (`deploy/claude-cloud/setup.sh` writes `enabledMcpjsonServers`
    into `~/.claude/settings.json`). `.mcp.json` carries the key header (fe59d68).
- Context7, session check 2026-10-30 (new session on this repo only, issue #20):
  1. `pwd` = `/home/user/flottila-mapping`: VERIFIED_PASS.
  2. `~/.claude/settings.json` `enabledMcpjsonServers` = `['context7']`: VERIFIED_PASS.
  3. `CONTEXT7_API_KEY` set (value never printed): VERIFIED_PASS.
  4. `claude mcp list`: `context7: https://mcp.context7.com/mcp (HTTP) - √ Connected`: VERIFIED_PASS.
  5. ToolSearch "context7" → `resolve-library-id`, `query-docs` attached: VERIFIED_PASS.
     `resolve-library-id` "Saxon-HE" → `/websites/saxonica_documentation12` (Saxon 12 docs);
     `query-docs` "s9api XsltCompiler compile stylesheet" → real snippets, no quota error:
     VERIFIED_PASS. Caveat: that library has only 4 snippets (overview pages), none on s9api;
     for Saxon Java API signatures use `javap` on the test-scope Saxon-HE jar.
- `curl https://help.sap.com/` and `https://community.sap.com/`: ENVIRONMENT_BLOCKED — proxy
  refuses the CONNECT tunnel (403, http_code 000); the hosts are outside the network policy.
- Session check 2026-10-30 (Phase 0 continuation):
  - ToolSearch "context7" → `resolve-library-id`, `query-docs` attached: VERIFIED_PASS.
  - `resolve-library-id` "saxon" → `/websites/saxonica_documentation12` (4 snippets) and
    `/websites/saxonica_saxonjs_documentation2`: VERIFIED_PASS.
  - `query-docs` on the Saxon 12 library ("xsl:iterate and grouping in Saxon-HE") → overview
    snippets only (editions, XSLT 3.0 conformance, HE under MPL 2.0), no quota error:
    VERIFIED_PASS. Same caveat: no element-level Saxon docs in Context7; read the W3C specs or
    saxonica.com directly.
  - `curl https://help.sap.com/` → 301 to `/docs`, then 200 (Akamai): VERIFIED_PASS — the host is
    now inside the network policy.
  - `curl https://community.sap.com/` → CONNECT tunnel established, origin (Cloudflare) answers
    403 to GET (HEAD 200): ENVIRONMENT_BLOCKED by the site's bot protection, not by the proxy.
    Do not work around it; cite community posts only via search excerpts, tagged [COMM].
