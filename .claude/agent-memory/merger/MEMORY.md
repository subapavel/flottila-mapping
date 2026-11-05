# merger memory

Durable facts only (AGENTS.md, Memory).

- The main worktree holds the integration branch checked out: merge in a `--detach` worktree on
  `origin/spec/...` and push `HEAD:spec/...`; never check out or move the local branch (#91).
- A ticket branch that already contains the integration tip merges with an equal tree
  (`git diff --quiet HEAD <ticket>`): its scoped verify stands, no new build (#91).
