<?xml version="1.0" encoding="UTF-8"?>
<!-- Hand-written XSLT bodies for the Java UDFs of ex6-udf.xsl. Higher import precedence
     than the stubs, so these are the functions that run. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:po="urn:flottila:po"
    xmlns:udf="urn:flottila:udf:example"
    exclude-result-prefixes="#all">
  <xsl:import href="ex6-udf.xsl"/>

  <xsl:function name="udf:appendAfterTrim" as="xs:string">
    <xsl:param name="in1" as="xs:string"/>
    <xsl:param name="in2" as="xs:string"/>
    <!-- Java String.trim() strips chars <= U+0020. Of those, XML 1.0 text can only hold
         tab, LF, CR and space, which is exactly XPath's \s. -->
    <xsl:sequence select="replace($in1, '^\s+|\s+$', '') || replace($in2, '^\s+|\s+$', '')"/>
  </xsl:function>

  <xsl:function name="udf:myCreateIf" as="array(item()*)">
    <xsl:param name="a" as="item()*"/>
    <xsl:sequence select="[ $a ! (if (. eq 'true') then '' else $po:SUPPRESS) ]"/>
  </xsl:function>
</xsl:stylesheet>
