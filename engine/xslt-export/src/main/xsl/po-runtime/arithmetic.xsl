<?xml version="1.0" encoding="UTF-8"?>
<!-- The function family arithmetic (ADR-0025 "Families", F-15): each is po:<catalogue name>, its
     args in FunCall order, and one that can raise a data error takes its box last and raises
     through po:data-error (ADR-0026). A number is an xs:decimal (ADR-0005). The build joins
     core.xsl and the family modules, the families by id, into the helper module po-runtime.xsl, of
     which this comment is no part. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:mapping:po"
    xmlns:err="http://www.w3.org/2005/xqt-errors"
    exclude-result-prefixes="#all">

  <!-- formatNum, a single-value function: the decimal $value formatted with the XPath picture the
       DecimalFormat pattern $pattern compiles to (ADR-0003), as the runtime's
       ArithmeticFamily.formatNum does; a value that is no decimal raises err:FORG0001 at $box. -->
  <xsl:function name="po:formatNum" as="xs:string">
    <xsl:param name="value" as="xs:string"/>
    <xsl:param name="pattern" as="xs:string"/>
    <xsl:param name="box" as="xs:string"/>
    <xsl:sequence
        select="format-number(po:decimal($value, 'formatNum', $box), po:number-picture($pattern))"/>
  </xsl:function>
</xsl:stylesheet>
