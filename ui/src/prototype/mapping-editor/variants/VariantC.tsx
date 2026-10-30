// PROTOTYPE (#10, throwaway). Variant (c) "Table first": a virtualised table of target fields with
// the mapping as an inline function chain. Expanding a row shows an editable chain of chips and
// the display queue inline under the row. No canvas at all.
import { Label, SearchInput, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { CATALOGUE, CATALOGUE_BY_NAME, fidelityText } from '../model/catalogue';
import { chainText, isOrphanedBox, type FieldStatus } from '../model/derive';
import { newAuthoringId } from '../model/ids';
import { addBox, connect, functionBox, setContext, setParam } from '../model/ops';
import { ancestors, occurrenceText, parentPath, shortPath, type Structure } from '../model/structures';
import type { AuthoringId, FieldPath, TargetFieldMapping } from '../model/types';
import { DisplayQueue } from '../shared/DisplayQueue';
import { useEditor } from '../shared/editorState';
import { useStatus } from '../shared/StatusMarker';

const FILTERS: (FieldStatus | 'all' | 'attention')[] = ['all', 'mapped', 'attention', 'unmapped mandatory', 'orphaned', 'error'];
const STATUS_COLOR: Record<string, 'green' | 'red' | 'orange' | 'grey' | 'blue'> = {
  mapped: 'green', 'unmapped mandatory': 'red', orphaned: 'orange', error: 'red', auto: 'blue', unmapped: 'grey'
};

export function VariantC() {
  const ed = useEditor();
  const { model, tgt, select, field } = ed;
  const status = useStatus();
  const url = new URLSearchParams(location.search);
  const [filter, setFilter] = useState<string>(url.get('filter') ?? 'all');
  const [query, setQuery] = useState(url.get('q') ?? '');
  const [expanded, setExpanded] = useState<FieldPath | null>(url.get('expand') ?? null);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return tgt.order.filter((p) => {
      const s = status(p);
      if (filter === 'attention' && !['unmapped mandatory', 'orphaned', 'error'].includes(s)) return false;
      if (filter !== 'all' && filter !== 'attention' && s !== filter) return false;
      return !q || p.toLowerCase().includes(q) || (model.targetFieldMappings[p] && chainText(model.targetFieldMappings[p]).toLowerCase().includes(q));
    });
  }, [tgt, model, filter, query, status]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => (rows[i] === expanded ? 260 : 32), overscan: 8 });

  return (
    <div className="vc" data-testid="variant-c">
      <div className="vc__toolbar">
        <SearchInput placeholder="Filter by path or function" value={query} onChange={(_e, x) => setQuery(x)} onClear={() => setQuery('')} />
        <ToggleGroup isCompact aria-label="status filter">
          {FILTERS.map((f) => <ToggleGroupItem key={f} text={f} isSelected={filter === f} onChange={() => setFilter(f)} />)}
        </ToggleGroup>
        <span className="muted">{rows.length.toLocaleString()} of {tgt.fields.size.toLocaleString()} target fields</span>
      </div>
      <div className="vc__head vc__grid">
        <span>Target field</span><span>Occ.</span><span>Type</span><span>Mapping (inline function chain)</span><span>Status</span>
      </div>
      <div ref={scrollRef} className="vc__scroll" data-testid="c-scroll">
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const p = rows[vi.index];
            const f = tgt.fields.get(p)!;
            const fm = model.targetFieldMappings[p];
            const s = status(p);
            const isOpen = expanded === p;
            return (
              <div key={p} data-index={vi.index} ref={v.measureElement} className={`vc__row ${isOpen ? 'is-open' : ''} ${field === p ? 'is-selected' : ''}`} style={{ transform: `translateY(${vi.start}px)` }}>
                <div className="vc__grid vc__line" onClick={() => { setExpanded(isOpen ? null : p); select(p, null); }}>
                  <span className="vc__name" style={{ paddingLeft: f.depth * 12 }} title={p}>
                    <span className="vc__twisty">{isOpen ? '▾' : '▸'}</span>
                    <span className={f.kind === 'attribute' ? 'is-attr' : f.type ? '' : 'is-struct'}>{f.name}</span>
                  </span>
                  <span>{occurrenceText(f)}</span>
                  <span className="muted">{f.type ?? 'structure'}</span>
                  <code className="vc__chain" title={fm ? chainText(fm) : ''}>{fm ? chainText(fm) : '—'}</code>
                  <span>{s !== 'unmapped' && <Label isCompact color={STATUS_COLOR[s]}>{s}</Label>}</span>
                </div>
                {isOpen && <RowEditor path={p} fm={fm} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RowEditor({ path, fm }: { path: FieldPath; fm: TargetFieldMapping | undefined }) {
  const { update, src, run, box, select, errorsByPath } = useEditor();
  const subject = box && fm?.boxes[box] ? box : fm?.result ?? null;
  const ev = subject ? run.boxQueues.get(subject) : undefined;
  const errs = errorsByPath.get(path) ?? [];
  return (
    <div className="vc__editor" onClick={(e) => e.stopPropagation()}>
      <div className="vc__fullpath"><code>{path}</code> {fm && <>· mapping <code>{fm.id}</code></>}</div>
      {fm && fm.result ? (
        <div className="chain" data-testid="chain-editor">
          <Chip fm={fm} path={path} id={fm.result} seen={new Set()} />
          <WrapMenu onPick={(fn) => {
            const id = newAuthoringId();
            update((m) => { let n = addBox(m, path, functionBox(fn), id)[0]; n = connect(n, path, fm.result!, id, 0); return connect(n, path, id, 'target', 0); });
          }} label="wrap all in…" />
        </div>
      ) : (
        <div className="chain"><span className="muted">Not mapped. Start with a source field: </span>
          <SourcePicker src={src} onPick={(sp) => { const id = newAuthoringId(); update((m) => connect(addBox(m, path, { kind: 'source', field: sp }, id)[0], path, id, 'target', 0)); }} />
        </div>
      )}
      {errs.length > 0 && <ul className="vc__errs">{errs.map((e, i) => <li key={i} className={`err err--${e.code}`}><span className="err__code">{e.code}</span> {e.message}</li>)}</ul>}
      {subject && (
        <DisplayQueue compact queue={ev ? ev.queue : null} generating={ev?.generating} id={subject}
          title={subject === fm?.result ? 'result (what the target field reads)' : chainText(fm!, subject)} />
      )}
      {fm && <div className="muted vc__hint">Click a chip to show its display queue. {box && <a onClick={() => select(path, null)}>show result</a>}</div>}
    </div>
  );
}

function Chip({ fm, path, id, seen, parent, index }: { fm: TargetFieldMapping; path: FieldPath; id: AuthoringId | null; seen: Set<string>; parent?: AuthoringId; index?: number }) {
  const { update, src, box: sel, select } = useEditor();
  if (!id || !fm.boxes[id]) {
    const pick = (sp: FieldPath) => {
      if (!parent) return;
      const nid = newAuthoringId();
      update((m) => connect(addBox(m, path, { kind: 'source', field: sp }, nid)[0], path, nid, parent, index ?? 0));
    };
    return <span className="chip chip--missing" title="unconnected input: type a source field path">∅ <SourcePicker src={src} onPick={pick} compact /></span>;
  }
  const b = fm.boxes[id];
  const selCls = sel === id ? 'is-selected' : '';
  const click = (e: React.MouseEvent) => { e.stopPropagation(); select(path, id); };
  if (seen.has(id)) return <span className={`chip chip--ref ${selCls}`} onClick={click} title="the same box again (fan-out)">↺ {id}</span>;
  seen.add(id);
  if (b.kind === 'source') {
    const parent = parentPath(b.field);
    const orphan = isOrphanedBox(b, src);
    return (
      <span className={`chip chip--source ${selCls} ${orphan ? 'is-orphaned' : ''}`} onClick={click} title={`${b.field}\n${id}`}>
        {shortPath(b.field)}
        {orphan && <span className="fbox__orphan">orphaned</span>}
        <select value={b.context ?? parent} onChange={(e) => update((m) => setContext(m, path, id, e.target.value, parent))} onClick={(e) => e.stopPropagation()}>
          {ancestors(src, b.field).map((a) => <option key={a} value={a}>ctx {shortPath(a).split('/').pop()}{a === parent ? '' : ' ≠'}</option>)}
        </select>
      </span>
    );
  }
  if (b.kind === 'function' && b.fn === 'constant') {
    return (
      <span className={`chip chip--constant ${selCls}`} onClick={click} title={id}>
        "<input size={Math.max(2, String(b.params?.value ?? '').length)} value={String(b.params?.value ?? '')} onChange={(e) => update((m) => setParam(m, path, id, 'value', e.target.value))} onClick={(e) => e.stopPropagation()} />"
      </span>
    );
  }
  const name = b.kind === 'function' ? b.fn : b.kind === 'udf' ? b.udf : b.name;
  const cat = b.kind === 'function' ? CATALOGUE_BY_NAME[b.fn] : undefined;
  return (
    <span className={`chip chip--${b.kind} ${selCls}`} title={id}>
      <span className="chip__name" onClick={click}>
        {b.kind === 'unresolved' && '? '}{name}{b.kind === 'udf' && ' (UDF)'}
        {cat && cat.executionKind !== 'single' && <sup className="chip__kind">{cat.executionKind}</sup>}
        {cat && cat.fidelity.level !== 'exact' && <span className={`fid fid--${cat.fidelity.level}`} title={fidelityText(cat)}>{cat.fidelity.level === 'deviation' ? cat.fidelity.deviationId : 'assumed'}</span>}
      </span>
      (
      {(b.inputs ?? []).map((inp, i) => (
        <span key={i} className="chip__arg">{i > 0 && ', '}<Chip fm={fm} path={path} id={inp} seen={seen} parent={id} index={i} /></span>
      ))}
      {Object.entries(b.params ?? {}).map(([k, v]) => (
        <span key={k} className="chip__param">, {k}=
          {typeof v === 'string'
            ? <input size={Math.max(3, v.length)} value={v} onChange={(e) => update((m) => setParam(m, path, id, k, e.target.value))} />
            : <TableParam value={v} onChange={(t) => update((m) => setParam(m, path, id, k, t))} />}
        </span>
      ))}
      )
    </span>
  );
}

function TableParam({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <a onClick={() => setOpen(true)}>{`{${Object.entries(value).map(([a, b]) => `${a}→${b}`).join(', ')}}`}</a>;
  return (
    <span className="tparam">
      {Object.entries(value).map(([k, v]) => (
        <span key={k}>{k}→<input size={4} value={v} onChange={(e) => onChange({ ...value, [k]: e.target.value })} /></span>
      ))}
      <a onClick={() => setOpen(false)}>done</a>
    </span>
  );
}

function SourcePicker({ src, onPick, compact }: { src: Structure; onPick: (p: FieldPath) => void; compact?: boolean }) {
  const [v, setV] = useState('');
  const leaves = useMemo(() => src.order.filter((p) => src.fields.get(p)!.depth <= 4).slice(0, 400), [src]);
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <input list="src-fields" placeholder={compact ? 'unconnected: source path' : 'source field path'} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && src.fields.has(v)) onPick(v); }} size={compact ? 22 : 40} />
      <datalist id="src-fields">{leaves.map((p) => <option key={p} value={p} />)}</datalist>
    </span>
  );
}

function WrapMenu({ onPick, label }: { onPick: (fn: string) => void; label: string }) {
  return (
    <select className="chip__wrap" value="" onChange={(e) => e.target.value && onPick(e.target.value)} onClick={(e) => e.stopPropagation()}>
      <option value="">{label}</option>
      {CATALOGUE.filter((f) => f.inputs.length > 0).map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
    </select>
  );
}

