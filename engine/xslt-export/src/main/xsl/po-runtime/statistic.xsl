<?xml version="1.0" encoding="UTF-8"?>
<!-- The function family statistic (ADR-0025 "Families", F-15), #75: each is po:<catalogue name>,
     its args in FunCall order, and one that can raise a data error takes its box last and raises
     through po:data-error (ADR-0026), as the runtime's StatisticFamily does. A number is read in
     the xs:decimal lexical form, XML whitespace around it ignored, anything else is err:FORG0001 at
     the box; a result is written in the XPath canonical form. SUPPRESS is no value: no function
     reads, counts or numbers it (an assumed reading). The build joins core.xsl and the family
     modules, the families by id, into the helper module po-runtime.xsl, of which this comment is no
     part. A family module uses what core.xsl declares and nothing of another family, and holds
     core.xsl's root start tag, byte for byte. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    xmlns:err="http://www.w3.org/2005/xqt-errors"
    exclude-result-prefixes="#all">

  <!-- The xs:decimal that $text writes, for the function $function, as the runtime's
       StatisticFunctions.decimal reads it: the cast ignores XML whitespace around the lexical
       form. Anything else is err:FORG0001 at $box. -->
  <xsl:function name="po:statistic-number" as="xs:decimal">
    <xsl:param name="function" as="xs:string"/>
    <xsl:param name="text" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        if ($text castable as xs:decimal) then xs:decimal($text)
        else po:data-error(xs:QName('err:FORG0001'), $box,
                           $function || ': &quot;' || $text || '&quot; is no xs:decimal')"/>
  </xsl:function>

  <!-- average: per context of $values, one context holding the sum of its values divided by their
       count, by Saxon-HE's decimal division (ADR-0005), as the runtime's
       StatisticFunctions.average divides; a context without a value gives an empty context (an
       assumed reading). -->
  <xsl:function name="po:average" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($values)
        return let $numbers := $values($c)[. instance of xs:string]
                               ! po:statistic-number('average', ., $box)
               return [if (empty($numbers)) then ()
                       else string(sum($numbers) div count($numbers))])"/>
  </xsl:function>

  <!-- count: per context of $values, one context holding the number of its values, '' and text
       that is no number included. -->
  <xsl:function name="po:count" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($values)
        return [string(count($values($c)[. instance of xs:string]))])"/>
  </xsl:function>

  <!-- counter: the values of the whole of $values numbered from $initial by $increment, as
       po:index without a reset. -->
  <xsl:function name="po:counter" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="initial" as="xs:string"/>
    <xsl:param name="increment" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence
        select="po:statistic-numbers('counter', $values, $initial, $increment, false(), $box)"/>
  </xsl:function>

  <!-- index: the values of each context of $values numbered from $initial by $increment, or those
       of the whole queue when $reset is never. -->
  <xsl:function name="po:index" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="initial" as="xs:string"/>
    <xsl:param name="increment" as="xs:string"/>
    <xsl:param name="reset" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="po:statistic-numbers('index', $values, $initial, $increment,
                                               $reset eq 'eachContext', $box)"/>
  </xsl:function>

  <!-- The numbering of po:index and po:counter, as the runtime's StatisticFunctions.index does:
       the k-th value of a context, counting from 0, or of the whole queue unless $reset, becomes
       $initial + k * $increment, and each SUPPRESS stays at its slot without a number. Unless
       $initial and $increment are both xs:decimal, it raises err:FORG0001 at $box before it reads
       $values, as the runtime's binding does. -->
  <xsl:function name="po:statistic-numbers" as="array(item()*)">
    <xsl:param name="function" as="xs:string"/>
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="initial" as="xs:string"/>
    <xsl:param name="increment" as="xs:string"/>
    <xsl:param name="reset" as="xs:boolean"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:choose>
      <xsl:when test="not($initial castable as xs:decimal and $increment castable as xs:decimal)">
        <xsl:sequence select="po:data-error(xs:QName('err:FORG0001'), $box,
            $function || ': the parameters initial &quot;' || $initial || '&quot; and increment &quot;'
            || $increment || '&quot; are not both xs:decimal')"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:variable name="first" as="xs:decimal" select="xs:decimal($initial)"/>
        <xsl:variable name="step" as="xs:decimal" select="xs:decimal($increment)"/>
        <xsl:iterate select="1 to array:size($values)">
          <xsl:param name="numbered" as="xs:integer" select="0"/>
          <xsl:param name="result" as="array(item()*)" select="[]"/>
          <xsl:on-completion select="$result"/>
          <xsl:variable name="context" as="item()*" select="$values(.)"/>
          <xsl:variable name="before" as="xs:integer" select="if ($reset) then 0 else $numbered"/>
          <xsl:variable name="slots" as="item()*">
            <xsl:iterate select="$context">
              <xsl:param name="k" as="xs:integer" select="$before"/>
              <xsl:choose>
                <xsl:when test=". instance of xs:string">
                  <xsl:sequence select="string($first + $k * $step)"/>
                  <xsl:next-iteration>
                    <xsl:with-param name="k" select="$k + 1"/>
                  </xsl:next-iteration>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:sequence select="$po:SUPPRESS"/>
                </xsl:otherwise>
              </xsl:choose>
            </xsl:iterate>
          </xsl:variable>
          <xsl:next-iteration>
            <xsl:with-param name="numbered"
                select="$before + count($context[. instance of xs:string])"/>
            <xsl:with-param name="result" select="array:append($result, $slots)"/>
          </xsl:next-iteration>
        </xsl:iterate>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>

  <!-- sum: per context of $values, one context holding the sum of its values; a context without a
       value gives 0 (an assumed reading), as XPath's sum(()). -->
  <xsl:function name="po:sum" as="array(item()*)">
    <xsl:param name="values" as="array(item()*)"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="array:join(for $c in 1 to array:size($values)
        return [string(sum($values($c)[. instance of xs:string]
                           ! po:statistic-number('sum', ., $box)))])"/>
  </xsl:function>
</xsl:stylesheet>
