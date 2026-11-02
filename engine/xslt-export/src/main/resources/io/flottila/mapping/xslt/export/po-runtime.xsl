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
</xsl:stylesheet>
