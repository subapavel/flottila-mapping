<?xml version="1.0" encoding="UTF-8"?>
<!-- The function family arithmetic (ADR-0025 "Families", F-15), its basic functions: each is
     po:<catalogue name>, its args in FunCall order, the number inputs as the strings a Lift slot
     holds, the result a string in the XPath canonical form (ADR-0005). Each takes its box last
     and raises through po:data-error (ADR-0026): err:FORG0001 for an input that is no
     xs:decimal, err:FOAR0001 for a division by zero, as the runtime's ArithmeticFamily does. The
     build joins core.xsl and the family modules, the families by id, into the helper module
     po-runtime.xsl, of which this comment is no part. A family module uses what core.xsl declares
     and nothing of another family, and holds core.xsl's root start tag, byte for byte. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    xmlns:err="http://www.w3.org/2005/xqt-errors"
    exclude-result-prefixes="#all">

  <!-- $text as a decimal, as the runtime's ArithmeticFamily.decimal reads it: the xs:decimal
       lexical form in ASCII digits only (so no exponent, NaN or sign alone), after the XML white
       space around it is cut by the cast. Anything else is err:FORG0001 at $box. -->
  <xsl:function name="po:arithmetic-decimal" as="xs:decimal">
    <xsl:param name="text" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        if (matches($text, '^[ \t\r\n]*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)[ \t\r\n]*$'))
        then xs:decimal($text)
        else po:data-error(xs:QName('err:FORG0001'), $box, '&quot;' || $text || '&quot; is no xs:decimal')"/>
  </xsl:function>

  <!-- $a div $b, as the runtime's ArithmeticFamily.quotient does by ADR-0005 (Saxon-HE's rule):
       exact when it terminates, else a scale of max(18, ...) digits. Zero is err:FOAR0001 at
       $box. -->
  <xsl:function name="po:arithmetic-quotient" as="xs:string">
    <xsl:param name="a" as="xs:decimal"/>
    <xsl:param name="b" as="xs:decimal"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        if ($b eq 0)
        then po:data-error(xs:QName('err:FOAR0001'), $box, 'division by zero')
        else string($a div $b)"/>
  </xsl:function>

  <xsl:function name="po:add" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) + po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:subtract" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) - po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:multiply" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) * po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:divide" as="xs:string">
    <xsl:param name="dividend" as="xs:string"/>
    <xsl:param name="divisor" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="po:arithmetic-quotient(po:arithmetic-decimal($dividend, $box),
                                                 po:arithmetic-decimal($divisor, $box), $box)"/>
  </xsl:function>

  <xsl:function name="po:equalsA" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) eq po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:greater" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) gt po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:less" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(po:arithmetic-decimal($a, $box) lt po:arithmetic-decimal($b, $box))"/>
  </xsl:function>

  <xsl:function name="po:max" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(max((po:arithmetic-decimal($a, $box), po:arithmetic-decimal($b, $box))))"/>
  </xsl:function>

  <xsl:function name="po:min" as="xs:string">
    <xsl:param name="a" as="xs:string"/>
    <xsl:param name="b" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(min((po:arithmetic-decimal($a, $box), po:arithmetic-decimal($b, $box))))"/>
  </xsl:function>

  <xsl:function name="po:abs" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(abs(po:arithmetic-decimal($value, $box)))"/>
  </xsl:function>

  <xsl:function name="po:neg" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="string(-po:arithmetic-decimal($value, $box))"/>
  </xsl:function>

  <!-- inv: 1 div the value, by the quotient rule (an assumed reading). -->
  <xsl:function name="po:inv" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="po:arithmetic-quotient(1.0, po:arithmetic-decimal($value, $box), $box)"/>
  </xsl:function>

  <xsl:function name="po:sign" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence select="
        let $v := po:arithmetic-decimal($value, $box)
        return if ($v gt 0) then '1' else if ($v lt 0) then '-1' else '0'"/>
  </xsl:function>
</xsl:stylesheet>
