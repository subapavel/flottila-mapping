<?xml version="1.0" encoding="UTF-8"?>
<!-- Queue-level checks of the helpers against literal queues (no source document).
     Each line prints "ok" or "FAIL", the helper, the observed display queue and the expected one. -->
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:array="http://www.w3.org/2005/xpath-functions/array"
    xmlns:po="urn:flottila:po"
    exclude-result-prefixes="#all">
  <xsl:import href="po-runtime.xsl"/>
  <xsl:output method="text"/>

  <xsl:template name="xsl:initial-template">
    <xsl:variable name="S" select="$po:SUPPRESS"/>
    <xsl:variable name="cases" as="array(*)*" select="
      [ 'removeContexts',      po:remove-contexts([ ('a','b'), (), ('c') ]),             'a,b,c' ],
      [ 'splitByValue',        po:split-by-value([ ('a','b'), ('c') ]),                  'a|b|c' ],
      [ 'splitByValueChange',  po:split-by-value-change([ ('a','a','b'), ('b','b') ]),   'a,a|b|b,b' ],
      [ 'collapseContexts',    po:collapse-contexts([ ('3','2'), (), ('7','8'), ($S) ]), '3,,7,' ],
      [ 'formatByExample',     po:format-by-example([ ('1','2','3') ], [ ('x'), (), ('y','z') ]), '1||2,3' ],
      [ 'mapWithDefault',      po:map-with-default([ ('A'), ('B1','B2'), (), ('C'), (), ('D') ], 'Default'),
                                                                                         'A|B1,B2|Default|C|Default|D' ],
      [ 'exists',              po:exists([ ('a','b'), () ]),                             'true,true|false' ],
      [ 'createIf',            po:create-if([ ('true','false','1') ]),                   ',S,' ],
      [ 'ifWithoutElse keep',  po:if-without-else([ ('true','false','true') ], [ ('a','b','c') ], true()),  'a,S,c' ],
      [ 'ifWithoutElse drop',  po:if-without-else([ ('true','false','true') ], [ ('a','b','c') ], false()), 'a,c' ],
      [ 'lift SUPPRESS',       po:lift(([ ('1', $S, '3') ], [ ('a') ]), concat#2),       '1a,S,3a' ],
      [ 'lift constant',       po:lift(([ ('1','2'), ('3') ], '-x'), concat#2),          '1-x,2-x|3-x' ],
      [ 'sum per context',     po:sum([ ('4.2','-0.2'), (), ('0.1','0.2') ]),            '4|0|0.3' ],
      [ 'sort stable desc',    po:sort-by-key([ ('1','2','2','0') ], [ ('a','b','c','d') ], true(), true()), 'b,c,a,d' ]
    "/>
    <xsl:for-each select="$cases">
      <xsl:variable name="got" select="po:show(?2)"/>
      <xsl:value-of select="(if ($got eq ?3) then 'ok   ' else 'FAIL ') || ?1 || ': ' || $got || '  expected ' || ?3 || '&#10;'"/>
    </xsl:for-each>
  </xsl:template>
</xsl:stylesheet>
