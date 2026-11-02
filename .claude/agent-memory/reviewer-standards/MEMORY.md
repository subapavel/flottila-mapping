# reviewer-standards memory

Durable facts only (AGENTS.md, Memory).

## Recurring findings
- Two-sided guards (`a.isEmpty() != b.isEmpty()`): PIT only negates the whole condition, so one
  half can go unwitnessed with a green mutation score. Check each half has a test case.
  Seen: #27 XsltExporter.outputName (prefix without namespace).
- "Equivalent mutant" claims: check them against the public seam, not the current lowering.
  Hand-built IR the IrVerifier accepts (nested ElementConstructor > TargetSlots) is legal
  exporter input. Seen: #27 XsltExporter depth+1.
- Diagnostics-sorting compact constructor copied per result type (CompileResult.Refused,
  ExportResult.Refused). Duplicated Code, judgement.

## Repo facts
- Enforcer bans that one module lifts use `<phase>none</phase>` on the execution id
  (enforce-no-jmh in bench/jmh, enforce-no-saxon in engine/oracle). Any child POM can lift one
  the same way, so grep diffs for those ids.
- `gh issue view` fails (GraphQL blocked); use `gh api repos/subapavel/flottila-mapping/issues/N`
  and `/comments`. The approved design is in the ticket comments, and it can sanction choices
  that look like standards deviations (hand-built IR in engine/oracle, non-corpus inputs).
- Worktree logs: `.claude/worktrees/<agent>/.logs/<ticket>-*.log` (enforcer witness, pit).
- `toRealPath()` guards that catch only `NoSuchFileException`: a link loop (ELOOP) or an
  unsearchable target is a plain `FileSystemException`/`AccessDeniedException`. Check what a
  "skip"/"fail closed" ruling needs. Seen: #28 Workspace.insideByRealPath, checkBundle.
- Config-only guards (Jackson coercion bans, features, partial `&&` conditions in hand-written
  validators) often ship with one case of several witnessed. Ask for one case per line.
  Seen: #28 ServiceConfig:45,50-51, RootSelectorJson:49-50.
- smallrye-openapi drops its generated 2xx once any `@APIResponse` is declared; hand-declared
  2xx then need a contract-test witness. Seen: #28.
