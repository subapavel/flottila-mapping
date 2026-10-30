<?xml version="1.0" encoding="UTF-8"?>
<!--
  Research sketch for issue #15: a helper module an exported mapping would import.
  Not production code. Semantics follow docs/research/po-mapping-semantics.md (#2 note);
  every choice that depends on an open ambiguity there is marked "AMBIGUITY n".

  Representation (see the note, section 2):
    queue   = array(item()*)   one member per context, in order
    context = item()*          the context's values, in order; () is an empty context
    value   = xs:string, or $po:SUPPRESS
    constant (generating function) = a bare xs:string passed where a queue is expected
-->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:map="http://www.w3.org/2005/xpath-functions/map"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">

  <!-- SUPPRESS is a map, not a string: it cannot collide with data, and any accidental
       string use of it fails with FOTY0013 instead of writing a bogus value. -->
  <xsl:variable name="po:SUPPRESS" as="map(*)" select="map{'po:marker': 'SUPPRESS'}"/>

  <xsl:function name="po:is-suppress" as="xs:boolean">
    <xsl:param name="v" as="item()"/>
    <xsl:sequence select="$v instance of map(*)"/>
  </xsl:function>

  <!-- SAP Boolean input: "1" and "true" (any case) are true, everything else false. -->
  <xsl:function name="po:bool" as="xs:boolean">
    <xsl:param name="v" as="item()"/>
    <xsl:sequence select="not(po:is-suppress($v)) and lower-case($v) = ('1', 'true')"/>
  </xsl:function>

  <!-- Display queue: "a,b|c" with SUPPRESS shown as S and an empty context as nothing. -->
  <xsl:function name="po:show" as="xs:string">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:sequence select="string-join(array:for-each($q, function($c) {
        string-join($c ! (if (po:is-suppress(.)) then 'S' else string(.)), ',') })?*, '|')"/>
  </xsl:function>

  <!-- ===== Node functions ===== -->

  <xsl:function name="po:remove-contexts" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <!-- Empty contexts vanish; SUPPRESS is kept. AMBIGUITY 4, 6. -->
    <xsl:sequence select="[ $q?* ]"/>
  </xsl:function>

  <xsl:function name="po:split-by-value" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <!-- "Each Value" mode: a context change after every value. -->
    <xsl:sequence select="array:join($q?* ! [ . ])"/>
  </xsl:function>

  <xsl:function name="po:split-by-value-change" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <!-- "Value change" mode, per existing context. SUPPRESS forms its own run. -->
    <xsl:sequence select="array:join(
        for $i in 1 to array:size($q) return po:runs($q($i)))"/>
  </xsl:function>

  <xsl:function name="po:runs" as="array(item()*)">
    <xsl:param name="c" as="item()*"/>
    <xsl:variable name="runs" as="array(item()*)*">
      <xsl:for-each-group select="$c"
          group-adjacent="if (po:is-suppress(.)) then xs:QName('po:S') else string(.)">
        <xsl:sequence select="[ current-group() ]"/>
      </xsl:for-each-group>
    </xsl:variable>
    <xsl:sequence select="if (empty($runs)) then [ () ] else array:join($runs)"/>
  </xsl:function>

  <xsl:function name="po:collapse-contexts" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <!-- First value of each context; an empty or SUPPRESS-led context becomes "".
         AMBIGUITY 16 (the SAP figure shows the last value). -->
    <xsl:sequence select="[ for $i in 1 to array:size($q)
                            return let $first := head($q($i))
                            return if (empty($first) or po:is-suppress($first)) then '' else $first ]"/>
  </xsl:function>

  <!-- Re-cut a flat value sequence into the context shape of $shape (formatByExample core). -->
  <xsl:function name="po:with-contexts-of" as="array(item()*)">
    <xsl:param name="values" as="item()*"/>
    <xsl:param name="shape" as="array(item()*)"/>
    <xsl:if test="count($values) ne count($shape?*)">
      <xsl:sequence select="error(xs:QName('po:FORMAT'),
          'value count ' || count($values) || ' does not match example count ' || count($shape?*))"/>
    </xsl:if>
    <xsl:iterate select="1 to array:size($shape)">
      <xsl:param name="offset" as="xs:integer" select="0"/>
      <xsl:param name="out" as="array(item()*)" select="[]"/>
      <xsl:on-completion select="$out"/>
      <xsl:variable name="n" select="count($shape(.))"/>
      <xsl:next-iteration>
        <xsl:with-param name="offset" select="$offset + $n"/>
        <xsl:with-param name="out" select="array:append($out, subsequence($values, $offset + 1, $n))"/>
      </xsl:next-iteration>
    </xsl:iterate>
  </xsl:function>

  <xsl:function name="po:format-by-example" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="example" as="array(item()*)"/>
    <xsl:sequence select="po:with-contexts-of($values?*, $example)"/>
  </xsl:function>

  <xsl:function name="po:use-one-as-many" as="array(item()*)">
    <xsl:param name="one" as="array(item()*)"/>   <!-- once-occurring field -->
    <xsl:param name="count" as="array(item()*)"/> <!-- repeating field in one's context -->
    <xsl:param name="shape" as="array(item()*)"/> <!-- repeating field, gives the contexts -->
    <!-- Error conditions are not documented by SAP (AMBIGUITY 10); a size mismatch
         surfaces only through po:with-contexts-of. -->
    <xsl:sequence select="po:with-contexts-of(
        for $i in 1 to array:size($one), $_ in $count($i) return head($one($i)), $shape)"/>
  </xsl:function>

  <xsl:function name="po:create-if" as="array(item()*)">
    <xsl:param name="cond" as="array(item()*)"/>
    <xsl:sequence select="array:for-each($cond, function($c) {
        $c ! (if (po:bool(.)) then '' else $po:SUPPRESS) })"/>
  </xsl:function>

  <xsl:function name="po:exists" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <!-- One "false" for an empty context, one "true" per value. AMBIGUITY 7. -->
    <xsl:sequence select="array:for-each($q, function($c) {
        if (empty($c)) then 'false' else $c ! 'true' })"/>
  </xsl:function>

  <xsl:function name="po:map-with-default" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:param name="default" as="xs:string"/>
    <!-- A SUPPRESS-only context is not empty here. AMBIGUITY 6. -->
    <xsl:sequence select="array:for-each($q, function($c) {
        if (empty($c)) then $default else $c })"/>
  </xsl:function>

  <!-- sort: per context, stable. $numeric parses like SAP (decimal), otherwise codepoints.
       Java String.compareTo orders UTF-16 code units, not code points (see note, 4). -->
  <xsl:function name="po:sort" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:param name="numeric" as="xs:boolean"/>
    <xsl:param name="descending" as="xs:boolean"/>
    <xsl:sequence select="array:for-each($q, function($c) {
        po:sort-context($c, $c, $numeric, $descending) })"/>
  </xsl:function>

  <xsl:function name="po:sort-by-key" as="array(item()*)">
    <xsl:param name="keys" as="array(item()*)"/>
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="numeric" as="xs:boolean"/>
    <xsl:param name="descending" as="xs:boolean"/>
    <xsl:sequence select="array:for-each-pair($keys, $values, function($k, $v) {
        if (count($k) ne count($v))
        then error(xs:QName('po:SORTBYKEY'), 'key/value count mismatch')
        else po:sort-context($k, $v, $numeric, $descending) })"/>
  </xsl:function>

  <xsl:function name="po:sort-context" as="item()*">
    <xsl:param name="keys" as="item()*"/>
    <xsl:param name="values" as="item()*"/>
    <xsl:param name="numeric" as="xs:boolean"/>
    <xsl:param name="descending" as="xs:boolean"/>
    <xsl:variable name="positions" as="xs:integer*">
      <xsl:perform-sort select="1 to count($keys)">
        <!-- xsl:sort without a stable attribute is stable (XSLT 3.0 13.1, dt-stable). -->
        <xsl:sort select="if ($numeric) then (for $p in . return xs:decimal($keys[$p])) else ()"
                  order="{if ($descending) then 'descending' else 'ascending'}"/>
        <xsl:sort select="if ($numeric) then () else (for $p in . return string($keys[$p]))"
                  collation="http://www.w3.org/2005/xpath-functions/collation/codepoint"
                  order="{if ($descending) then 'descending' else 'ascending'}"/>
      </xsl:perform-sort>
    </xsl:variable>
    <xsl:sequence select="for $p in $positions return $values[$p]"/>
  </xsl:function>

  <!-- ===== Lifting single-value functions over queues ===== -->

  <!-- Context i of the result pairs context i of every input. Inside a context the
       longest input decides the count and shorter inputs reuse their last value
       (SAP concat figure). A bare string is a constant and repeats. If any input
       context is empty the result context is empty (AMBIGUITY 3). SUPPRESS in any
       input gives SUPPRESS in that slot (AMBIGUITY 4). -->
  <xsl:function name="po:lift" as="array(item()*)">
    <xsl:param name="inputs" as="item()*"/>   <!-- each: array(item()*) or xs:string -->
    <xsl:param name="f" as="function(*)"/>
    <xsl:variable name="queues" select="$inputs[. instance of array(*)]"/>
    <xsl:sequence select="array:join(
        for $i in 1 to max(($queues ! array:size(.), 1))
        return let $ctx := array:join($inputs ! (if (. instance of array(*))
                                          then [ if ($i le array:size(.)) then .($i) else () ]
                                          else [ . ])),
                   $n := max(array:for-each($ctx, count#1)?*)
        return [ if (array:for-each($ctx, empty#1)?* = true()) then () else
                 for $k in 1 to $n
                 return let $args := array:for-each($ctx, function($c) { $c[min(($k, count($c)))] })
                 return if (some $a in $args?* satisfies po:is-suppress($a))
                        then $po:SUPPRESS
                        else apply($f, $args) ])"/>
  </xsl:function>

  <!-- Context UDF / context-wise function: $f gets one context and returns one or more
       contexts as an array (a ResultList may add context changes). -->
  <xsl:function name="po:per-context" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:param name="f" as="function(item()*) as array(item()*)"/>
    <xsl:sequence select="array:join(array:for-each($q, $f)?*)"/>
  </xsl:function>

  <!-- ifWithoutElse: true gives the then-value. False gives SUPPRESS when the queues
       must stay aligned (target field, or "keep SUPPRESS"), otherwise nothing. -->
  <xsl:function name="po:if-without-else" as="array(item()*)">
    <xsl:param name="cond" as="item()*"/>
    <xsl:param name="then" as="item()*"/>
    <xsl:param name="keep-suppress" as="xs:boolean"/>
    <xsl:sequence select="po:lift(($cond, $then), function($c, $t) {
        if (po:bool($c)) then $t else if ($keep-suppress) then $po:SUPPRESS else () })"/>
  </xsl:function>

  <!-- ===== Statistics (per context; SUPPRESS ignored, AMBIGUITY 4) ===== -->

  <!-- Number to string: xs:decimal arithmetic, matching SAP's own "4.2 - 0.2 = 4" example
       (BigDecimal mode). Float mode would need xs:float plus Java Float.toString layout.
       Open question in the note. -->
  <xsl:function name="po:num" as="xs:string">
    <xsl:param name="d" as="xs:decimal"/>
    <xsl:sequence select="string($d)"/>
  </xsl:function>

  <xsl:function name="po:sum" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:sequence select="array:for-each($q, function($c) {
        po:num(sum($c[not(po:is-suppress(.))] ! xs:decimal(.))) })"/>
  </xsl:function>

  <xsl:function name="po:count" as="array(item()*)">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:sequence select="array:for-each($q, function($c) {
        string(count($c[not(po:is-suppress(.))])) })"/>
  </xsl:function>

  <!-- ===== Target creation ===== -->

  <!-- The entries of context $p of $q that create a target occurrence. Each entry carries
       its global slot number 'n' (used as the context index of its children) and its value
       'v'. SUPPRESS entries create nothing but still take a slot number, so they use up
       the matching child context (SAP createIf example). -->
  <xsl:function name="po:slots" as="map(*)*">
    <xsl:param name="q" as="array(item()*)"/>
    <xsl:param name="p" as="xs:integer"/>
    <xsl:sequence select="
        if ($p gt array:size($q)) then () else
        let $before := sum((1 to $p - 1) ! count($q(.))),
            $c := $q($p)
        return for $k in 1 to count($c)
        return if (po:is-suppress($c[$k])) then () else map{ 'n': $before + $k, 'v': $c[$k] }"/>
  </xsl:function>

  <!-- minOccurs check (SAP: too few occurrences raise an exception). Whether SUPPRESS
       counts towards the shortfall is AMBIGUITY 2. -->
  <xsl:function name="po:at-least" as="map(*)*">
    <xsl:param name="slots" as="map(*)*"/>
    <xsl:param name="min" as="xs:integer"/>
    <xsl:param name="field" as="xs:string"/>
    <xsl:sequence select="if (count($slots) ge $min) then $slots
        else error(xs:QName('po:MINOCCURS'), $field || ': ' || count($slots) || ' &lt; minOccurs ' || $min)"/>
  </xsl:function>

</xsl:stylesheet>
