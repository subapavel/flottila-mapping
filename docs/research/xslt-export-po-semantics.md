# Exporting SAP PO queue semantics to readable XSLT 3.0

Research note for issue #15 ("Can PO queue semantics be exported to readable XSLT 3.0?"),
2026-10-30. Input semantics: the resolved #2 note
(`docs/research/po-mapping-semantics.md` on branch `research/po-mapping-semantics`, "Second
pass" and §7). Worked examples, the helper module and their observed outputs are in
[`xslt-export-po-semantics/`](xslt-export-po-semantics/).

## How the sources were read

- **W3C specs.** `www.w3.org` is refused by this session's egress proxy (`connect_rejected`,
  and `WebFetch` gets `ENOTFOUND`). The specs were read from their **XML sources** in the W3C
  repository `w3c/qtspecs` (via `raw.githubusercontent.com`): `specifications/xslt-30/src/xslt.xml`
  (header `REC-xslt-30`, "W3C Recommendation"), `specifications/xpath-functions-31/src/`
  (`doc.stage "REC"`, plus `function-catalog.xml`), `specifications/xpath-datamodel-31/src/xpath-datamodel.xml`
  and the shared XPath/XQuery `specifications/xquery-31/src/expressions.xml`. The published
  pages are generated from these files, so the `id`s are the published anchors. Section numbers
  for XSLT 3.0, F&O 3.1 and XDM 3.1 were counted from the `div` structure of the sources; for
  XPath 3.1 only anchors are given (the shared source also holds XQuery-only sections, so
  counting would give XQuery numbers).
- **Saxonica docs.** `saxonica.com` is refused too; Context7 `/websites/saxonica_documentation12`
  returned only the editions overview ("The Home Edition is open source under the Mozilla Public
  License 2.0. Saxon-PE adds support for optional W3C features"). Every HE capability below is
  therefore **observed** by running the HE jar itself (Saxon-HE 12.5 and 13.1 from Maven
  Central, scratch dir outside the repo), not taken from docs.
- Citation tags: `[XSLT30 §n #id]`, `[FO31 §n #id]`, `[XDM31 §n #id]`, `[XP31 #id]` (base URLs
  `https://www.w3.org/TR/xslt-30/`, `/xpath-functions-31/`, `/xpath-datamodel-31/`,
  `/xpath-31/`); `[HE-OBS]` observed in a Saxon-HE run (log named); `[#2 §n]` the #2 note,
  relying on its `SAP✓` claims; `[AMB n]` depends on open or partial ambiguity *n* of #2 §7.

## 0. Answer

**Yes, with helpers.** Every PO construct in scope maps to XSLT 3.0 that Saxon-HE runs, if the
export imports one small, fixed helper module (`po-runtime.xsl`, 25 `xsl:function`s, 272 lines
in the sketch). The generated part of a stylesheet then reads like the target structure: one
nested `xsl:for-each` per target field, one variable per target field mapping whose expression
mirrors the function graph. Five worked examples reproduce SAP-documented results in Saxon-HE
12.5 and 13.1 (§7, `VERIFIED_PASS`).

**Recommended queue representation:** a queue is `array(item()*)`, one array member per
context, each member the context's values in order; `()` is an empty context; values are
`xs:string`; SUPPRESS is a distinguished map item `$po:SUPPRESS`; a context change has no
sentinel at all (it is the member boundary). A constant is a bare `xs:string` where a queue is
expected.

What does **not** export faithfully: Java UDF bodies (stub plus hand-written XSLT body, §6), Java
number-to-string and float arithmetic choices, Java `SimpleDateFormat` dates, and Java UTF-16
string ordering. Several helpers also encode open #2 ambiguities (§9). Because the engine and
the exporter would encode the *same* reading, a differential case cannot catch a wrong reading;
only the golden corpus (observed PO behaviour) can.

## 1. What Saxon-HE offers (observed)

Probe stylesheet calling `system-property('xsl:…')` and using each feature
(`target/15-saxon-he-probes.log`, not committed; `VERIFIED_PASS`):

| Property / feature | HE 12.5 | HE 13.1 | Spec |
|---|---|---|---|
| `xsl:xpath-version` | 3.1 | 3.1 | [XSLT30 §27.7 #xpath31-feature] |
| `supports-higher-order-functions` | yes (inline function ran) | yes | [XSLT30 §27.8 #hof-feature] |
| `supports-dynamic-evaluation` (`xsl:evaluate` ran) | yes | yes | [XSLT30 §27.6 #dynamic-evaluation-feature] |
| `supports-streaming` | no | no | [XSLT30 §27.5 #streaming-feature] |
| `is-schema-aware` | no | no | [XSLT30 §27.2 #schema-aware-conformance] |
| Reflexive Java call `Q{java:java.lang.Math}abs` | `XPST0017 … Reflexive calls to Java methods are not available under Saxon-HE` | — | — |
| Integrated extension functions | `Processor.registerExtensionFunction(ExtensionFunction)` and `(ExtensionFunctionDefinition)` present (`javap` on the 12.5 jar) | — | — |

The Saxon-HE 12.5 POM declares "Mozilla Public License Version 2.0". Maven Central's latest
release is 13.1. The export needs maps, arrays and higher-order functions. All three are in HE.
Streaming and schema awareness are not, and the export needs neither.

## 2. Representing a queue in XDM (a)

Constraints from the specs:

- Sequences do not nest: "Sequences never contain other sequences; if sequences are combined,
  the result is always a 'flattened' sequence." [XDM31 §2.5 #sequences] A queue (contexts of
  values) therefore needs a container per context.
- "Unlike sequences, a member of an array can be any value (including a sequence or an array)."
  [XDM31 §2.8.3 #array-items] The square constructor keeps sequences as members:
  "`[ (), (27, 17, 0)]` creates an array with two members: () and the sequence (27, 17, 0)",
  while `array { (), (27, 17, 0) }` "creates an array with three members". [XP31 #id-array-constructors]
- "Atomization converts arrays to sequences" [XP31 #id-array-constructors]; a map cannot be
  atomized. Observed: `string-join(('a', map{…}), ',')` fails with `FOTY0013 … a map type, which
  cannot be atomized` [HE-OBS probes log].
- `xsl:for-each-group`: "A group is never empty." [XSLT30 §14.1 #xsl-for-each-group] Grouping
  alone cannot carry empty contexts, which PO has (`<A/>` with no children) [#2 §1].

| Option | Empty context | SUPPRESS | Per-context code | Verdict |
|---|---|---|---|---|
| **A. `array(item()*)`: member = context** | `()` member | marker item in the member | `array:for-each($q, function($c){…})`, `$q($i)` | **Recommended.** Context boundary is structural; `$q?*` is removeContexts. |
| B. `array(item())*`: sequence of arrays | `[]` | marker item | `for $c in $q return array{…}` | Equivalent power; a queue is not one item, so it cannot be a single map value or array member without wrapping; more brackets. |
| C. Flat sequence with CC sentinel (SAP `ResultList` style) | two adjacent CCs | marker item | `xsl:for-each-group group-ending-with`, or `xsl:iterate` | Closest to Java UDF arrays, but every function re-splits; empty contexts fight "a group is never empty". Use only at a UDF boundary if ever needed. |
| D. Temporary tree `<q><c><v>…</v><s/></c></q>` | `<c/>` | `<s/>` | XPath on nodes, templates | Most debuggable, XSLT 2.0-friendly; verbose expressions, node construction everywhere, values lose `xs:string` simplicity. |
| E. Map keyed by context index | missing key or `()` | marker | `map:for-each` | No ordering advantage over A; key order is implementation-dependent. [XDM31 §2.8.2 #map-items] |

**SUPPRESS marker.** `$po:SUPPRESS := map{'po:marker': 'SUPPRESS'}`, tested with
`$v instance of map(*)`. Against SAP's literal string `"_sUpPresSeD_"` [#2 §3]: it cannot
collide with data, and it cannot leak into output, because any string use of it fails at
run time (`FOTY0013`) instead of writing the marker text. An empty string stays a normal value
(the structure-field occurrence `""`, and createIf's true result) [#2 §1, §4]. `XSI_NIL` would
get a second marker map [AMB 14].

**Building queues from the source.** A context of a source field is "the values under one
occurrence of the parent" (GLOSSARY). In XPath the context choice is the point where `!` splits
the path:

```xpath
array:join(r/g ! [ x ! string() ])            (: x in its default context g   :)
array:join(orders/order ! [ itemGroup/name ! string() ])   (: name[context=order] :)
[ orders/order/itemGroup/name ! string() ]    (: root context = removeContexts :)
array:join(r ! [ g ! '' ])                     (: structure field g: one "" per occurrence :)
```

`[expr]` makes one member per parent occurrence, so a parent without children gives the empty
context. `array:join` [FO31 §17.3.11 #func-array-join] concatenates the one-member arrays. No
higher-order function is needed here.

## 3. Target creation (b)

PO creates target fields top-down: context *i* of a child queue belongs to the *i*-th entry of
the parent's queue. Each non-SUPPRESS value creates one occurrence, up to `maxOccurs`. SUPPRESS
creates nothing but uses up its child context. Contexts beyond the parent's entries are not
used. [#2 §2, "What a decision can rely on" 3–4] The GlobalContainer page says fields "are
processed from top to bottom, starting at the root node" [#2 §6.3].

Export: the helper `po:slots($q, $p)` returns the entries of context `$p` that create an
occurrence. Each is `map{'n': global slot number, 'v': value}`. The slot number counts every
entry of the earlier contexts and every SUPPRESS, so `?n` is the context index for the
children. The generated code nests one `xsl:for-each` per target field, in target order:

```xml
<out>                                                   <!-- 1..1, slot 1 -->
  <xsl:for-each select="po:slots($out.grp, 1)">          <!-- 0..n -->
    <grp>
      <xsl:for-each select="po:slots($out.grp.v, ?n)">   <!-- child context = parent slot -->
        <v><xsl:value-of select="?v"/></v>
      </xsl:for-each>
    </grp>
  </xsl:for-each>
</out>
```

- `maxOccurs = k`: `po:slots(…)[position() le k]` [XSLT30 §7.1 #for-each].
- `minOccurs = m`: `po:at-least($slots, m, 'path')` raises `error()` [FO31 §3.1.1 #func-error],
  as PO "throws an exception" [#2 §2]. Whether SUPPRESS counts toward the shortfall is open
  [AMB 2].
- Mandatory structure fields without a mapping (`n = minOccurs = maxOccurs`) become `n` literal
  copies. A generating function straight on a target emits `max(1, minOccurs)` copies [#2 §1.1].
- **`xsl:for-each` rather than template rules.** Template rules dispatch on the *source*
  node [XSLT30 §6.3 #applying-templates]. PO creation is driven by the *target* structure, and
  the "current item" is a slot map, not a node. Named templates (one per target subtree, with
  the slot number as a parameter) are the readable choice for deep or reused target types.
  For-each blocks are the choice for everything else.
- **Two tiers.** Where every field in a subtree uses default contexts and single-value
  functions, and each input has at most one value per context, the exporter could emit
  idiomatic `xsl:for-each select="Order/Item"` with no queues. Example 1 shows why this needs a
  proof rule: concat's last-value reuse depends on which input is longer *at run time*.
  Open question 2.

## 4. SUPPRESS and context-change sentinels (c)

- **Context change:** none in the representation. SAP's `ResultList.CC` [#2 §6.2] appears only
  if a queue UDF must see SAP's flat array (§6). Then an adapter flattens with a CC marker map.
- **SUPPRESS in functions:** `po:lift` (all multi-input value functions) gives SUPPRESS in a slot
  where any input is SUPPRESS and still uses up the other inputs' values, as in SAP's
  `concat(counter, ifWithoutElse)` example [#2 §3] [AMB 4 for the rest of the catalogue].
- **ifWithoutElse:** `keep-suppress = true()` (into a target field, or "synchronise") gives
  SUPPRESS. `false()` (empty-string else) gives nothing in that slot, so the slot is skipped
  [#2 §3] [AMB 11].
- **createIf:** true gives `''`, false gives SUPPRESS [#2 §4].
- **In target creation:** SUPPRESS consumes the child context (`po:slots` numbering).
  Example 3 reproduces SAP's createIf result, which depends on exactly this.
- **collapseContexts:** an empty or SUPPRESS-led context gives `''` [#2 §3, §4] [AMB 16].
- **Statistics:** SUPPRESS is ignored [AMB 4]. **removeContexts:** SUPPRESS is kept, and empty
  contexts vanish [AMB 4, 6].

## 5. Function table (d)

Buckets. **Clean:** one XPath expression over the representation. It may use the predicates
`po:is-suppress`/`po:bool`. **Helper:** needs an `xsl:function` with alignment or iteration
logic. **Hard:** the SAP result depends on Java behaviour that XPath does not provide, or on
unresolved semantics. "Observed" means checked in `checks-queue.xsl` or an example
(`VERIFIED_PASS`, §7).

| PO function (#2 §4–5) | Export | Bucket | Notes |
|---|---|---|---|
| removeContexts | `[ $q?* ]` [XP31 #id-unary-lookup] | clean | Observed. [AMB 4, 6] |
| SplitByValue, each value | `array:join($q?* ! [ . ])` [XP31 #id-map-operator] | clean | Observed (ex 4). |
| SplitByValue, value change | `xsl:for-each-group group-adjacent` per context [XSLT30 §14.1] | helper | Observed. Group key for SUPPRESS is a QName so it never equals a string. |
| SplitByValue, empty value | — | hard | Mode not documented [AMB 6]. |
| collapseContexts | `[ for $i in 1 to array:size($q) return … head($q($i)) … ]` | clean | Observed. First value per the SAP text [AMB 16]. |
| useOneAsMany | expand input 1 by input 2's counts, re-cut to input 3's shape | helper | Observed: reproduces SAP figure (ex 4). Error cases undocumented [AMB 10]. |
| formatByExample | `po:with-contexts-of`: `xsl:iterate` with an offset parameter [XSLT30 §7.2 #iterate] | helper | Observed. Count mismatch → `error()` (SAP✓ exception). |
| createIf | `array:for-each($q, function($c){ $c ! (if (po:bool(.)) then '' else $po:SUPPRESS) })` [FO31 §17.3.12 #func-array-for-each] | clean | Observed (ex 3). |
| exists | `array:for-each($q, function($c){ if (empty($c)) then 'false' else $c ! 'true' })` | clean | Granularity [AMB 7]. |
| mapWithDefault | `array:for-each($q, function($c){ if (empty($c)) then $d else $c })` | clean | Observed on SAP's own example `A\|B1,B2\|\|C\|\|D`. [AMB 6] |
| sort | `xsl:perform-sort` per context, stable by default [XSLT30 §13.1 #xsl-sort (`dt-stable`), §13.2 #creating-sorted-sequence] | helper | Observed stable descending. **Hard edge:** SAP sorts with Java string order (UTF-16 units), XPath codepoint collation [FO31 §5.3.2 #codepoint-collation] orders by code point. Observed: Java `"\uE000".compareTo("\uD83D\uDE00") = 1987` (U+E000 against U+1F600), XPath `compare(…) = -1`. Case-insensitive order also differs outside ASCII. |
| sortByKey | `array:for-each-pair` + positional `xsl:perform-sort` | helper | Observed. Count mismatch → `error()` (SAP✓). |
| ifWithoutElse | `po:if-without-else($c, $t, $keep)` via `po:lift` | helper | Observed both modes [AMB 11]. |
| sum, average | per context over `xs:decimal` [FO31 §14.5.5 #func-sum, §14.5.2 #func-avg] | helper; number→string **hard** | See below. |
| count | `array:for-each($q, function($c){ string(count($c[not(po:is-suppress(.))])) })` [FO31 §14.5.1] | clean | SUPPRESS ignored [AMB 4]. |
| concat (opt. separator) | `po:lift(($a, $b), concat#2)` [XP31 #id-named-function-ref] | helper | Observed: SAP figure (ex 1). |
| constants | a bare string argument, broadcast by `po:lift`; on a target, `max(1, minOccurs)` copies | clean | Observed (`lift constant`). |
| last-value reuse | inside `po:lift`: `$c[min(($k, count($c)))]` | helper | Observed. Empty context in one input → empty result context, and unequal context counts → missing contexts treated as empty [AMB 3]. |

In the requested list (18 rows): **8 clean, 9 helper, 1 hard** (SplitByValue empty-value
mode). The helper sum/average also has a hard part: formatting its output. sort has a hard edge (non-BMP and non-ASCII
case-insensitive ordering). Outside the list:

- **Hard:** arithmetic and statistics output, because SAP calculates in Java `float` or
  `BigDecimal` and cuts a trailing ".0" [#2 §5]. Observed: Java `4.2f-0.2f = 3.9999998`, and
  `xs:float` arithmetic gives the same `3.9999998`. Java `BigDecimal` gives `4.0` and
  `xs:decimal` gives `4`. SAP's own example states "4.2 − 0.2 = 4", so the sketch's `po:num`
  uses `xs:decimal`. Float mode would also need Java's layout: Java `Float.toString(1234567f) =
  "1234567.0"`, while `xs:float` prints `1.234567E6` (all in `target/15-saxon-he-probes.log`).
- **Hard:** date functions (`SimpleDateFormat` patterns and lenient parsing against
  `format-dateTime` pictures).
- **Hard:** `counter`, which counts calls, so it depends on how often PO evaluates the slot,
  including skipped empty-string else values.
- **Helper with edges:** FormatNum (`DecimalFormat` against `format-number`; both round
  half-to-even [FO31 §4.7.5 #formatting-the-number], but the picture syntax differs).
- **Helper:** 0-based text functions such as `indexOf`.
- **Helper:** Java `trim()` becomes `replace($s,'^\s+|\s+$','')`. That is exact for XML text,
  because XML 1.0 text can only hold the C0 characters TAB, LF and CR.
- **Clean:** FixValues (a map lookup), `index` (a positional calculation).
- **Stylesheet parameters:** sender and receiver.
- **Needs the table as data:** Value mapping.

## 6. User-defined functions (e)

| PO execution type [#2 §6.1] | `xsl:function` signature [XSLT30 §10.3 #stylesheet-functions] | Call site |
|---|---|---|
| Single Values: `String f(String a, String b)` | `udf:f($a as xs:string, $b as xs:string) as xs:string`. `int` maps to `xs:int`, `float` to `xs:float`, and a failed conversion raises `FORG0001` (PO: exception). | `po:lift(($qa, $qb), udf:f#2)`. Never called on SUPPRESS [AMB 15]. |
| All Values of Context: `void f(String[] a, ResultList r, Container c)` | `udf:f($a as item()*) as array(item()*)`. It returns ≥1 contexts because a ResultList may add context changes. The SAP edge CCs are already absent. | `po:per-context($q, udf:f#1)`. A multi-input variant aligns contexts by index. |
| All Values of Queue | `udf:f($a as array(item()*)) as array(item()*)` | direct |
| `@Parameter` (String/int/Channel) | extra parameter, bound by partial application `udf:f(?, 'x')` | HOF (available in HE) |

**What cannot be exported.**

- **The Java body.** It is not exported at all.
- **Mutable `Container`/`GlobalContainer` state.** That covers `setParameter` caches, state
  shared across calls in the top-to-bottom order, and `@Init`/`@Cleanup` [#2 §6.1, §6.3].
  XSLT functions have no ordered side effects: a stylesheet function "will return results
  that depend only on the supplied arguments" unless it calls a nondeterministic extension
  function [XSLT30 §10.3.7 #function-determinism].
- **Partial exports.** `getInputParameters`/headers can become `xsl:param`, and `getTrace` can
  become `xsl:message`.

**Fallbacks, observed in example 6:**

1. **Default:** the exporter writes a typed stub that fails loudly
   (`error(xs:QName('po:UDF-NOT-EXPORTED'), …)`). A hand-written XSLT body in a stylesheet that
   imports the export wins by import precedence. A stylesheet function applies "unless there is
   another stylesheet function with the same name and arity, and higher import precedence"
   [XSLT30 §10.3.1 #xsl-function-name]. The stub alone gives `exit=2` with the error. With the
   body it runs.
   - This has a bonus: the oracle then checks the Java UDF against an independent XSLT body.
2. **Opt-in, oracle runs only:** wrap the Java UDF as a Saxon-HE integrated extension function
   (`Processor.registerExtensionFunction`, present in HE). It runs, but it is
   processor-specific. The oracle is also no longer independent for that function: it checks
   only the queue plumbing around it.
3. Reflexive `java:` calls are **not** an option in HE (observed `XPST0017`).
4. A mapping with a stateful UDF is marked not exportable. It is then covered by the golden
   corpus only.

## 7. Worked examples (f)

All under `xslt-export-po-semantics/`. Run with `run-examples.sh` (`SAXON_CP` points at a
Saxon-HE jar plus xmlresolver outside the repo). Each `exN-*.out.xml` is the committed observed
output.

| # | Mapping | Expected (source) | Observed | Evidence |
|---|---|---|---|---|
| 1 | `grp ← g`, `v ← concat(x, y)`, inputs `1,2,3\|4,5,6` / `a,b\|c,d` | `1a,2b,3b\|4c,5d,6d` (SAP concat figure, #2 §1.1) | `1a,2b,3b\|4c,5d,6d` | VERIFIED_PASS |
| 2 | `debt ← payment` vs `debt ← removeContexts(payment)`, 3 Debitors with 2+3+2 payments | 2 debts (extra contexts not used) vs 7 debts with own ids (#2 §2) | 2 (`p1,p2`) vs 7 (`p1…p7`) | VERIFIED_PASS |
| 3 | `internalRequest/externalRequest ← createIf(equalsS(removeContexts(type), …))`, `initiator ← creator` | `externalRequest/initiator = creator2` (SAP createIf example, #2 §2) | `creator2`; queues `,S` / `S,` | VERIFIED_PASS |
| 4 | `item/type ← SplitByValue(useOneAsMany(type, name[context=order], name))` | `external,external\|external\|internal,internal\|external` (SAP figure, #2 §4) | identical display queue; items n1–n3 external, n4–n5 internal, n6 external | VERIFIED_PASS |
| 5 | per order: `mapWithDefault(note)`, `sum(amount)`, `count`, `sort(sku)`, `sortByKey(amount, sku)` desc | note `rush\|none\|none`; total `4` (SAP "4.2 − 0.2 = 4"); stable tie `c3` before `a1` | as expected; empty order: total `0`, lines `0` [AMB 6] | VERIFIED_PASS (formatting choice open) |
| 6 | Java single-value UDF `appendAfterTrim` + context UDF `myCreateIf` | stub fails, hand-written bodies run | stub `exit=2 po:UDF-NOT-EXPORTED`; impl gives `internalcreator1`, `externalcreator2`, one `<internal/>` | VERIFIED_PASS |
| — | `checks-queue.xsl`: 14 helper checks on literal queues | as in the #2 note | 14 × `ok` | VERIFIED_PASS |

Logs (not committed): `target/15-xslt-examples.log` (Saxon-HE 12.5) and
`target/15-xslt-examples-saxon13.log` (Saxon-HE 13.1, all outputs byte-identical to 12.5). Only
rows 1–4 and the mapWithDefault check compare against SAP-documented results. The rest compare
against the #2 note's reading, so they show that the XSLT does what the helper intends, not
what PO does.

Example 3, exported (the generated part; helpers from `po-runtime.xsl`):

```xml
<xsl:variable name="type"    select="po:remove-contexts(array:join(requests/request ! [ type ! string() ]))"/>
<xsl:variable name="creator" select="array:join(requests/request ! [ creator ! string() ])"/>
<xsl:variable name="out.externalRequest"
    select="po:create-if(po:lift(($type, 'external'), function($a, $b) { string($a eq $b) }))"/>
<out>
  <xsl:for-each select="po:slots($out.externalRequest, 1)">
    <externalRequest>
      <xsl:for-each select="po:slots($creator, ?n)[position() le 1]">
        <initiator><xsl:value-of select="?v"/></initiator>
      </xsl:for-each>
    </externalRequest>
  </xsl:for-each>
</out>
```

## 8. Readability verdict (g)

| Criterion | Met? | Evidence |
|---|---|---|
| R1 Layout mirrors the target structure, one block per target field, in order | yes | §3; ex 2, 4 |
| R2 Each target field mapping is one named variable reading like the function graph | yes | `po:split-by-value(po:use-one-as-many($type, $name.order, $name))` |
| R3 The context choice is visible in the source path | yes | split at `!` (§2) |
| R4 No sentinel or index arithmetic in generated code | yes | only `?n`/`?v` and `po:slots` |
| R5 Helpers are few, fixed, named after SAP functions | yes | 25 functions, 272 lines incl. comments |
| R6 Size | yes | 33–50 lines per example for 2–7 target fields |
| R7 Debuggable in SAP's own notation | yes | `po:show` prints `1a,2b,3b\|4c,5d,6d` like the display queue |
| R8 Concise types and lambdas | partly | `array(item()*)` everywhere (XSLT 3.0 has no type aliases); `equalsS` as an inline function; a `po:equals-s` helper family would fix it |
| R9 Simple 1:1 mappings look like hand-written XSLT | no (queue tier) | needs the direct tier with a proof rule (open question 2) |

**Verdict: readable with helpers.** A reviewer who knows XSLT 3.0 and the SAP function names can
follow the generated part. The queue machinery is confined to `po-runtime.xsl`.

## 9. Open questions for the decision

1. **Higher-order functions in exports.** Saxon-HE has them (observed). If Flottila's own XSLT
   front end must also compile exported stylesheets (round trip), that front end needs HOF,
   maps and arrays early. Otherwise the helpers need a HOF-free rewrite: possible for all but
   `po:lift`/`po:per-context`, which would become generated per-call-site functions.
2. **Direct tier.** Do we emit idiomatic `xsl:for-each select="Order/Item"` for proven-safe
   shapes? This needs a written proof rule. Wrong rules turn into differential cases that pass
   against a wrong export.
3. **Packaging the helpers:** `xsl:import` (used here), `xsl:use-package` (packages were
   `NOT_RUN` in HE, needs a package library configuration), or inlining for single-file oracle
   cases.
4. **Numbers.** Float mode or BigDecimal mode (SAP Note 958486, #2 §5)? `po:num` picks
   `xs:decimal` from SAP's own example. Needs an observed PO run.
5. **String order.** Accept codepoint order as a documented deviation, or emulate Java's UTF-16
   order (a key function or a custom collation, neither tried)?
6. **Shared misreadings.** Ambiguities #2 §7 2, 3, 4, 6, 7, 10, 11, 14, 15 and 16 are encoded
   in `po-runtime.xsl` (marked `AMBIGUITY n`). The engine will encode the same choices, and the
   differential oracle cannot separate them. Each needs a golden-corpus case from a PO run.
7. **Slot numbering.** Do entries beyond `maxOccurs` still use up child contexts (`po:slots`
   assumes yes)? Does SUPPRESS count toward `maxOccurs` (sketch: no)? [AMB 2]
8. **Display queue.** `po:show` could be the shared format for the display queue (GLOSSARY) and
   for oracle diffs at function-graph nodes, not only at the target.
