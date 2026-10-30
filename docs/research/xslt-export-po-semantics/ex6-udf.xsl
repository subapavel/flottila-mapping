<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping with two Java UDFs (SAP examples from the #2 note, section 6.1):
     out/label (0..n)    <- appendAfterTrim(type, creator)         single value UDF
     out/internal (0..n) <- myCreateIf(equalsS(type, 'internal'))  context UDF
     The Java bodies cannot be exported. The exporter writes typed stubs that fail loudly;
     udf-impl-ex6.xsl imports this stylesheet and supplies hand-written XSLT bodies, which
     win by import precedence (XSLT 3.0 10.3.1). -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    xmlns:udf="urn:flottila:udf:example"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <!-- Single value UDF: public String appendAfterTrim(String in1, String in2) -->
  <xsl:function name="udf:appendAfterTrim" as="xs:string">
    <xsl:param name="in1" as="xs:string"/>
    <xsl:param name="in2" as="xs:string"/>
    <xsl:sequence select="error(xs:QName('po:UDF-NOT-EXPORTED'), 'Java UDF appendAfterTrim has no XSLT body')"/>
  </xsl:function>

  <!-- Context UDF: public void myCreateIf(String[] a, ResultList result, Container container) -->
  <xsl:function name="udf:myCreateIf" as="array(item()*)">
    <xsl:param name="a" as="item()*"/>
    <xsl:sequence select="error(xs:QName('po:UDF-NOT-EXPORTED'), 'Java UDF myCreateIf has no XSLT body')"/>
  </xsl:function>

  <xsl:template match="/">
    <xsl:variable name="type"    select="array:join(requests ! [ request/type ! string() ])"/>
    <xsl:variable name="creator" select="array:join(requests ! [ request/creator ! string() ])"/>

    <xsl:variable name="out.label"    select="po:lift(($type, $creator), udf:appendAfterTrim#2)"/>
    <xsl:variable name="out.internal" select="po:per-context(
        po:lift(($type, 'internal'), function($a, $b) { string($a eq $b) }), udf:myCreateIf#1)"/>

    <out>
      <xsl:for-each select="po:slots($out.label, 1)"><label><xsl:value-of select="?v"/></label></xsl:for-each>
      <xsl:for-each select="po:slots($out.internal, 1)"><internal/></xsl:for-each>
    </out>
  </xsl:template>
</xsl:stylesheet>
