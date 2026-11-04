<?xml version="1.0" encoding="UTF-8"?>
<!-- The function family arithmetic (ADR-0025 "Families", F-15), the math functions of #73: each is
     po:<catalogue name>, its args in FunCall order, and it takes its box last because it can raise
     a data error through po:data-error (ADR-0026). A number is read in the xs:decimal lexical form
     only, whitespace around it ignored, anything else is err:FORG0001 at the box; a result is
     written in the XPath canonical form, as the runtime's ArithmeticFamily writes it. The build
     joins core.xsl and the family modules, the families by id, into the helper module
     po-runtime.xsl, of which this comment is no part. A family module uses what core.xsl declares
     and nothing of another family, and holds core.xsl's root start tag, byte for byte. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    xmlns:err="http://www.w3.org/2005/xqt-errors"
    exclude-result-prefixes="#all">

  <!-- The xs:decimal that $text writes for the function $function, or err:FORG0001 at $box. -->
  <xsl:function name="po:math-number" as="xs:decimal">
    <xsl:param name="function" as="xs:string"/>
    <xsl:param name="text" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        if ($text castable as xs:decimal) then xs:decimal($text)
        else po:data-error(xs:QName('err:FORG0001'), $box,
                           $function || ': ''' || $text || ''' is no xs:decimal')"/>
  </xsl:function>

  <!-- The canonical form of the xs:decimal that the double $result equals exactly, for the
       function $function; err:FORG0001 at $box for NaN and the infinities, which no xs:decimal
       equals (a plain cast would raise FOCA0002). -->
  <xsl:function name="po:math-from-double" as="xs:string">
    <xsl:param name="function" as="xs:string"/>
    <xsl:param name="result" as="xs:double"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        if ($result castable as xs:decimal) then string(xs:decimal($result))
        else po:data-error(xs:QName('err:FORG0001'), $box,
                           $function || ': the result is ' || string($result)
                           || ', no xs:decimal')"/>
  </xsl:function>

  <!-- ceil: the least whole number not below $value. -->
  <xsl:function name="po:ceil" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(ceiling(po:math-number('ceil', $value, $box)))"/>
  </xsl:function>

  <!-- floor: the greatest whole number not above $value. -->
  <xsl:function name="po:floor" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(floor(po:math-number('floor', $value, $box)))"/>
  </xsl:function>

  <!-- power: $base to the power $exponent. Exact for a whole exponent from 0 to 1000, by repeated
       multiplication, which xs:decimal does exactly; any other exponent is math:pow of the two
       doubles, as the runtime's Math.pow (ADR-0005). -->
  <xsl:function name="po:power" as="xs:string">
    <xsl:param name="base" as="xs:string"/>
    <xsl:param name="exponent" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:variable name="b" as="xs:decimal" select="po:math-number('power', $base, $box)"/>
    <xsl:variable name="e" as="xs:decimal" select="po:math-number('power', $exponent, $box)"/>
    <xsl:sequence select="
        if ($e ge 0 and $e le 1000 and $e eq floor($e))
        then string(fold-left(1 to xs:integer($e), xs:decimal(1),
                              function($product as xs:decimal, $i as xs:integer) as xs:decimal {
                                $product * $b }))
        else po:math-from-double('power',
                                 math:pow(xs:double($b), xs:double($e)), $box)"
        xmlns:math="http://www.w3.org/2005/xpath-functions/math"/>
  </xsl:function>

  <!-- round: the nearest whole number, a half toward positive infinity, as fn:round. -->
  <xsl:function name="po:round" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(round(po:math-number('round', $value, $box)))"/>
  </xsl:function>

  <!-- sqr: $value times itself, exactly. -->
  <xsl:function name="po:sqr" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:variable name="x" as="xs:decimal" select="po:math-number('sqr', $value, $box)"/>
    <xsl:sequence select="string($x * $x)"/>
  </xsl:function>

  <!-- sqrt: math:sqrt of the double, cast back to xs:decimal (ADR-0005). -->
  <xsl:function name="po:sqrt" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="po:math-from-double('sqrt',
                              math:sqrt(xs:double(po:math-number('sqrt', $value, $box))), $box)"
        xmlns:math="http://www.w3.org/2005/xpath-functions/math"/>
  </xsl:function>
</xsl:stylesheet>
