<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping, all inputs in context order:
     summary/order (0..n)         <- order
     order/id (1..1)              <- id
     order/note (1..1)            <- mapWithDefault(note, 'none')
     order/total (1..1)           <- sum(amount)
     order/lines (1..1)           <- count(sku)
     order/sku (0..n)             <- sort(sku)                         lexicographic, ascending
     order/byAmount (0..n)        <- sortByKey(amount, sku)            numeric, descending (stable) -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <xsl:template match="/">
    <xsl:variable name="order"  select="array:join(orders ! [ order ! '' ])"/>
    <xsl:variable name="id"     select="array:join(orders/order ! [ id ! string() ])"/>
    <xsl:variable name="note"   select="array:join(orders/order ! [ note ! string() ])"/>
    <xsl:variable name="sku"    select="array:join(orders/order ! [ line/sku ! string() ])"/>
    <xsl:variable name="amount" select="array:join(orders/order ! [ line/amount ! string() ])"/>

    <xsl:variable name="m" select="map{
        'id':       $id,
        'note':     po:map-with-default($note, 'none'),
        'total':    po:sum($amount),
        'lines':    po:count($sku),
        'sku':      po:sort($sku, false(), false()),
        'byAmount': po:sort-by-key($amount, $sku, true(), true())
      }"/>

    <summary>
      <xsl:for-each select="po:slots($order, 1)">
        <xsl:variable name="o" select="?n"/>
        <order>
          <xsl:for-each select="'id', 'note', 'total', 'lines'">
            <xsl:variable name="field" select="."/>
            <xsl:for-each select="po:at-least(po:slots($m($field), $o)[position() le 1], 1, 'order/' || $field)">
              <xsl:element name="{$field}"><xsl:value-of select="?v"/></xsl:element>
            </xsl:for-each>
          </xsl:for-each>
          <xsl:for-each select="po:slots($m?sku, $o)"><sku><xsl:value-of select="?v"/></sku></xsl:for-each>
          <xsl:for-each select="po:slots($m?byAmount, $o)"><byAmount><xsl:value-of select="?v"/></byAmount></xsl:for-each>
        </order>
      </xsl:for-each>
    </summary>
  </xsl:template>
</xsl:stylesheet>
