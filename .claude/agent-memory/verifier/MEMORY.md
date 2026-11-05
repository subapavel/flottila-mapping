# verifier memory

Durable facts only (AGENTS.md, Memory).

- The shell does not keep a `cd` outside the repo: run a gate as one
  `bash -c "cd <worktree> && scripts/gate-… > .logs/x.log 2>&1"`, after `mkdir -p <worktree>/.logs`.
- `gate-ticket.sh` appends `engine/oracle` itself: never list `oracle` in the modules ("Could not
  find the selected project in the reactor").
- Always gate in a fresh `verify-*` worktree: a stale `jacoco.exec` fails service coverage.
- Spec gate step 5 (JMH) is NOT_RUN until spec 6 brings the benchmark jar.
- `gate-spec.sh` with no PIT module list includes `engine/udf-api` and `engine/udf`, which hold
  only `module-info.java` until spec 7 and print "no PIT report DROP". Pass the modules that have
  a row in `ratchet/mutation.tsv` (spec #89, gate 2).
