<?xml version="1.0" encoding="UTF-8"?>
<!-- The function family boolean (ADR-0025 "Families", F-15), #77 and #78: each is po:<catalogue
     name>, its args in FunCall order (the inputs, then the params), all single-value functions but
     the context function po:ifWithoutElse, none raising a data error. Only the exact text true is
     true; every other value, TRUE, 1 and the empty string included, is false, and a truth value is
     written true or false. That is an assumed reading (obs-boolean).
     po:isNil is true for the empty string, because the runtime reads xsi:nil as the empty string
     (ADR-0008). The build joins core.xsl and the family modules, the families by id, into the
     helper module po-runtime.xsl, of which this comment is no part. A family module uses what
     core.xsl declares and nothing of another family, and holds core.xsl's root start tag, byte for
     byte. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    xmlns:err="http://www.w3.org/2005/xqt-errors"
    exclude-result-prefixes="#all">

  <!-- and: true when $a and $b are both the text true. -->
  <xsl:function name="po:and" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:sequence select="string($a eq 'true' and $b eq 'true')"/>
  </xsl:function>

  <!-- equals: whether $a and $b are the same text, under the codepoint collation. -->
  <xsl:function name="po:equals" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:sequence select="string(compare($a, $b,
        'http://www.w3.org/2005/xpath-functions/collation/codepoint') eq 0)"/>
  </xsl:function>

  <!-- if: $then when $condition is the text true, else $else. -->
  <xsl:function name="po:if" as="xs:string">
    <xsl:param name="condition" as="xs:string"/>
    <xsl:param name="then" as="xs:string"/>
    <xsl:param name="else" as="xs:string"/>
    <xsl:sequence select="if ($condition eq 'true') then $then else $else"/>
  </xsl:function>

  <!-- ifWithoutElse: context i pairs context i of $condition and $then, and the result has as many
       as the one with the most; an empty or missing context gives an empty one; else the longer
       sets the slot count and the shorter reuses its last value, as po:lift pairs them. SUPPRESS
       in either gives SUPPRESS; else a $condition true gives the $then value, and any other gives
       SUPPRESS when $keepSuppressValues is true and no slot when it is false, as the runtime's
       BooleanFunctions.ifWithoutElse does (an assumed reading, obs-ifwithoutelse). -->
  <xsl:function name="po:ifWithoutElse" as="array(item()*)">
    <xsl:param name="condition" as="array(item()*)"/>
    <xsl:param name="then" as="array(item()*)"/>
    <xsl:param name="keepSuppressValues" as="xs:string"/>
    <xsl:sequence select="array:join(
        for $i in 1 to max(($condition, $then) ! array:size(.))
        return
          let $c := if ($i le array:size($condition)) then array:get($condition, $i) else (),
              $t := if ($i le array:size($then)) then array:get($then, $i) else (),
              $n := if (empty($c) or empty($t)) then 0 else max((count($c), count($t)))
          return [for $j in 1 to $n
                  return
                    let $test := $c[min(($j, count($c)))],
                        $value := $t[min(($j, count($t)))]
                    return if ($test instance of map(*) or $value instance of map(*))
                           then $po:SUPPRESS
                           else if ($test eq 'true') then $value
                           else if ($keepSuppressValues eq 'true') then $po:SUPPRESS
                           else ()])"/>
  </xsl:function>

  <!-- isNil: true for the empty string. -->
  <xsl:function name="po:isNil" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:sequence select="string($value eq '')"/>
  </xsl:function>

  <!-- not: true unless $value is the text true. -->
  <xsl:function name="po:not" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:sequence select="string($value ne 'true')"/>
  </xsl:function>

  <!-- notEquals: whether $a and $b are different text, under the codepoint collation. -->
  <xsl:function name="po:notEquals" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:sequence select="string(compare($a, $b,
        'http://www.w3.org/2005/xpath-functions/collation/codepoint') ne 0)"/>
  </xsl:function>

  <!-- or: true when $a or $b is the text true. -->
  <xsl:function name="po:or" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:sequence select="string($a eq 'true' or $b eq 'true')"/>
  </xsl:function>
</xsl:stylesheet>
