# reviewer-spec memory

Durable facts only (AGENTS.md, Memory).

- A single-value binder that short-circuits an input (`if`, `and`, `or`) disagrees with the
  export, which evaluates every argument (F-22). Check every binder, not only the one named.
  Seen: #77, found only at the spec-3 review, `and`/`or` only in its second round.
- A ticket's family or scope can contradict the spec's Implementation Decisions: compare them.
  Seen: #83 put fixValues in `constant`; #70 said `conversions`.
- A corpus case built with a stand-in for a function that did not exist yet keeps it after that
  function lands. Seen: target/max/004 used replaceValue for constant until the spec-3 review.
