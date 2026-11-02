<?xml version="1.0" encoding="UTF-8"?>
<!-- The helper module every portable export imports (ADR-0023): the PO queue semantics as po:
     functions. A queue is an array(xs:string*) with one member per context, and a context
     function is po:<catalogue name>, its params in FunCall order (ADR-0025). Renaming this file,
     the po namespace or a function breaks exports already handed out. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    exclude-result-prefixes="#all">

  <!-- The values of context $parentSlot of $queue, of which TargetSlots creates its occurrences
       (ADR-0006): member $parentSlot of the queue, or () when the queue has no such context, as
       when the input's root is not the source root; at most $max of them, () for unbounded. -->
  <xsl:function name="po:slots" as="xs:string*">
    <xsl:param name="queue" as="array(xs:string*)"/>
    <xsl:param name="parentSlot" as="xs:integer"/>
    <xsl:param name="max" as="xs:integer?"/>
    <xsl:variable name="context" as="xs:string*"
        select="if ($parentSlot le array:size($queue)) then $queue($parentSlot) else ()"/>
    <xsl:sequence select="if (exists($max)) then subsequence($context, 1, $max) else $context"/>
  </xsl:function>

  <!-- collapseContexts: the first value of each context of $queue, '' for an empty context, all in
       one context. A queue with no context at all gives one empty context, as the runtime's
       ContextFunctions.collapseContexts does. -->
  <xsl:function name="po:collapseContexts" as="array(xs:string*)">
    <xsl:param name="queue" as="array(xs:string*)"/>
    <xsl:sequence select="[for $c in 1 to array:size($queue) return ($queue($c)[1], '')[1]]"/>
  </xsl:function>

  <!-- formatByExample: every value of $values, in order, cut into the contexts of $example, empty
       ones included, as the runtime's ContextFunctions.formatByExample does. Unless both hold as
       many values, empty contexts not counted, it raises po:FORMATBYEXAMPLE, where the runtime
       refuses the same inputs (#2 §4: the SAP documentation raises an exception). -->
  <xsl:function name="po:formatByExample" as="array(xs:string*)">
    <xsl:param name="values" as="array(xs:string*)"/>
    <xsl:param name="example" as="array(xs:string*)"/>
    <xsl:variable name="all" as="xs:string*" select="$values?*"/>
    <xsl:choose>
      <xsl:when test="count($all) ne count($example?*)">
        <xsl:sequence select="error(QName('urn:flottila:mapping:po', 'po:FORMATBYEXAMPLE'),
            'formatByExample: its inputs do not hold as many values')"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:iterate select="1 to array:size($example)">
          <xsl:param name="offset" as="xs:integer" select="0"/>
          <xsl:param name="result" as="array(xs:string*)" select="[]"/>
          <xsl:on-completion select="$result"/>
          <xsl:variable name="size" as="xs:integer" select="count($example(.))"/>
          <xsl:next-iteration>
            <xsl:with-param name="offset" select="$offset + $size"/>
            <xsl:with-param name="result"
                select="array:append($result, subsequence($all, $offset + 1, $size))"/>
          </xsl:next-iteration>
        </xsl:iterate>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>

  <!-- removeContexts: every value of $queue, in order, in one context. A queue with no context at
       all gives one empty context, as the runtime's ContextFunctions.removeContexts does. -->
  <xsl:function name="po:removeContexts" as="array(xs:string*)">
    <xsl:param name="queue" as="array(xs:string*)"/>
    <xsl:sequence select="[$queue?*]"/>
  </xsl:function>

  <!-- sort: each context of $queue in the order of $comparison and $order, as the runtime's
       ContextFunctions.sort does: the queue sorted by itself. Its data error is po:SORT. -->
  <xsl:function name="po:sort" as="array(xs:string*)">
    <xsl:param name="queue" as="array(xs:string*)"/>
    <xsl:param name="comparison" as="xs:string"/>
    <xsl:param name="order" as="xs:string"/>
    <xsl:sequence select="po:sort-contexts('sort', $queue, $queue, $comparison, $order)"/>
  </xsl:function>

  <!-- sortByKey: each context of $values in the order of the keys at the same places of $keys, as
       the runtime's ContextFunctions.sortByKey does. Its data error is po:SORTBYKEY. -->
  <xsl:function name="po:sortByKey" as="array(xs:string*)">
    <xsl:param name="keys" as="array(xs:string*)"/>
    <xsl:param name="values" as="array(xs:string*)"/>
    <xsl:param name="comparison" as="xs:string"/>
    <xsl:param name="order" as="xs:string"/>
    <xsl:sequence select="po:sort-contexts('sortByKey', $keys, $values, $comparison, $order)"/>
  </xsl:function>

  <!-- Each context of $values sorted by $keys, for the function $function. Its data error is
       po:<$function upper-cased>, one code per function (ADR-0025, #52), raised where the
       runtime's ContextFunctions raises it: for unequal numbers of contexts first, then context
       by context for a context with more or fewer keys than values, or, in a numeric sort, for a
       key that is no xs:decimal, even alone in its context. -->
  <xsl:function name="po:sort-contexts" as="array(xs:string*)">
    <xsl:param name="function" as="xs:string"/>
    <xsl:param name="keys" as="array(xs:string*)"/>
    <xsl:param name="values" as="array(xs:string*)"/>
    <xsl:param name="comparison" as="xs:string"/>
    <xsl:param name="order" as="xs:string"/>
    <xsl:variable name="contexts" as="xs:integer" select="array:size($values)"/>
    <xsl:variable name="defect" as="xs:string?" select="
        if (array:size($keys) ne $contexts) then 'the keys and the values differ in their contexts'
        else (for $c in 1 to $contexts
              return if (count($keys($c)) ne count($values($c)))
                     then 'a context has more or fewer keys than values'
                     else if ($comparison eq 'numeric'
                              and (some $k in $keys($c) satisfies not($k castable as xs:decimal)))
                     then 'a numeric sort meets a key that is no xs:decimal' else ())[1]"/>
    <xsl:sequence select="
        if (exists($defect))
        then error(QName('urn:flottila:mapping:po', 'po:' || upper-case($function)),
                   $function || ': ' || $defect)
        else array:join(for $c in 1 to $contexts
                        return [po:sortByKey-context($keys($c), $values($c), $comparison, $order)])"/>
  </xsl:function>

  <!-- One context of sortByKey. fn:sort is stable; descending sorts the reversed positions and
       reverses the result, so that equal keys keep their input order either way. -->
  <xsl:function name="po:sortByKey-context" as="xs:string*">
    <xsl:param name="keys" as="xs:string*"/>
    <xsl:param name="values" as="xs:string*"/>
    <xsl:param name="comparison" as="xs:string"/>
    <xsl:param name="order" as="xs:string"/>
    <xsl:variable name="key" as="function(xs:integer) as xs:anyAtomicType*"
        select="function($i as xs:integer) as xs:anyAtomicType* {
                  po:sort-key($keys[$i], $comparison) }"/>
    <xsl:variable name="positions" as="xs:integer*" select="
        if ($order eq 'descending') then reverse(sort(reverse(1 to count($keys)), (), $key))
        else sort(1 to count($keys), (), $key)"/>
    <xsl:sequence select="for $i in $positions return $values[$i]"/>
  </xsl:function>

  <!-- The sort key of $value, which fn:sort compares item by item, a shorter key first when it is
       a prefix, and never through a collation:
       - numeric: the xs:decimal;
       - caseInsensitive: per code point, po:fold-case, in code point order, as Java's
         String.compareToIgnoreCase compares;
       - otherwise, lexicographic: per code point, U+E000 to U+FFFF moved above U+10FFFF, so that
         the keys compare as Java's String.compareTo compares UTF-16 code units, where a
         supplementary character's high surrogate (D800-DBFF) comes before U+E000. -->
  <xsl:function name="po:sort-key" as="xs:anyAtomicType*">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="comparison" as="xs:string"/>
    <xsl:sequence select="
        if ($comparison eq 'numeric') then xs:decimal($value)
        else if ($comparison eq 'caseInsensitive')
        then string-to-codepoints($value) ! po:fold-case(.)
        else string-to-codepoints($value) ! (if (. ge 57344 and . le 65535) then . + 1114112 else .)"/>
  </xsl:function>

  <!-- Java's Character.toLowerCase(Character.toUpperCase($codepoint)), the simple case mappings.
       XPath's upper-case and lower-case are the full mappings; where one gives several characters
       (ß to SS) the simple mapping leaves the character as it is. U+0130 is the one character whose
       full lower case has two characters (i and U+0307) but whose simple lower case is i. The
       processor's Unicode version must be the runtime's for the two to agree everywhere. -->
  <xsl:function name="po:fold-case" as="xs:integer">
    <xsl:param name="codepoint" as="xs:integer"/>
    <xsl:variable name="char" as="xs:string" select="codepoints-to-string($codepoint)"/>
    <xsl:variable name="upper" as="xs:string"
        select="(upper-case($char)[string-length(.) eq 1], $char)[1]"/>
    <xsl:sequence select="if ($codepoint eq 304) then 105
        else string-to-codepoints((lower-case($upper)[string-length(.) eq 1], $upper)[1])"/>
  </xsl:function>

  <!-- splitByValue: each context of $queue split on its own, as the runtime's
       ContextFunctions.splitByEachValue, splitByValueChange and splitByEmptyValue do. The input's
       context boundaries stay, and an empty context stays one empty context. -->
  <xsl:function name="po:splitByValue" as="array(xs:string*)">
    <xsl:param name="queue" as="array(xs:string*)"/>
    <xsl:param name="mode" as="xs:string"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($queue)
                                     return po:splitByValue-context($queue($c), $mode))"/>
  </xsl:function>

  <!-- One context of splitByValue, as an array of the contexts it gives. emptyValue: every ""
       ends a context and starts one, and is dropped. eachValue: every value starts a context.
       Otherwise, valueChange: a value starts a context when it is not eq the value before it,
       which under the default Unicode codepoint collation is the runtime's String.equals. -->
  <xsl:function name="po:splitByValue-context" as="array(xs:string*)">
    <xsl:param name="context" as="xs:string*"/>
    <xsl:param name="mode" as="xs:string"/>
    <xsl:variable name="n" as="xs:integer" select="count($context)"/>
    <xsl:choose>
      <xsl:when test="$mode eq 'emptyValue'">
        <xsl:variable name="cuts" as="xs:integer*" select="0, index-of($context, ''), $n + 1"/>
        <xsl:sequence select="array:join(for $k in 1 to count($cuts) - 1
            return [subsequence($context, $cuts[$k] + 1, $cuts[$k + 1] - $cuts[$k] - 1)])"/>
      </xsl:when>
      <xsl:when test="$n eq 0">
        <xsl:sequence select="[()]"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:variable name="starts" as="xs:integer*" select="1, for $i in 2 to $n
            return $i[$mode eq 'eachValue' or $context[$i] ne $context[$i - 1]]"/>
        <xsl:variable name="ends" as="xs:integer*" select="tail($starts), $n + 1"/>
        <xsl:sequence select="array:join(for $k in 1 to count($starts)
            return [subsequence($context, $starts[$k], $ends[$k] - $starts[$k])])"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>

  <!-- useOneAsMany: value k of $value, counted across its contexts, once per value of context k of
       $occurrences, in order, cut into the contexts of $contexts, as the runtime's
       ContextFunctions.useOneAsMany does. Unless $value has one value per context of $occurrences
       and $contexts as many values as $occurrences, it raises po:USEONEASMANY, where the runtime
       refuses the same inputs (an assumed reading, #2 §7.10). -->
  <xsl:function name="po:useOneAsMany" as="array(xs:string*)">
    <xsl:param name="value" as="array(xs:string*)"/>
    <xsl:param name="occurrences" as="array(xs:string*)"/>
    <xsl:param name="contexts" as="array(xs:string*)"/>
    <xsl:variable name="values" as="xs:string*" select="$value?*"/>
    <xsl:variable name="repeated" as="xs:string*"
        select="for $k in 1 to array:size($occurrences) return $occurrences($k) ! $values[$k]"/>
    <xsl:sequence select="
        if (count($values) ne array:size($occurrences) or count($repeated) ne count($contexts?*))
        then error(QName('urn:flottila:mapping:po', 'po:USEONEASMANY'),
                   'useOneAsMany: the counts of its inputs do not agree')
        else array:join(
          for $c in 1 to array:size($contexts)
          return [subsequence($repeated,
                              sum(for $j in 1 to $c - 1 return count($contexts($j))) + 1,
                              count($contexts($c)))])"/>
  </xsl:function>
</xsl:stylesheet>
