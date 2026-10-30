<?xml version="1.0" encoding="UTF-8"?>
<!-- Mapping (SAP useOneAsMany figure):
     items/group (0..n)            <- removeContexts(itemGroup)
     items/group/item (0..n)       <- name                               (context: itemGroup)
     items/group/item/name (1..1)  <- SplitByValue(name)
     items/group/item/type (1..1)  <- SplitByValue(useOneAsMany(type, name[context=order], name))
     SAP figure for useOneAsMany: external,external|external|internal,internal|external -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output indent="yes"/>

  <xsl:template match="/">
    <xsl:variable name="itemGroup"  select="array:join(orders/order ! [ itemGroup ! '' ])"/>
    <xsl:variable name="type"       select="array:join(orders/order ! [ type ! string() ])"/>
    <xsl:variable name="name.order" select="array:join(orders/order ! [ itemGroup/name ! string() ])"/>
    <xsl:variable name="name"       select="array:join(orders/order/itemGroup ! [ name ! string() ])"/>

    <xsl:variable name="uoam" select="po:use-one-as-many($type, $name.order, $name)"/>
    <xsl:variable name="items.group"           select="po:remove-contexts($itemGroup)"/>
    <xsl:variable name="items.group.item"      select="$name"/>
    <xsl:variable name="items.group.item.name" select="po:split-by-value($name)"/>
    <xsl:variable name="items.group.item.type" select="po:split-by-value($uoam)"/>

    <items>
      <xsl:for-each select="po:slots($items.group, 1)">
        <group>
          <xsl:for-each select="po:slots($items.group.item, ?n)">
            <xsl:variable name="item" select="?n"/>
            <item>
              <xsl:for-each select="po:at-least(po:slots($items.group.item.name, $item)[position() le 1], 1, 'item/name')">
                <name><xsl:value-of select="?v"/></name>
              </xsl:for-each>
              <xsl:for-each select="po:at-least(po:slots($items.group.item.type, $item)[position() le 1], 1, 'item/type')">
                <type><xsl:value-of select="?v"/></type>
              </xsl:for-each>
            </item>
          </xsl:for-each>
        </group>
      </xsl:for-each>
      <displayQueue of="useOneAsMany"><xsl:value-of select="po:show($uoam)"/></displayQueue>
      <displayQueue of="name[context=order]"><xsl:value-of select="po:show($name.order)"/></displayQueue>
      <displayQueue of="name"><xsl:value-of select="po:show($name)"/></displayQueue>
    </items>
  </xsl:template>
</xsl:stylesheet>
