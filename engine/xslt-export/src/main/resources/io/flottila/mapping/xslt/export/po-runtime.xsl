<?xml version="1.0" encoding="UTF-8"?>
<!-- The helper module every portable export imports (ADR-0023): the PO queue semantics as po:
     functions. A queue is an array(item()*) with one member per context; a value is an xs:string
     or $po:SUPPRESS, the marker of ADR-0004 (ADR-0025 since #51). A function of the catalogue is
     po:<catalogue name>, its args in FunCall order (ADR-0025). Renaming this file, the po
     namespace or a function breaks exports already handed out. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    exclude-result-prefixes="#all">

  <!-- SUPPRESS in a queue (ADR-0004): a map, so reading it as a string fails at once (FOTY0013).
       Every other value of a queue is an xs:string, so a function tells SUPPRESS by its type. -->
  <xsl:variable name="po:SUPPRESS" as="map(*)" select="map{'po:marker': 'SUPPRESS'}"/>

  <!-- The values of context $parentSlot of $queue, of which TargetSlots creates its occurrences
       (ADR-0006): member $parentSlot of the queue, or () when the queue has no such context, as
       when the input's root is not the source root. A SUPPRESS slot creates nothing and does not
       count toward $max: at most $max of the other values, () for unbounded. -->
  <xsl:function name="po:slots" as="xs:string*">
    <xsl:param name="queue" as="array(item()*)"/>
    <xsl:param name="parentSlot" as="xs:integer"/>
    <xsl:param name="max" as="xs:integer?"/>
    <xsl:variable name="created" as="xs:string*"
        select="(if ($parentSlot le array:size($queue)) then $queue($parentSlot) else ())
                [. instance of xs:string]"/>
    <xsl:sequence select="if (exists($max)) then subsequence($created, 1, $max) else $created"/>
  </xsl:function>

  <!-- Lift (ADR-0006): $body once per slot, getting each queue's value there in queue order, as
       the runtime's Lifting.lift does. Context i pairs context i of every queue, and the result has
       as many as the queue with the most; an empty or missing context gives an empty one; else
       the longest sets the slot count and a shorter queue reuses its last value. SUPPRESS among
       the values, reused or not, gives SUPPRESS without calling $body. -->
  <xsl:function name="po:lift" as="array(item()*)">
    <xsl:param name="queues" as="array(item()*)*"/>
    <xsl:param name="body" as="function(xs:string*) as xs:string"/>
    <xsl:sequence select="array:join(
        for $i in 1 to max($queues ! array:size(.))
        return
          let $contexts := $queues ! (if ($i le array:size(.)) then [array:get(., $i)] else [()]),
              $n := if (some $c in $contexts satisfies empty(array:get($c, 1))) then 0
                    else max($contexts ! count(array:get(., 1)))
          return [for $j in 1 to $n
                  return
                    let $in := $contexts ! (let $c := array:get(., 1)
                                            return $c[min(($j, count($c)))])
                    return if (some $v in $in satisfies $v instance of map(*)) then $po:SUPPRESS
                           else $body($in)])"/>
  </xsl:function>

  <!-- collapseContexts: the first value of each context of $queue, '' for an empty context, all in
       one context. A first value that is SUPPRESS gives '' too, as the runtime's
       ContextFunctions.collapseContexts does (an assumed reading). A queue with no context at all
       gives one empty context. -->
  <xsl:function name="po:collapseContexts" as="array(item()*)">
    <xsl:param name="queue" as="array(item()*)"/>
    <xsl:sequence select="[for $c in 1 to array:size($queue)
                           return (let $first := $queue($c)[1]
                                   return if ($first instance of xs:string) then $first else '')]"/>
  </xsl:function>

  <!-- createIf: per value of $queue, '' where it is 1 or true in any case, and $po:SUPPRESS for
       anything else, '' and SUPPRESS included, as the runtime's ContextFunctions.createIf does (an
       assumed reading); the contexts stay. lower-case maps no other character to t, r, u or e,
       so it agrees with Java's equalsIgnoreCase here. -->
  <xsl:function name="po:createIf" as="array(item()*)">
    <xsl:param name="queue" as="array(item()*)"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($queue)
        return [$queue($c) ! (if (not(. instance of xs:string)) then $po:SUPPRESS
                              else if (. eq '1' or lower-case(.) eq 'true') then ''
                              else $po:SUPPRESS)])"/>
  </xsl:function>

  <!-- formatByExample: every value of $values, in order, cut into the contexts of $example, empty
       ones included, as the runtime's ContextFunctions.formatByExample does; a SUPPRESS of $values
       stays at its slot, and a SUPPRESS of $example counts as a value (an assumed reading). Unless
       both hold as many values, empty contexts not counted, it raises po:FORMATBYEXAMPLE, where
       the runtime refuses the same inputs (#2 §4: the SAP documentation raises an exception). -->
  <xsl:function name="po:formatByExample" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="example" as="array(item()*)"/>
    <xsl:variable name="all" as="item()*" select="$values?*"/>
    <xsl:choose>
      <xsl:when test="count($all) ne count($example?*)">
        <xsl:sequence select="error(QName('urn:flottila:mapping:po', 'po:FORMATBYEXAMPLE'),
            'formatByExample: its inputs do not hold as many values')"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:iterate select="1 to array:size($example)">
          <xsl:param name="offset" as="xs:integer" select="0"/>
          <xsl:param name="result" as="array(item()*)" select="[]"/>
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

  <!-- removeContexts: every value of $queue, in order, in one context, SUPPRESS kept at its slot.
       A queue with no context at all gives one empty context, as the runtime's
       ContextFunctions.removeContexts does. -->
  <xsl:function name="po:removeContexts" as="array(item()*)">
    <xsl:param name="queue" as="array(item()*)"/>
    <xsl:sequence select="[$queue?*]"/>
  </xsl:function>

  <!-- replaceValue, a single-value function: $replacement, whatever $value is. -->
  <xsl:function name="po:replaceValue" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="replacement" as="xs:string"/>
    <xsl:sequence select="$replacement"/>
  </xsl:function>

  <!-- Whether the queue values $a and $b are equal, as the runtime's Objects.equals compares them:
       two strings when eq, under the default Unicode codepoint collation, which is String.equals;
       SUPPRESS equals SUPPRESS only. -->
  <xsl:function name="po:same-value" as="xs:boolean">
    <xsl:param name="a" as="item()"/>
    <xsl:param name="b" as="item()"/>
    <xsl:sequence select="if ($a instance of xs:string and $b instance of xs:string) then $a eq $b
                          else not($a instance of xs:string or $b instance of xs:string)"/>
  </xsl:function>

  <!-- splitByValue: each context of $queue split on its own, as the runtime's
       ContextFunctions.splitByEachValue, splitByValueChange and splitByEmptyValue do. The input's
       context boundaries stay, an empty context stays one empty context, and a SUPPRESS stays a
       value of its own in every mode. -->
  <xsl:function name="po:splitByValue" as="array(item()*)">
    <xsl:param name="queue" as="array(item()*)"/>
    <xsl:param name="mode" as="xs:string"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($queue)
                                     return po:splitByValue-context($queue($c), $mode))"/>
  </xsl:function>

  <!-- One context of splitByValue, as an array of the contexts it gives. emptyValue: every ""
       ends a context and starts one, and is dropped; SUPPRESS is no "". eachValue: every value
       starts a context. Otherwise, valueChange: a value starts a context when it is not the same
       value as the one before it (po:same-value). -->
  <xsl:function name="po:splitByValue-context" as="array(item()*)">
    <xsl:param name="context" as="item()*"/>
    <xsl:param name="mode" as="xs:string"/>
    <xsl:variable name="n" as="xs:integer" select="count($context)"/>
    <xsl:choose>
      <xsl:when test="$mode eq 'emptyValue'">
        <xsl:variable name="cuts" as="xs:integer*"
            select="0, (for $i in 1 to $n return $i[po:same-value($context[$i], '')]), $n + 1"/>
        <xsl:sequence select="array:join(for $k in 1 to count($cuts) - 1
            return [subsequence($context, $cuts[$k] + 1, $cuts[$k + 1] - $cuts[$k] - 1)])"/>
      </xsl:when>
      <xsl:when test="$n eq 0">
        <xsl:sequence select="[()]"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:variable name="starts" as="xs:integer*" select="1, for $i in 2 to $n
            return $i[$mode eq 'eachValue' or not(po:same-value($context[$i], $context[$i - 1]))]"/>
        <xsl:variable name="ends" as="xs:integer*" select="tail($starts), $n + 1"/>
        <xsl:sequence select="array:join(for $k in 1 to count($starts)
            return [subsequence($context, $starts[$k], $ends[$k] - $starts[$k])])"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>

  <!-- useOneAsMany: value k of $value, counted across its contexts, once per value of context k of
       $occurrences, in order, cut into the contexts of $contexts, as the runtime's
       ContextFunctions.useOneAsMany does; a SUPPRESS value is repeated as SUPPRESS, and a SUPPRESS
       of $occurrences counts as an occurrence. Unless $value has one value per context of
       $occurrences and $contexts as many values as $occurrences, it raises po:USEONEASMANY, where
       the runtime refuses the same inputs (an assumed reading, #2 §7.10). -->
  <xsl:function name="po:useOneAsMany" as="array(item()*)">
    <xsl:param name="value" as="array(item()*)"/>
    <xsl:param name="occurrences" as="array(item()*)"/>
    <xsl:param name="contexts" as="array(item()*)"/>
    <xsl:variable name="values" as="item()*" select="$value?*"/>
    <xsl:variable name="repeated" as="item()*"
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
