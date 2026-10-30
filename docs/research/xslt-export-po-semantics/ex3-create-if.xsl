<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping (SAP createIf example):
     out/internalRequest (0..n) <- createIf(equalsS(removeContexts(type), 'internal'))
     out/externalRequest (0..n) <- createIf(equalsS(removeContexts(type), 'external'))
     both  .../initiator (0..1) <- creator                           (default context: request)
     SAP result: externalRequest/initiator = creator2, because the SUPPRESS slot of
     externalRequest used up the first creator context. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <xsl:template match="/">
    <xsl:variable name="type"    select="po:remove-contexts(array:join(requests/request ! [ type ! string() ]))"/>
    <xsl:variable name="creator" select="array:join(requests/request ! [ creator ! string() ])"/>

    <xsl:variable name="out.internalRequest"
        select="po:create-if(po:lift(($type, 'internal'), function($a, $b) { string($a eq $b) }))"/>
    <xsl:variable name="out.externalRequest"
        select="po:create-if(po:lift(($type, 'external'), function($a, $b) { string($a eq $b) }))"/>

    <out>
      <xsl:for-each select="po:slots($out.internalRequest, 1)">
        <internalRequest>
          <xsl:for-each select="po:slots($creator, ?n)[position() le 1]">
            <initiator><xsl:value-of select="?v"/></initiator>
          </xsl:for-each>
        </internalRequest>
      </xsl:for-each>
      <xsl:for-each select="po:slots($out.externalRequest, 1)">
        <externalRequest>
          <xsl:for-each select="po:slots($creator, ?n)[position() le 1]">
            <initiator><xsl:value-of select="?v"/></initiator>
          </xsl:for-each>
        </externalRequest>
      </xsl:for-each>
      <displayQueue of="out/internalRequest"><xsl:value-of select="po:show($out.internalRequest)"/></displayQueue>
      <displayQueue of="out/externalRequest"><xsl:value-of select="po:show($out.externalRequest)"/></displayQueue>
    </out>
  </xsl:template>
</xsl:stylesheet>
