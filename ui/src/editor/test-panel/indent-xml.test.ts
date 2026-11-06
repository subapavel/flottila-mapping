import { describe, expect, test } from 'vitest';
import { indentXml } from './indent-xml';

describe('indentXml (spec #135): indents a target message for display only', () => {
  test('puts each child of element-only content on its own line, two spaces deeper, and the declaration on its own line', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><ns0:PurchaseOrder xmlns:ns0="urn:flottila:corpus:gate:po">' +
      '<Header><OrderId>PO 4711</OrderId><Ref code=\'a > b\' note="x &amp; y"/></Header><Note>leave at the door</Note></ns0:PurchaseOrder>';

    expect(indentXml(xml)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ns0:PurchaseOrder xmlns:ns0="urn:flottila:corpus:gate:po">',
        '  <Header>',
        '    <OrderId>PO 4711</OrderId>',
        '    <Ref code=\'a > b\' note="x &amp; y"/>',
        '  </Header>',
        '  <Note>leave at the door</Note>',
        '</ns0:PurchaseOrder>',
      ].join('\n'),
    );
  });

  test('leaves mixed content byte-identical, with every element inside it', () => {
    const mixed = '<note>Ship <b>today</b>, <i>please<x><y/></x></i><br/></note>';

    expect(indentXml(mixed)).toBe(mixed);
  });

  test('indents element-only content around a mixed child, and leaves the child as it is', () => {
    expect(indentXml('<r><p>a <b>c</b></p><q/></r>')).toBe('<r>\n  <p>a <b>c</b></p>\n  <q/>\n</r>');
  });

  test('takes whitespace between elements as text: an already indented message stays as it is', () => {
    const indented = '<?xml version="1.0"?>\n<a>\n  <b/>\n</a>\n';

    expect(indentXml(indented)).toBe(indented);
  });

  test('takes CDATA as text, and puts comments and processing instructions on their own lines', () => {
    expect(indentXml('<a t="1>2"><![CDATA[<x/>]]></a>')).toBe('<a t="1>2"><![CDATA[<x/>]]></a>');
    expect(indentXml('<!-- head --><a><!-- c --><?pi x?><b></b ></a>')).toBe('<!-- head -->\n<a>\n  <!-- c -->\n  <?pi x?>\n  <b></b >\n</a>');
  });

  test.each([
    ['JSON', '{"price":1.50,"lines":[{"no":1}]}'],
    ['indented JSON', '{\n  "price": 1.50\n}'],
    ['plain text', 'not xml'],
    ['an empty message', ''],
    ['an unterminated declaration', '<?xml version="1.0"'],
    ['an unterminated comment', '<a><!-- c</a>'],
    ['an unterminated CDATA section', '<a><![CDATA[x</a>'],
    ['a document type declaration', '<!DOCTYPE a><a><b/></a>'],
    ['an unterminated start tag', '<a t="x><b/></a>'],
    ['a start tag without a name', '< a><b/></a>'],
    ['an unterminated end tag', '<a><b/></a'],
    ['a malformed end tag', '<a><b/></a b>'],
    ['an end tag that closes nothing', '</a><a><b/></a>'],
    ['an end tag that closes another element', '<a><b/></c>'],
    ['an unclosed element', '<a><b/>'],
    ['text after the root', '<a><b/></a>x'],
    ['no root element', '<?xml version="1.0"?>'],
    ['two root elements', '<a><b/></a><c/>'],
  ])('shows %s as it is', (_, text) => {
    expect(indentXml(text)).toBe(text);
  });
});
