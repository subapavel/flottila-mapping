<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping, two variants side by side under result (1..1):
     A  debtsDefault (1..1) / debt (0..n) <- payment                 (default context: Debitor)
     B  debtsRemoved (1..1) / debt (0..n) <- removeContexts(payment)
     both  debt/id (1..1) <- payment/id                              (default context: payment)
     SAP: extra contexts are not used (A writes only the first Debitor's 2 payments);
     removeContexts gives one context with all 7 (B). -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <xsl:template match="/">
    <xsl:variable name="payment" select="array:join(Debitors/Debitor ! [ payment ! '' ])"/>
    <xsl:variable name="id"      select="array:join(Debitors/Debitor/payment ! [ id ! string() ])"/>

    <xsl:variable name="result.debtsDefault.debt"    select="$payment"/>
    <xsl:variable name="result.debtsDefault.debt.id" select="$id"/>
    <xsl:variable name="result.debtsRemoved.debt"    select="po:remove-contexts($payment)"/>
    <xsl:variable name="result.debtsRemoved.debt.id" select="$id"/>

    <!-- result, debtsDefault and debtsRemoved are 1..1 without a mapping: generated once,
         slot 1. -->
    <result>
      <debtsDefault>
        <xsl:for-each select="po:slots($result.debtsDefault.debt, 1)">
          <debt>
            <xsl:for-each select="po:at-least(po:slots($result.debtsDefault.debt.id, ?n)[position() le 1], 1, 'debt/id')">
              <id><xsl:value-of select="?v"/></id>
            </xsl:for-each>
          </debt>
        </xsl:for-each>
      </debtsDefault>
      <debtsRemoved>
        <xsl:for-each select="po:slots($result.debtsRemoved.debt, 1)">
          <debt>
            <xsl:for-each select="po:at-least(po:slots($result.debtsRemoved.debt.id, ?n)[position() le 1], 1, 'debt/id')">
              <id><xsl:value-of select="?v"/></id>
            </xsl:for-each>
          </debt>
        </xsl:for-each>
      </debtsRemoved>
    </result>
  </xsl:template>
</xsl:stylesheet>
