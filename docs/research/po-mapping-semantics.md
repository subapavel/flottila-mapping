# SAP PO graphical mappings: queues, contexts, SUPPRESS, functions, UDFs

Research note for issue #2 ("What exactly do SAP PO graphical mappings do with queues and
contexts?"). Date: 2026-10-30.

## How this note was produced (read first)

- `help.sap.com`, `community.sap.com` (and therefore `blogs.sap.com` / `answers.sap.com`, which
  redirect there) **did not resolve** from the research session (DNS `ENOTFOUND`; outbound network
  allowlist). No page below was opened directly. Further hosts were not tried.
- Every claim below comes from the **search-engine excerpt** of the cited URL (WebSearch), not from
  reading the page. Each claim carries a source tag:
  - **[SAP]** — the excerpt is from an SAP-owned documentation page (help.sap.com, SAP Javadoc,
    learning.sap.com). Primary source, but not read in full.
  - **[COMM]** — the excerpt is from SAP Community / third-party blogs. Not primary; used only
    where no SAP excerpt was found, and marked so.
- Before any oracle case or ADR relies on a claim, someone with access must open the cited SAP
  page and confirm it (see "Open ambiguities"). Treat this note as a map of where the answers are,
  with a first reading of them.

## 1. Queues and contexts

- The message mapping runtime keeps **one queue per source field**. Standard functions and UDFs
  read input queues and write a result queue, which can feed further functions; the target field
  also has a queue. [SAP] Processing an Input Queue —
  https://help.sap.com/saphelp_nwpi71/helpdata/en/3c/5d70b7d21e478fa569fec37325b9f6/content.htm ,
  https://help.sap.com/saphelp_em92/helpdata/en/4b/f414e4eaca4c86e10000000a42189e/content.htm
- A **context change** is placed in the queue whenever the **parent node** of the field changes
  (shown in dark grey in the display queue). [COMM]
  https://blogs.sap.com/2019/11/15/sap-cloud-platform-integration-cpi-use-cases-of-node-functions-in-message-mapping/
- The context of each source field can be set individually in the data-flow editor's context menu
  (choose a higher ancestor as the context); a higher-level context means fewer context changes.
  [SAP] https://help.sap.com/saphelp_nwpi711/helpdata/en/35/fb8c4057d5701de10000000a1550b0/content.htm ;
  [COMM] https://community.sap.com/t5/technology-q-a/graphical-message-mapping/qaq-p/2539128
- In nested queues, **the number of contexts of an inner queue must match the number of values of
  the upper-level queue**. [SAP] (excerpt via search on the ResultList page)
  https://help.sap.com/saphelp_em92/helpdata/en/4b/f416e1eaca4c86e10000000a42189e/content.htm
- SAP Support Content page "What is Context and Context Change" exists:
  https://help.sap.com/docs/SUPPORT_CONTENT/xi/3362977083.html [SAP] (no excerpt content obtained).

### 1.1 Functions over queues with unequal lengths

- When the input queues of a (single-value) function such as `concat` have **different numbers of
  values in corresponding contexts**, the runtime **reuses the last value it read from the shorter
  queue**. [SAP] Processing an Input Queue (URLs above; figure "Different Number of Values for Each
  Context").
- A **generating function** that produces one value (e.g. `Constant`) is reused for every value of
  another input queue that has more values in the context. [SAP] same pages.
- When a generating function feeds a function (not the target directly), **the input queue with the
  most values in the current context determines how often it fires**; when it is attached directly
  to the target field, the field's `minOccurs`/`maxOccurs` govern. [SAP] Mapping Fields Within a
  Context — https://help.sap.com/saphelp_crm70/helpdata/en/03/398c4024d26e1de10000000a1550b0/content.htm ,
  https://help.sap.com/saphelp_em900/helpdata/en/4b/f414f7eaca4c86e10000000a42189e/content.htm

## 2. How target fields are created from queues

- Structure fields with `minOccurs = maxOccurs > 0` are **generated automatically**; **optional
  structure fields without a target-field mapping are suppressed** (not created). [SAP] Mapping
  Fields Within a Context (URL above).
- Each value in the target field's queue produces one occurrence; context changes in the target
  queue align with occurrences of the parent target node (consequence of the "contexts of inner
  queue = values of upper queue" rule above). [SAP] ResultList page above. The exact algorithm
  (what happens on a mismatch) is **not** documented in any excerpt found — see ambiguities.
- A target field with occurrence `0..1` appears at most once; a `SUPPRESS` value in the target
  queue means the target field is **not populated**. [COMM]
  https://community.sap.com/t5/technology-q-a/display-queue-for-target-field-in-message-mapping/qaq-p/4485594
- `SUPPRESS` on a **mandatory** target element produces the runtime error "Cannot create target
  element"; it is not silently skipped. [COMM]
  https://archive.sap.com/discussions/thread/2019012

## 3. SUPPRESS

- `ResultList.SUPPRESS` is a constant; an entry with this value **suppresses generation of the
  target field and its sub-nodes**. [SAP]
  https://help.sap.com/saphelp_snc70/helpdata/en/7d/028c4057d5701de10000000a1550b0/content.htm
- `ifWithoutElse` produces `ResultList.SUPPRESS` when the condition is false; it is intended as a
  filter in target-field mappings. Its properties let you choose whether the "else" value is an
  **empty string or SUPPRESS**. If the input queues of a downstream standard function must stay
  **synchronized**, `ifWithoutElse` must produce SUPPRESS (so that the downstream function does not
  skip the slot). [SAP] https://help.sap.com/saphelp_em92/helpdata/en/4b/f416d9eaca4c86e10000000a42189e/content.htm ,
  https://help.sap.com/docs/SAP_NETWEAVER_702/ff4b17c66c55101488e1c652adb52951/4bf416d9eaca4c86e10000000a42189e.html ,
  https://help.sap.com/saphelp_nwpi711/helpdata/en/5d/db0e83e8e74202a5bff527055ab7e5/content.htm
- The UI property is labelled **"Keep SUPPRESS Values"**; with it on, the item count of the output
  queue is preserved. A PI 7.1 report says SUPPRESS was passed regardless of the flag. [COMM]
  https://community.sap.com/t5/technology-q-a/how-to-remove-quot-suppress-quot-in-graphical-mapping/qaq-p/9478748 ,
  https://community.sap.com/t5/technology-q-a/mapping-if-condition-without-else-values-get-suppressed/qaq-p/5071755
- SUPPRESS "keeps the queue in range and guarantees the choice of the correct values"; the tool
  picks the first non-SUPPRESS value from the correct context; `createIf` selects a whole node with
  its sub-nodes. [COMM, by an SAP employee] S. Grube, "The Use of suppress in the XI 3.0 Graphical
  Mapping Tool", 2006 — https://blogs.sap.com/2006/01/09/the-use-of-suppress-in-the-xi-30-graphical-mapping-tool/
- A context change is **not** a SUPPRESS (they are distinct markers in the display queue). [COMM]
  https://community.sap.com/t5/technology-q-a/how-to-remove-suppress-and-null-in-mapping-contexts/qaq-p/9700124
- `collapseContexts` vs `removeContexts` with respect to SUPPRESS: with "keep SUPPRESS" off,
  `collapseContexts` copies SUPPRESS to the output as an empty value while `removeContexts` drops
  SUPPRESS; with it on, both treat SUPPRESS like any other value. [COMM, third party]
  https://sapintegrationhub.com/pi-po/node-functions/difference-collapse-context-remove-context-sap-pi-po/

## 4. Node functions (context behaviour)

| Function | Behaviour | Source |
|---|---|---|
| `removeContexts` | Deletes all context changes in a queue (all values end up in one context, i.e. assigned to the root). | [SAP] learning.sap.com "Using Context in Message Mapping" https://learning.sap.com/learning-journeys/developing-business-processes-with-sap-process-orchestration/using-context-in-message-mapping_b0522226-339a-4735-ab37-d5aa1553bc89 ; [COMM] https://community.sap.com/t5/technology-q-a/what-are-node-functions/qaa-p/4314763/highlight/true |
| `splitByValue` | Inverse of `removeContexts`: inserts context changes. Modes: after **each value**, after each **value change**, or after each **tag without a value** (UI: Each Value / Value Change / Empty Value). | [SAP] https://help.sap.com/saphelp_nwpi711/helpdata/en/34/c28d406b305537e10000000a1550b0/content.htm , https://help.sap.com/saphelp_nwpi71/helpdata/EN/21/3bb8c495125e4eb5969f0377885fe0/content.htm ; [COMM] https://community.sap.com/t5/technology-q-a/graphical-message-mapping-splitbyvalue/qaq-p/6367773 |
| `collapseContexts` | Copies the **first value of every context** into one context; **empty contexts become an empty string**. Typically combined with `splitByValue` to create one upper-level node per lower-level entry. | [SAP] https://help.sap.com/saphelp_crm70/helpdata/en/58/cd834014d26f1de10000000a1550b0/content.htm , https://help.sap.com/saphelp_em92/helpdata/en/4b/f414ebeaca4c86e10000000a42189e/content.htm |
| `useOneAsMany` | Replicates a once-occurring field as often as another field occurs. Input 1: value to repeat (one value per context); input 2: determines how many times (its context changes must match input 1's); input 3: defines the target's context changes (same number of values as input 2). Mismatches/empty contexts raise errors. | [SAP] https://help.sap.com/saphelp_nwpi71/helpdata/EN/ef/df564b6aa24fc9ab0d685460747de5/content.htm , https://help.sap.com/saphelp_em900/helpdata/en/4b/f416edeaca4c86e10000000a42189e/content.htm ; [COMM] https://community.sap.com/t5/technology-q-a/issue-with-empty-context-in-useoneasmany-sap-pi-function/qaq-p/826805 |
| `createIf` | Inserts target structure elements with no source counterpart; a boolean input controls whether the element is created. Grube's blog discusses `createIf` together with SUPPRESS; the exact output values were not in any excerpt (ambiguity 8). | [COMM] https://community.sap.com/t5/technology-q-a/node-functions/qaq-p/3788294 ; Grube blog above |
| `exists` | `true` if the source field assigned to the input exists in the XML instance, else `false`. | [SAP] learning.sap.com page above; [COMM] node-functions thread above |
| `mapWithDefault` | Inserts the default value from the function properties into **empty contexts**; equivalent to `if(exists(f), f, Constant)`. Introduced XI 3.0 SP13. | [COMM] node-functions thread above; https://blogs.sap.com/2005/12/29/new-functions-in-the-graphical-mapping-tool-xi-30-sp13/ |
| `formatByExample` | Takes **values from the first queue** and **context changes from the second**; both must have the same number of values (empty contexts are not counted for that check but are kept in the structure), else the runtime throws. | [SAP] https://help.sap.com/doc/saphelp_nw74/7.4.16/en-us/4b/f416dceaca4c86e10000000a42189e/content.htm?no_cache=true , https://help.sap.com/saphelp_ewm900/helpdata/en/4b/f416dceaca4c86e10000000a42189e/content.htm?no_cache=true |
| `sort` | Sorts the values **within each context** (so `removeContexts` first to sort globally). Has an order option (descending mentioned). | [COMM] node-functions thread above; https://community.sap.com/t5/technology-q-a/using-sort-function-in-mapping/qaq-p/7698508 |
| `sortByKey` | Sorts the second queue (values) by keys from the first queue, per context; differing key/value counts ⇒ runtime exception. | [COMM] node-functions thread above |
| `replaceValue` | Replaces each input value with the value set in the function properties. | [COMM] node-functions thread above |
| `getHeader`, others | No PO-node-function documentation found (CPI only). | — |

SP13 (XI 3.0) introduced `mapWithDefault`, `formatByExample`, `sort`, `sortByKey`. [COMM, by SAP
employee] https://blogs.sap.com/2005/12/29/new-functions-in-the-graphical-mapping-tool-xi-30-sp13/

## 5. Other standard functions (categories)

The SAP "Standard Functions" pages list the catalogue by category; the full tables could not be
read. Categories confirmed by excerpts: Arithmetic (e.g. `max`, `multiply`, `counter`), Boolean
(`and`, `or`, `not`, `if`, `ifWithoutElse`; "1"/"true" case-insensitive are true, everything else
false), Text (`substring`, `concat`, …), Date (`currentDate`, `DateTrans`, `DateBefore`,
`DateAfter`, `CompareDates`), Constants (`Constant`, `CopyValue`, `Sender`, `Receiver`),
Conversions (`FixValues`, `Value Mapping`), Node functions (above), Statistics (`sum`, `average`,
`count`, `index`).
[SAP] https://help.sap.com/saphelp_nwpi711/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm ,
https://help.sap.com/saphelp_snc70/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm ,
https://help.sap.com/docs/SUPPORT_CONTENT/xi/3362977407.html

- `index` has a "reset at each context change" option (count indices in context vs queue).
  [COMM] https://community.sap.com/t5/technology-q-a/message-mapping-initialize-counter-every-context-change/qaq-p/6612991 ,
  https://blogs.sap.com/2006/06/29/message-splitting-using-the-graphical-mapping-tool/
- `counter` counts invocations from an initial value with an increment. [COMM] search excerpt of
  https://answers.sap.com/questions/4650014/built-in-functions-in-message-mapping.html

## 6. User-defined functions

### 6.1 Execution types

- Three execution types: **Single Values**, **All Values of a Context**, **All Values of Queue**
  (enum `ExecutionType.SINGLE_VALUE`, `ALL_VALUES_OF_CONTEXT`, `ALL_VALUES_OF_QUEUE`; default
  `SINGLE_VALUE`). [SAP] Creating Functions in Function Library —
  https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-US/52/46fc9c723d442a9fd9c5a0022f4069/content.htm?no_cache=true ;
  package summary https://help.sap.com/doc/javadocs_nw73_sps05/7.3.5/en-US/PI/com/sap/aii/mappingtool/tf7/rt/package-summary.html
- Single-value functions **return `String`**; context/queue functions **return results through a
  `ResultList`** parameter. A function whose signature does not match its execution type is not
  offered in the editor (saved as a plain Java method). [SAP] same pages and
  https://help.sap.com/saphelp_em92/helpdata/en/4b/f41851eaca4c86e10000000a42189e/content.htm
- Advanced (context/queue) functions receive **one context or the whole queue as arrays**; the
  input arrays **omit the context change at the start and end** of a context/queue (those are
  implicit and cannot be removed by the function); output context changes must be added to the
  `ResultList` explicitly. Older releases select queue mode via a "Save Entire Queue in Cache"
  checkbox; caching whole queues costs memory on large messages. [SAP]
  https://help.sap.com/saphelp_em900/helpdata/en/4b/fbd21666d33de4e10000000a42189e/content.htm ,
  https://help.sap.com/saphelp_crm70/helpdata/en/40/7b8e40496f6f1de10000000a1550b0/content.htm ,
  https://help.sap.com/doc/saphelp_em900/9.0/en-US/4b/f41851eaca4c86e10000000a42189e/content.htm?no_cache=true
- Function libraries (7.1+) use `@LibraryMethod(title, category, type = ExecutionType.…)`,
  `@Argument` (not needed for `Container`/`ResultList` arguments), and `Init`/`Cleanup` methods.
  [SAP] Creating Functions in Function Library (URL above).
- Example context-type signature from a community thread (shape, not normative):
  `counterContext(String[] CONTEXT, String[] ELEMENT, ResultList result, Container container)`.
  The single-value shape (`String` parameters returning `String`, with a trailing `Container`) is
  not confirmed by any excerpt. [COMM] https://community.sap.com/t5/technology-q-a/message-mapping-initialize-counter-every-context-change/qaq-p/6612991

### 6.2 `ResultList` (`com.sap.aii.mappingtool.tf7.rt.ResultList`)

- `addValue(…)` (`String` in older releases, `Object` in 7.5), `addContextChange()`,
  `addSuppress()`, `clear()`; constants `CC`, `SUPPRESS`, `XSI_NIL`. `addValue(ResultList.CC)` has
  the same effect as `addContextChange()`. [SAP]
  https://help.sap.com/doc/javadocs_nw75_sps04/7.5.4/en-US/PI/com/sap/aii/mappingtool/tf7/rt/ResultList.html ,
  https://help.sap.com/doc/saphelp_nw74/7.4.16/en-us/4b/f416e1eaca4c86e10000000a42189e/content.htm?no_cache=true
- One older SAP page's excerpt says `addContextChange` appends `SUPPRESS` — a documentation
  inconsistency (see ambiguities). [SAP]
  https://help.sap.com/saphelp_snc70/helpdata/en/7d/028c4057d5701de10000000a1550b0/content.htm
- CPI's equivalent is `com.sap.it.api.mapping.Output` (`addValue`, `addContextChange`,
  `addSuppress`, `clear`, `isContextChange`). [SAP]
  https://help.sap.com/doc/d47441d304c14a0ab9d3986c1b553a1e/Cloud/en-US/index-all.html

### 6.3 `Container`

- `getTrace()` (an `AbstractTrace` for the mapping trace), `getGlobalContainer()` (values shared
  between UDFs of one mapping; call order depends on target-field position), `getParameter(String)`
  (null if absent), `getTransformationParameters()` (deprecated; runtime constants from
  `StreamTransformationConstants`). Container also caches values between calls of the same UDF.
  [SAP] https://help.sap.com/doc/javadocs_nw75_sps06/7.5.6/en-US/PI/com/sap/aii/mappingtool/tf7/rt/Container.html ,
  https://help.sap.com/saphelp_nwpi71/helpdata/EN/78/b4ea10263c404599ec6edabf59aa6c/content.htm

## 7. Open ambiguities

1. **Source access.** None of the SAP pages was read in full (DNS block). Every [SAP] claim needs a
   direct read before it becomes an oracle case; every [COMM] claim needs an SAP source or an
   observed PO run.
2. **Target creation algorithm.** Exact rule for aligning a target field's queue with its parent's
   occurrences when counts do not match (extra values, extra contexts, fewer contexts) — not found.
3. **Last-value reuse.** Does "reuse the last value" for unequal queues apply across a context
   boundary, to empty contexts, and to SUPPRESS slots? Does it apply to UDFs of type single value?
4. **SUPPRESS propagation.** How each standard function treats a SUPPRESS input (pass through,
   skip, treat as empty) — documented only for `ifWithoutElse` and (third-party) for
   `collapseContexts`/`removeContexts`.
5. **`addContextChange` vs SUPPRESS.** One SAP page excerpt says `addContextChange` appends
   SUPPRESS; the Javadoc says it appends a context change.
6. **Empty contexts.** Whether `removeContexts` keeps or drops empty contexts; what "empty context"
   means for `mapWithDefault` (no values vs only SUPPRESS); `splitByValue` "Empty Value" mode
   details.
7. **`exists`** — per value, per context, or per queue? Output count per context not stated.
8. **`createIf`** — exact output (empty string vs a value when true; SUPPRESS when false) and its
   context behaviour.
9. **`sort` / `sortByKey` options** — lexicographic vs numeric, case sensitivity, stability: not
   confirmed by any source.
10. **`useOneAsMany`** — role of each input is described inconsistently in community answers;
    exact error conditions not stated.
11. **`ifWithoutElse` "Keep SUPPRESS Values"** — reported PI 7.1 bug ignoring the flag; current
    behaviour unconfirmed.
12. **Full catalogue.** Exact names, parameters and properties of every standard function (Text,
    Arithmetic, Date, Conversion, Statistics) — tables not read.
13. **Statistics functions** (`sum`, `count`, `average`) — per context or per queue; `counter`
    scope.
14. **`XSI_NIL`** — semantics in the target (nil element) not described.
15. **UDF null handling** — what a single-value UDF receives for a missing field or SUPPRESS slot.
