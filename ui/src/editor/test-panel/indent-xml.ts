/**
 * Indents a target message for display only (spec #135). It adds whitespace only between the children of an element
 * with element-only content (child elements, comments and processing instructions, no text, not even whitespace, so
 * an indented message stays as it is) and between the
 * document's top-level items; mixed content, text, CDATA, attributes and the declaration are kept byte for byte, and
 * so is every element inside mixed content. A text that does not parse as one XML document, JSON among them, is
 * returned as it is. The parse is lexical: tags, quotes and nesting are checked, names and entities are not.
 */
export function indentXml(text: string): string {
  const top = parse(text);
  if (top === undefined) return text;
  let out = '';
  // a top-level item already parted from the one before by whitespace keeps it; otherwise it gets a line of its own
  let parted = true;
  for (const node of top) {
    if (node.kind === 'text') {
      out += text.slice(node.start, node.end);
      parted = true;
    } else {
      out += (parted ? '' : '\n') + render(text, node, 0);
      parted = false;
    }
  }
  return out;
}

const INDENT = '  ';
const XML_SPACE = /^[ \t\r\n]*$/;

interface Span {
  start: number;
  end: number;
}

/** Text and CDATA are `text`; comments, processing instructions and the declaration are `markup`. */
type XmlNode = Element | (Span & { kind: 'text' | 'markup' });

interface Element extends Span {
  kind: 'element';
  name: string;
  /** Where the start tag ends and the end tag starts; both are `end` for an empty-element tag. */
  openEnd: number;
  closeStart: number;
  children: XmlNode[];
}

function render(text: string, node: XmlNode, depth: number): string {
  if (node.kind !== 'element' || node.children.length === 0 || node.children.some((c) => c.kind === 'text')) {
    return text.slice(node.start, node.end);
  }
  const inner = node.children.map((c) => `\n${INDENT.repeat(depth + 1)}${render(text, c, depth + 1)}`).join('');
  return `${text.slice(node.start, node.openEnd)}${inner}\n${INDENT.repeat(depth)}${text.slice(node.closeStart, node.end)}`;
}

/** The document's top-level items, or `undefined` when the text is not one well-nested document with one root. */
function parse(text: string): XmlNode[] | undefined {
  const top: XmlNode[] = [];
  const open: Element[] = [];
  let i = 0;
  while (i < text.length) {
    const siblings = open.at(-1)?.children ?? top;
    if (text[i] !== '<') {
      const next = text.indexOf('<', i);
      const end = next === -1 ? text.length : next;
      siblings.push({ kind: 'text', start: i, end });
      i = end;
    } else if (text.startsWith('<?', i) || text.startsWith('<!--', i)) {
      const end = after(text, text[i + 1] === '?' ? '?>' : '-->', i + 2);
      if (end === undefined) return undefined;
      siblings.push({ kind: 'markup', start: i, end });
      i = end;
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = after(text, ']]>', i + 9);
      if (end === undefined) return undefined;
      siblings.push({ kind: 'text', start: i, end });
      i = end;
    } else if (text.startsWith('<!', i)) {
      return undefined; // a document type declaration, or other markup this display does not read
    } else if (text.startsWith('</', i)) {
      const end = after(text, '>', i);
      const element = open.pop();
      if (end === undefined || element === undefined || /^<\/([^\s>]+)\s*>$/.exec(text.slice(i, end))?.[1] !== element.name) {
        return undefined;
      }
      element.closeStart = i;
      element.end = end;
      i = end;
    } else {
      const end = startTagEnd(text, i);
      if (end === undefined) return undefined;
      const tag = text.slice(i, end);
      const name = /^<([^\s/>]+)/.exec(tag)?.[1];
      if (name === undefined) return undefined;
      const element: Element = { kind: 'element', name, start: i, end, openEnd: end, closeStart: end, children: [] };
      siblings.push(element);
      if (!tag.endsWith('/>')) open.push(element);
      i = end;
    }
  }
  const roots = top.filter((n) => n.kind === 'element').length;
  const strayText = top.some((n) => n.kind === 'text' && !XML_SPACE.test(text.slice(n.start, n.end)));
  return open.length === 0 && roots === 1 && !strayText ? top : undefined;
}

/** The index just after the first `token` at or after `from`, or `undefined` when there is none. */
function after(text: string, token: string, from: number): number | undefined {
  const at = text.indexOf(token, from);
  return at === -1 ? undefined : at + token.length;
}

/** The index just after the `>` that ends the start tag at `from`, skipping quoted attribute values. */
function startTagEnd(text: string, from: number): number | undefined {
  let quote: string | undefined;
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i];
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i + 1;
    }
  }
  return undefined;
}
