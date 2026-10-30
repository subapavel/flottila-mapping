# SAP PO graphical mappings: queues, contexts, SUPPRESS, functions, UDFs

Research note for issue #2 ("What exactly do SAP PO graphical mappings do with queues and
contexts?"). First pass 2026-10-30 (search excerpts only); second pass 2026-10-30 (pages read).

## Second pass (2026-10-30) — read first

**What changed.** Every SAP page cited in the first pass was opened and read in this session,
plus the PO 7.5 versions of the same topics and the SAP Javadoc for
`com.sap.aii.mappingtool.tf7.rt`. Each claim is now tagged:

- `[SAP✓ <url>]` — read in this session; the page says this (short quote where useful).
- `[SAP✗ <url>]` — read in this session; the page says something else. The claim is corrected.
- `[SAP? <reason>]` — SAP page, could not be read in this session.
- `[COMM]` — community or third-party source, not read (community.sap.com sits behind bot
  protection; not circumvented). Kept as a lead, not a fact.
- `[WIKI✓ <url>]` — read in this session; an SAP Community wiki page migrated to
  help.sap.com "Support Content". SAP hosts it but community members wrote it, so it is **not**
  primary. Used only as a lead.

**How the content was reached (all plain HTTPS GET, standard curl user agent).**

1. Legacy static pages (`help.sap.com/saphelp_*/helpdata/...content.htm`,
   `help.sap.com/doc/...content.htm`) are plain HTML; read directly. Their figures
   (`.gif`/`.jpg` next to the page) were downloaded and looked at where the text depends on them.
2. SAP Javadoc (`help.sap.com/doc/javadocs_nw7x_.../PI/...`) is static HTML; read directly.
3. `help.sap.com/docs/...` is a JavaScript app. Its own front end loads content from two JSON
   endpoints, which were called the same way:
   `GET /http.svc/deliverableMetadata?product_url=<P>&deliverable_url=<D>&topic_url=<T>.html&version=LATEST`
   (gives `deliverable.id` and `buildNo`), then
   `GET /http.svc/pagecontent?deliverableInfo=1&deliverable_id=<id>&file_path=<T>.html&buildNo=<n>`
   (gives `data.body`, the topic HTML). The search endpoint `/http.svc/elasticsearch` found the
   PO 7.5 (SAP NetWeaver 7.50 SPS29) versions of the topics.
4. Not reachable: `learning.sap.com` (refused by this VM's egress proxy), `community.sap.com` /
   `blogs.sap.com` / `answers.sap.com` / `archive.sap.com` (not attempted, bot protection).

**Release coverage.** The PO 7.5 SPS29 pages for Processing an Input Queue, Mapping Fields
Within a Context, Structure Mapping by Setting the Context, Standard Functions, ifWithoutElse,
createIf, removeContexts, collapseContexts, SplitByValue, useOneAsMany, exists, Advanced
User-Defined Functions and ResultList Object were read and carry the **same text** as the 7.1 /
7.11 / EM 9.x pages cited below. The semantics did not change between 7.1 and 7.5 in the docs.

**Counts (44 first-pass claims).** Verified `SAP✓`: 34. Contradicted `SAP✗`: 3 (one is a wrong
citation of a true rule, two are wrong facts). Still unverified (`[COMM]` / `SAP?`): 7.
**Open ambiguities (§7, 15 from the first pass + 1 new):** resolved 6 (1, 5, 8, 9, 12, 13);
partially resolved 7 (2, 3, 4, 6, 7, 10, 11); open 3 (14, 15, new 16).

## What a decision can rely on (SAP-verified)

1. Every source field has a queue: its values in document order, split into **contexts** by
   **context changes**; by default one context per occurrence of the parent element. The number
   of contexts of a queue equals the number of values of the parent's queue. Choosing a higher
   context (or `removeContexts`) merges contexts. (§1)
2. Functions consume input queues context by context. If one input has fewer values in a
   context, the runtime **reuses the last value it read** from that input; a generating function
   repeats its single value. (§1.1)
3. A target field's queue is consumed one context per parent occurrence; each non-SUPPRESS value
   in that context creates one occurrence, capped by `maxOccurs` (extra values are lost);
   fewer than `minOccurs` raises an exception. Contexts beyond the parent's occurrences are not
   used. (§2)
4. `SUPPRESS` is a queue entry (not a context change) that suppresses the target field and its
   subtree **but keeps its slot**, so it still consumes the matching child context and keeps
   multi-input functions aligned. An *empty string* else value from `ifWithoutElse` is
   skipped instead. (§3)
5. Advanced UDFs get one context or the whole queue as `String[]`, with the context changes at
   the edges removed, and write `ResultList` (`addValue`, `addContextChange`, `addSuppress`,
   `clear`). (§6)

## 1. Queues and contexts

- The message mapping runtime keeps **one queue per source field**. Standard functions and UDFs
  read input queues and write a result queue, which can feed further functions; the target field
  also has a queue. "There is a queue for each field in the source structure."
  [SAP✓ https://help.sap.com/saphelp_nwpi71/helpdata/en/3c/5d70b7d21e478fa569fec37325b9f6/content.htm]
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f414e4eaca4c86e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bf414e4eaca4c86e10000000a42189e.html]
  The same pages add: "The restrictions for the target fields determine which of the values for
  the target field queue are written to the target structure."
- A **context change** separates the contexts in a queue; a field is by default in the context of
  its parent ("In the default setting, each field is in the context of the higher-level field";
  "The contexts are separated in the queue by a context change"). First pass had this as
  [COMM]; now SAP-confirmed.
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/35/fb8c4057d5701de10000000a1550b0/content.htm]
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/3d/24e15bf9d79243b45d49b13b03de8f/content.htm]
  The XML instance "is imported into the queues before the target field mappings are processed"
  (same first page). That the display queue draws a context change in dark grey stays [COMM]; the
  SAP figures read show context changes as grey bars, which is consistent with it.
- The context of each source field can be set individually in the data-flow editor's context
  menu; a higher context means fewer context changes. Worked example (`person` under
  `flat`/`street`/`city`/`root`): the higher the context, the more `person` values land in the
  single `personList` context. "The removeContexts() standard function assigns the fields
  assigned to it to the root node. You will get the same effect if you assign the root context."
  Attributes are in the context of their element.
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/35/fb8c4057d5701de10000000a1550b0/content.htm]
- Nested queues: "The number of contexts of a queue must be the same as the number of values
  (empty strings) of the upper-level queue." A structure field's queue holds one **empty string**
  per occurrence. **Citation corrected:** this rule is *not* on the ResultList page cited in the
  first pass [SAP✗ https://help.sap.com/saphelp_em92/helpdata/en/4b/f416e1eaca4c86e10000000a42189e/content.htm];
  it is on the Advanced User-Defined Functions page
  [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/fbd21666d33de4e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bfbd21666d33de4e10000000a42189e.html].
- Queue entries, per that page: empty string (structure-field occurrence), string (value),
  `ResultList.CC` (context change), `ResultList.SUPPRESS` ("causes a field and its subnode to be
  ignored during processing"), and the **empty context** ("Context that does not contain any
  values"). Its figure shows `<A/>` with no `item` children producing an empty context in the
  `item` queue. [SAP✓ same two URLs]
- "What is Context and Context Change" was read: it is a migrated community wiki that repeats
  the SAP example and adds "If no further elements are imported at a particular hierarchy level,
  A context change is inserted in the Queue". [WIKI✓ https://help.sap.com/docs/SUPPORT_CONTENT/xi/3362977083.html]

### 1.1 Functions over queues with unequal lengths

- When the input queues of `concat` have different numbers of values in contexts that belong
  together, "the message mapping runtime simply uses the last value that it read from the queue
  in question". The figure (inputs `1,2,3 | 4,5,6` and `a,b | c,d`) gives `1a,2b,3b | 4c,5d,6d`:
  the reuse stays **inside the context**; the second context starts with its own first value.
  [SAP✓ https://help.sap.com/saphelp_nwpi71/helpdata/en/3c/5d70b7d21e478fa569fec37325b9f6/content.htm]
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f414e4eaca4c86e10000000a42189e/content.htm]
- A generating function (no inputs, e.g. `Constant`) connected to a function: "If another input
  queue has more than one value in a context, the mapping runtime simply uses the value generated
  by the generating function again." [SAP✓ same URLs]
- Generating function **into a function**: "it is the input queue with the most values for the
  current context that determines how often the generating function generates a value".
  Generating function **directly on a target field** (refined from the first pass): "If
  minOccurs = 0 the value of the function is generated once. Otherwise, the value of the function
  is generated as often as is specified by minOccurs" — `maxOccurs` is ignored, even
  `unbounded`. [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/f414f7eaca4c86e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/saphelp_crm70/helpdata/en/03/398c4024d26e1de10000000a1550b0/content.htm]

## 2. How target fields are created from queues

- Structure fields with `n = minOccurs = maxOccurs > 0` are generated automatically, n times,
  whatever the mapping; a mapping (e.g. `createIf`) may still be assigned. Optional structure
  fields (`minOccurs = 0`) are generated only if they have their own target-field mapping;
  mapping only their children is not enough: "The message mapping suppresses optional structure
  fields (including sub-nodes) without a target field mapping." For `0 < minOccurs < maxOccurs` a
  mapping is required. [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/f414f7eaca4c86e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bf414f7eaca4c86e10000000a42189e.html]
- Occurrence rules for a direct field-to-field mapping: the target occurs at least `minOccurs`
  times, and "If sourceElem does not occur a sufficient number of times in the source structure,
  the mapping runtime throws an exception"; at most `maxOccurs` times, and "If sourceElem occurs
  more frequently … values are lost. If it occurs less frequently, then an equal number of target
  and source fields are generated." XSD default values are ignored. [SAP✓ same URLs]
- One value in the target queue makes one occurrence; context *i* of a child's queue belongs to
  the *i*-th entry of the parent's queue (the nested rule in §1). SAP examples that show it:
  `removeContexts(payment)` → 7 `debt` in one context, and `debt/id = payment/id` (7 contexts)
  fills one `id` per `debt`
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/1f/ea0fb12403844bbb6c4cbc8a00cda9/content.htm];
  `collapseContexts(SplitByValue(removeContexts(srcItem)))` → 7 `destSub`, each with its own
  `destItem` [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/4b/d11e3e1c3b120ae10000000a114084/content.htm].
- **Extra contexts are not used.** With `person` in its default `flat` context mapped under a
  once-occurring `personList`, only the first context (Fix, Foxy) is written: "Once the first
  flat context has been processed it is closed along with the <personList> context".
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/35/fb8c4057d5701de10000000a1550b0/content.htm]
  The `createIf` page says the same thing from the other side: without `removeContexts`, "the
  type queue has nevertheless saved the request context so that processing would terminate
  early". [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/d9/3033f96c79674f90e3ab8d101a595b/content.htm]
- **A SUPPRESS slot consumes its child context.** In the `createIf` example, `internalRequest`
  gets `createIf(...) = ["", SUPPRESS]` and `externalRequest` gets `[SUPPRESS, ""]`; both map
  `initiator = request/creator` (contexts `creator1 | creator2`); the result shows
  `externalRequest/initiator = creator2`. So the suppressed first slot used up context 1.
  [SAP✓ same createIf URL] (Inferred from the worked example; no page states it as a rule.)
- A `0..1` target appears at most once (maxOccurs rule above). A SUPPRESS value in the target
  queue means the field is not created: "ifWithoutElse creates the value ResultList.SUPPRESS if
  the if-condition is not satisfied … or the target element is not to be created at all".
  First pass had [COMM]; now SAP-confirmed.
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/5d/db0e83e8e74202a5bff527055ab7e5/content.htm]
- SUPPRESS on a **mandatory** target raising "Cannot create target element" stays [COMM]
  (https://archive.sap.com/discussions/thread/2019012, not read). SAP pages only say a
  `minOccurs` shortfall throws an exception (rule above). They do not give the message text and
  do not say that SUPPRESS counts as a shortfall.

## 3. SUPPRESS

- `ResultList.SUPPRESS`: `addSuppress()` "Appends the constant ResultList.SUPPRESS to the list.
  The generation of the target field and its sub nodes is suppressed for such entries."
  [SAP✓ https://help.sap.com/saphelp_snc70/helpdata/en/7d/028c4057d5701de10000000a1550b0/content.htm]
  [SAP✓ https://help.sap.com/doc/javadocs_nw75_sps04/7.5.4/en-US/PI/com/sap/aii/mappingtool/tf7/rt/ResultList.html]
  The literal values are `SUPPRESS = "_sUpPresSeD_"`, `CC = "__cC_"`,
  `XSI_NIL = "_!xSi#NiL$_"`. [SAP✓ https://help.sap.com/doc/javadocs_nw75_sps04/7.5.4/en-US/PI/constant-values.html]
- `ifWithoutElse`: true → the `then` input. Into a **target field**, false → SUPPRESS. Into a
  **function**, the else value can be set in the function parameters: "choose the empty string
  as the Else value … the standard function does not interpret the entry as a value and skips
  it"; "If the input queues in the standard function are to be synchronized, ifWithoutElse must
  get the value ResultList.SUPPRESS. In this case, the standard function does not skip the
  SUPPRESS value." The 7.11 page's worked example (`concat(counter, ifWithoutElse(...))`) shows
  that with the empty-string else `concat` skips that context (the counter is not used up, so
  numbering is 1, 2), and with SUPPRESS the SUPPRESS "is linked to the second value of counter"
  (numbering 1, 3; the result queue has SUPPRESS in the slot).
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/5d/db0e83e8e74202a5bff527055ab7e5/content.htm]
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f416d9eaca4c86e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_702/ff4b17c66c55101488e1c652adb52951/4bf416d9eaca4c86e10000000a42189e.html]
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bf416d9eaca4c86e10000000a42189e.html]
- The UI label **"Keep SUPPRESS Values"** and the PI 7.1 report that SAP passed SUPPRESS
  regardless of the flag stay [COMM]. SAP pages call it only "the function parameters of
  ifWithouElse" [sic] (choice: empty string or SUPPRESS).
  https://community.sap.com/t5/technology-q-a/how-to-remove-quot-suppress-quot-in-graphical-mapping/qaq-p/9478748
- Grube (2006): SUPPRESS "keeps the queue in range", the tool picks the first non-SUPPRESS value
  from the correct context. [COMM] (not read). The SAP `createIf` example above agrees with "keeps
  the queue in range".
- A context change is **not** a SUPPRESS: the SAP queue-entry table lists `ResultList.CC` and
  `ResultList.SUPPRESS` as separate entries with separate meanings. First pass had [COMM]; now
  SAP-confirmed. [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/fbd21666d33de4e10000000a42189e/content.htm]
- `collapseContexts` / `removeContexts` and SUPPRESS: still [COMM] and now **conflicting**.
  sapintegrationhub.com (not read) says that with keep-SUPPRESS off `removeContexts` drops
  SUPPRESS. The SAP-hosted community wiki says "remove context also generates suppress value but
  collapse context generates null [] values and nodes are created"; with keep-SUPPRESS on, both
  pass SUPPRESS through. [WIKI✓ https://help.sap.com/docs/SUPPORT_CONTENT/xi/3362977042.html]
  SAP's own Standard Functions table equates the two for collapseContexts: "Empty contexts (=
  ResultList.SUPPRESS) are replaced by empty strings."
  [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm]
- `sortByKey`: numeric keys "must not be equal to the constant ResultList.SUPPRESS". [SAP✓ same URL]

## 4. Node functions (context behaviour)

Primary sources for this table: Standard Functions 7.11
https://help.sap.com/saphelp_nwpi711/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm
(= STD) and PO 7.5
https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bfbd16f66d33de4e10000000a42189e.html
(same node-function text). Both were read in full.

| Function | Behaviour (second pass) | Tag |
|---|---|---|
| `removeContexts` | "Removes all higher-level contexts of a source field … delete all hierarchy levels and generate a list"; same effect as setting the root context. Worked example: 3 `Debitor` → 7 `debt`. Empty contexts / SUPPRESS: not stated (ambiguity 6, 4). | [SAP✓ STD] [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/1f/ea0fb12403844bbb6c4cbc8a00cda9/content.htm] ; learning.sap.com [SAP? refused by egress proxy] |
| `SplitByValue` | Counterpart of `removeContexts`: inserts a context change "after each value, after each change to the value, or after each tag without a value". Param value `Each Value` confirmed; the labels "Value Change" / "Empty Value" were **not** seen on SAP pages. The page also says: "the top node source field must be assigned a top node target field and minOccurs must be >0. A maximum of minOccurs top node target fields can be inserted here." The example (`room` 4..4) gives exactly 4 rooms from 7 ids (the other 3 are lost). | [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/34/c28d406b305537e10000000a1550b0/content.htm] [SAP✓ https://help.sap.com/saphelp_nwpi71/helpdata/EN/21/3bb8c495125e4eb5969f0377885fe0/content.htm] |
| `collapseContexts` | "copies the first value from all contexts to one context. Empty contexts are replaced with an empty string." STD: "Empty contexts (= ResultList.SUPPRESS) are replaced by empty strings … Finally, all internal context changes are deleted". Used with `SplitByValue` to create one parent per child. **Note:** the page figure shows the *last* value of each context, against its own text (ambiguity 16). | [SAP✓ https://help.sap.com/saphelp_crm70/helpdata/en/58/cd834014d26f1de10000000a1550b0/content.htm] [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f414ebeaca4c86e10000000a42189e/content.htm] [SAP✓ STD] |
| `useOneAsMany` | Input 1: the once-occurring field (e.g. `type`). Input 3: the repeating field (e.g. `name`); "The context change takes useOneAsMany() from the name queue." Input 2: decides how often each input-1 value is repeated, by giving the repeating field in input 1's context (e.g. `name[context=order]`). The figure: input 1 `external|internal|external`, input 2 `3 names|2|1`, input 3 per-itemGroup contexts → output `external,external|external|internal,internal|external`. Usually followed by `SplitByValue(Each Value)`. Error conditions: **not on the SAP page**, stay [COMM]. | [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/f416edeaca4c86e10000000a42189e/content.htm] [SAP✓ https://help.sap.com/saphelp_nwpi71/helpdata/EN/ef/df564b6aa24fc9ab0d685460747de5/content.htm] ; errors [COMM] |
| `createIf` | Condition true → **empty string**, false → `ResultList.SUPPRESS` (the ResultList page gives `myCreateIf`, which re-implements it as a context UDF). It creates structure nodes with no source counterpart. First pass had [COMM]; now SAP-confirmed. | [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f416e1eaca4c86e10000000a42189e/content.htm] [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/d9/3033f96c79674f90e3ab8d101a595b/content.htm] |
| `exists` | "O = true, if the source field assigned to inbound channel I exists in the XML instance. Otherwise, false." The example uses it on a 0..1 field into `if`. Granularity: ambiguity 7. | [SAP✓ STD] [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/db/83f7b88528424c9113b15d5e0fb516/content.htm] |
| `mapWithDefault` | "Replaces empty contexts in the inbound queue with a default value … A\|B1,B2\| \|C\| \|D → A \| B1,B2 \| Default \| C \| Default \|D"; equivalent to `If([]field, exists([]field), Constant([value=default]))`. First pass had [COMM]; now SAP-confirmed. "Introduced XI 3.0 SP13" stays [COMM]. | [SAP✓ STD] |
| `formatByExample` | Values from queue 1, context changes from queue 2; equal value counts required ("empty contexts are not counted"), else exception; empty contexts of queue 2 are kept. | [SAP✓ https://help.sap.com/doc/saphelp_nw74/7.4.16/en-us/4b/f416dceaca4c86e10000000a42189e/content.htm] [SAP✓ https://help.sap.com/saphelp_ewm900/helpdata/en/4b/f416dceaca4c86e10000000a42189e/content.htm] |
| `sort` | Sorts values "within the existing or set context"; **stable**; O(n log n); parameters: numeric or lexicographic (case-sensitive or not), ascending or descending. First pass had [COMM]; now SAP-confirmed. | [SAP✓ STD] |
| `sortByKey` | Like `sort` over (key, value) pairs: input 1 keys, input 2 values; key/value count mismatch → exception; numeric keys must not be SUPPRESS. First pass had [COMM]; now SAP-confirmed. | [SAP✓ STD] |
| `replaceValue` | "Replaces the value I with a value that you can define in the dialog for the function parameters." First pass had [COMM]; now SAP-confirmed. | [SAP✓ STD] |
| `getHeader`, others | Not in the PO 7.1 or 7.5 node-function list. CPI only. | [SAP✓ STD] |

"SP13 (XI 3.0) introduced `mapWithDefault`, `formatByExample`, `sort`, `sortByKey`" stays
[COMM] (https://blogs.sap.com/2005/12/29/new-functions-in-the-graphical-mapping-tool-xi-30-sp13/, not read).

## 5. Other standard functions (catalogue)

The full Standard Functions table was read (7.11, SNC 7.0 and PO 7.5). This resolves ambiguity
12. [SAP✓ https://help.sap.com/saphelp_nwpi711/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm]
[SAP✓ https://help.sap.com/saphelp_snc70/helpdata/en/43/c4cdfc334824478090739c04c4a249/content.htm]
[SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/0b9668e854374d8fa3fc8ec327ff3693/4bfbd16f66d33de4e10000000a42189e.html]

- General: all values are strings. A function that cannot cast its input raises a Java
  exception. Boolean outputs are `true`/`false`; Boolean inputs "1" and "true" (not
  case-sensitive) are true, all else false.
- **Arithmetic** (Java `float`, or `BigDecimal` per SAP Note 958486; a trailing ".0" is cut, so
  4.2 − 0.2 = 4): `add`, `subtract`, `equalsA`, `abs`, `sqrt`, `sqr`, `sign`, `neg`, `1/x`,
  `power`, `less`, `greater`, `multiply`, `divide`, `max`, `min`, `ceil`, `floor`, `round`,
  `counter`, `FormatNum` (`java.text.DecimalFormat` pattern).
- **Boolean**: `And`, `Or`, `Not`, `Equals`, `notEquals`, `if`, `ifWithoutElse`.
- **Constants** (generating): `Constant`, `CopyValue` (position *n*, 0-based, of a repeating
  field, copied at most maxOccurs times), `sender`, `receiver`.
- **Conversions**: `FixValues`, `Value mapping`.
- **Date** (`java.text.SimpleDateFormat`; first weekday, minimal days, lenient options):
  `currentDate`, `DateTrans`, `DateBefore`, `DateAfter`, `CompareDates`.
- **Node functions**: §4.
- **Statistics**: `sum`, `average` and `count` work **per context** ("Sum of values X1 to Xi of
  a context"). `index` takes initial value, increment, and whether to reset "at the beginning of
  every new context". First pass had the index option as [COMM]; now SAP-confirmed.
- **Text** (0-based positions): `substring`, `concat` (optional separator), `equalsS`,
  `indexOf` (2/3), `lastIndexOf` (2/3), `compare`, `replaceString`, `length`, `endsWith`,
  `startsWith` (2/3), `toUpperCase`, `trim`, `toLowerCase`.
- `counter`: "Number of calls for this target-field mapping where you specify the initial value
  and the increment". First pass had [COMM]; now SAP-confirmed.
- The NWDS (Eclipse) mapping editor has its own Standard Functions page with an extra
  **Adapter** category (`param`, `keyValue`, `Var`, `result`), out of scope here.
  [SAP✓ https://help.sap.com/docs/SAP_NETWEAVER_750/019c64f86a154b09922baedcacd54331/365040fc190949aa8e750db5bbcf08c0.html]

## 6. User-defined functions

### 6.1 Execution types

- Three execution types: Single Values, All Values of Context, All Values of Queue; enum
  `ExecutionType.SINGLE_VALUE` / `ALL_VALUES_OF_CONTEXT` / `ALL_VALUES_OF_QUEUE`, default
  `SINGLE_VALUE`, in package `com.sap.ide.esr.tools.mapping.core`.
  [SAP✓ https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-US/52/46fc9c723d442a9fd9c5a0022f4069/content.htm]
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f41851eaca4c86e10000000a42189e/content.htm]
- Single Values "must return a String value"; context/queue functions "must return an object of
  type ResultList" (as a parameter). A method whose signature does not fit its execution type
  "will not be available in the expression editor, such functions are saved as a plain Java
  method". The package summary says: "simple functions expect single input values and return a
  string". [SAP✓ same 7.31 URL]
  [SAP✓ https://help.sap.com/doc/javadocs_nw73_sps05/7.3.5/en-US/PI/com/sap/aii/mappingtool/tf7/rt/package-summary.html]
- Argument types are `String`, `int` and `float` (the runtime converts, and failure raises an
  exception). Parameter types are `String`, `int` and `Channel`. Result type is `ResultList`.
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f41851eaca4c86e10000000a42189e/content.htm]
- Advanced functions get one context or the whole queue as arrays. The arrays leave out the
  context changes at the start and end ("implicitly always available and cannot be identified or
  deleted"); output context changes must be added explicitly. Older releases choose this with the
  "Save Entire Queue in Cache" checkbox. Whole-queue mode "is more memory-intensive and is not
  suitable for very large messages".
  [SAP✓ https://help.sap.com/saphelp_em900/helpdata/en/4b/fbd21666d33de4e10000000a42189e/content.htm]
  [SAP✓ https://help.sap.com/saphelp_crm70/helpdata/en/40/7b8e40496f6f1de10000000a1550b0/content.htm]
- Annotations (7.31+): `@LibraryMethod(title, category, type, description)`, `@Argument`,
  `@Parameter`, `@Init` and `@Cleanup` (example signature: `GlobalContainer` argument).
  **Corrected:** the first pass said `@Argument` is not needed for `Container`/`ResultList`
  arguments. The page says the annotation "is not required for arguments of type Channel and
  ResultList". [SAP✗ https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-US/52/46fc9c723d442a9fd9c5a0022f4069/content.htm]
  `init`/`cleanUp` run before and after the whole mapping, in library order.
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f41851eaca4c86e10000000a42189e/content.htm]
- Signature shapes. SAP single-value example:
  `public String appendAfterTrim(@Argument String in1, @Argument String in2)`, with no
  `Container` [SAP✓ same 7.31 URL]. SAP context example:
  `public void myCreateIf(String[] a, ResultList result, Container container)`
  [SAP✓ https://help.sap.com/saphelp_em92/helpdata/en/4b/f416e1eaca4c86e10000000a42189e/content.htm].
  The community example `counterContext(String[] CONTEXT, String[] ELEMENT, ResultList, Container)`
  stays [COMM].

### 6.2 `ResultList` (`com.sap.aii.mappingtool.tf7.rt.ResultList`)

- Methods `addValue` (`String` in the 7.x library pages, `Object` in the 7.50 Javadoc),
  `addContextChange()`, `addSuppress()`, `clear()`. Constants `CC`, `SUPPRESS`, `XSI_NIL`.
  `addValue(ResultList.CC)` has the same effect as `addContextChange()`. Input arrays may be
  tested with `a[i].equals(ResultList.CC)`.
  [SAP✓ https://help.sap.com/doc/javadocs_nw75_sps04/7.5.4/en-US/PI/com/sap/aii/mappingtool/tf7/rt/ResultList.html]
  [SAP✓ https://help.sap.com/doc/saphelp_nw74/7.4.16/en-us/4b/f416e1eaca4c86e10000000a42189e/content.htm]
- **Corrected:** the first pass said an older page has `addContextChange` append SUPPRESS. The
  SNC 7.0 page actually says "addContextChange(); Appends a context change to the list". The
  search excerpt had merged two table rows.
  [SAP✗ https://help.sap.com/saphelp_snc70/helpdata/en/7d/028c4057d5701de10000000a1550b0/content.htm]
- The Javadoc text for `XSI_NIL` reads "This constant represents the suppress value". That looks
  like a copy-paste error (its literal value differs from SUPPRESS); see ambiguity 14.
  [SAP✓ ResultList Javadoc above]
- CPI equivalent `com.sap.it.api.mapping.Output`: `addValue`, `addContextChange`, `addSuppress`,
  `addXSINIL`, `clear`, `isContextChange`, `isSuppress`, `isXSINIL`.
  [SAP✓ https://help.sap.com/doc/d47441d304c14a0ab9d3986c1b553a1e/Cloud/en-US/index-all.html]

### 6.3 `Container` / `GlobalContainer`

- `Container` (7.50): `getParameter`/`setParameter` (a cache per UDF; `null` if absent),
  `getTrace()`, `getGlobalContainer()`, `getInputHeader`, `getOutputHeader`,
  `getInputParameters`, `getOutputParameters`, `getTransformationParameters()` ("Deprecated. use
  getInputParameters() instead"; in 7.1 it returned the `StreamTransformationConstants` map).
  [SAP✓ https://help.sap.com/doc/javadocs_nw75_sps06/7.5.6/en-US/PI/com/sap/aii/mappingtool/tf7/rt/Container.html]
  [SAP✓ https://help.sap.com/saphelp_nwpi71/helpdata/EN/78/b4ea10263c404599ec6edabf59aa6c/content.htm]
- `GlobalContainer`: "A message mapping has exactly one global container during the execution";
  "the sequence in which user-defined functions are called is predefined. It depends on the
  position of the target fields … The fields are processed from top to bottom, starting at the
  root node." (This is on the GlobalContainer Javadoc, not on the Container page cited in the
  first pass.)
  [SAP✓ https://help.sap.com/doc/javadocs_nw75_sps06/7.5.6/en-US/PI/com/sap/aii/mappingtool/tf7/rt/GlobalContainer.html]
- UDFs must be stateless with respect to external systems (no DB writes, threads, file I/O,
  class loaders; J2EE/EJB restrictions apply).
  [SAP✓ https://help.sap.com/doc/javadocs_nw73_sps05/7.3.5/en-US/PI/com/sap/aii/mappingtool/tf7/rt/package-summary.html]

## 7. Open ambiguities (numbering kept from the first pass)

1. **Source access** — *resolved.* All cited SAP pages were read in this session (method above).
   learning.sap.com stays unread. Its single claim (`removeContexts`, `exists`) is covered by
   other SAP pages.
2. **Target creation algorithm** — *partially resolved.* Documented: one context per parent
   occurrence; values beyond `maxOccurs` are lost; fewer than `minOccurs` → exception (direct
   mapping); contexts beyond the parent's occurrences are not used; SUPPRESS slots use up their
   child context (inferred from the createIf example); generating functions on targets follow
   minOccurs (§2, §1.1). Open: what happens when a child queue has **fewer** contexts than the
   parent has occurrences, and whether `minOccurs` checks count SUPPRESS. *Needs an observed PO
   run.*
3. **Last-value reuse** — *partially resolved.* The SAP figure shows reuse inside a context
   only, with each context starting fresh. Open: reuse when one input's context is **empty**,
   when the last value read is SUPPRESS, and whether single-value UDFs behave like `concat`.
   *Needs an observed PO run.*
4. **SUPPRESS propagation** — *partially resolved.* SAP: standard functions "do not skip" a
   SUPPRESS input. The ifWithoutElse example shows `concat` putting SUPPRESS in that slot while
   using up the other input's value. `collapseContexts` treats SUPPRESS as an empty context, which
   becomes "". `sortByKey` numeric keys must not be SUPPRESS. Open: the rest of the catalogue,
   and `removeContexts` (community sources conflict, §3). *Needs an observed PO run per
   function.*
5. **`addContextChange` vs SUPPRESS** — *resolved.* It appends a context change on every SAP
   page. The first-pass excerpt was a misreading (§6.2).
6. **Empty contexts** — *partially resolved.* An empty context is a context with no values; an
   `<A/>` without children yields one. `mapWithDefault` fills empty contexts (SAP example).
   `collapseContexts` turns them into "". `formatByExample` does not count them but keeps them.
   Open: whether `removeContexts` drops them (assumed yes, nothing to keep; not stated), whether a
   SUPPRESS-only context counts as empty for `mapWithDefault`, and the exact `SplitByValue` "tag
   without a value" mode. *Needs an observed PO run.*
7. **`exists`** — *partially resolved.* Doc: true if the field "exists in the XML instance". The
   `mapWithDefault ≡ If([]field, exists([]field), Constant)` equivalence implies `exists` gives
   false for an empty context and true per present value. Not stated outright. *Needs an
   observed PO run* (does it give one value per context or per value?).
8. **`createIf`** — *resolved.* true → "", false → SUPPRESS (SAP ResultList page), applied per
   value (`myCreateIf` loops over the context).
9. **`sort` / `sortByKey` options** — *resolved.* Stable; numeric or lexicographic;
   case-sensitive or not; ascending or descending; per context (STD).
10. **`useOneAsMany`** — *partially resolved.* Roles of the three inputs are now from SAP (§4).
    Error conditions (count mismatches, empty contexts) are not on SAP pages. *Needs an observed
    PO run.*
11. **`ifWithoutElse` "Keep SUPPRESS Values"** — *partially resolved.* SAP confirms the parameter
    choice (empty string vs SUPPRESS) and both behaviours. The UI label and the reported PI 7.1
    defect stay [COMM]. *Observed PO 7.5 run needed* to confirm the current behaviour.
12. **Full catalogue** — *resolved* (§5). Function parameter dialogs beyond those described are
    not documented in detail.
13. **Statistics / `counter` scope** — *resolved.* `sum`/`average`/`count` per context; `index`
    has a per-context reset option; `counter` counts calls of the target-field mapping.
14. **`XSI_NIL`** — *open.* The constant exists (`"_!xSi#NiL$_"`), the Javadoc description is a
    copy of SUPPRESS's, and CPI has `addXSINIL`. No SAP page read describes what the target
    serializer writes (presumably `xsi:nil="true"`). *Needs an observed PO run or an SAP page on
    nil handling in message mapping.*
15. **UDF null handling** — *open.* No SAP page read says what a single-value UDF receives for a
    missing field or a SUPPRESS slot. *Needs an observed PO run.*
16. **(new) `collapseContexts` figure vs text** — *open.* The text says "first value"; the
    figure on the 7.11/CRM page reads, in SAP's right-to-left queue drawing (as in the Advanced
    UDF figure), `3,2 | 10,11,43,2 | 7` → `2,2,7`, i.e. the last value. Trust the text (it
    repeats in STD and on the SAP-hosted wiki) unless a PO run shows otherwise.
    https://help.sap.com/saphelp_nwpi711/helpdata/en/4b/d11e3e1c3b120ae10000000a114084/content.htm
