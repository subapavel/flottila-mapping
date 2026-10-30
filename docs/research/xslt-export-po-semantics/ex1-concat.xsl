<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping: out/grp (0..n) <- g ; out/grp/v (0..n) <- concat(x, y), default contexts.
     Reproduces the SAP concat figure: 1,2,3|4,5,6 and a,b|c,d give 1a,2b,3b|4c,5d,6d. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <xsl:template match="/">
    <!-- Source queues: the split point of "!" is the context. -->
    <xsl:variable name="g" select="array:join(r ! [ g ! '' ])"/>
    <xsl:variable name="x" select="array:join(r/g ! [ x ! string() ])"/>
    <xsl:variable name="y" select="array:join(r/g ! [ y ! string() ])"/>

    <!-- Target field mappings. -->
    <xsl:variable name="out.grp"   select="$g"/>
    <xsl:variable name="out.grp.v" select="po:lift(($x, $y), concat#2)"/>

    <out>
      <xsl:for-each select="po:slots($out.grp, 1)">
        <grp>
          <xsl:for-each select="po:slots($out.grp.v, ?n)">
            <v><xsl:value-of select="?v"/></v>
          </xsl:for-each>
        </grp>
      </xsl:for-each>
      <displayQueue of="out/grp/v"><xsl:value-of select="po:show($out.grp.v)"/></displayQueue>
    </out>
  </xsl:template>
</xsl:stylesheet>
