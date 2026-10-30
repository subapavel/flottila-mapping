// PROTOTYPE (#10, throwaway): source tree | SVG link gutter | target tree (round 2, CPI style).
// Kaoto-style links: an SVG overlay between two virtualised trees. When an endpoint row is
// collapsed away, the curve ends at the nearest visible ancestor (dashed); when it is scrolled
// out of view, it is counted at the tree edge instead of drawn.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { usedSourceFields } from '../model/derive';
import { newAuthoringId } from '../model/ids';
import { addBox, connect } from '../model/ops';
import { parentPath, type Structure } from '../model/structures';
import type { FieldPath } from '../model/types';
import { useEditor } from './editorState';
import { FieldTree, ROW_H, type TreeView } from './FieldTree';
import { SplitPane } from './SplitPane';
import { StatusMarker, useStatus } from './StatusMarker';

const GUTTER_W = 130;

type Link = { key: string; src: FieldPath; tgt: FieldPath; fm: FieldPath };
type End = { y: number; ancestor: boolean } | { edge: 'top' | 'bottom' } | null;

function endpoint(path: FieldPath, view: TreeView | null, s: Structure, offset: number): End {
  if (!view) return null;
  let p: FieldPath | null = path;
  let ancestor = false;
  while (p && !view.index.has(p)) {
    p = s.fields.get(p)?.parent ?? (p.lastIndexOf('/') > 0 ? parentPath(p) : null);
    ancestor = true;
  }
  if (!p) return null;
  const y = view.index.get(p)! * ROW_H - view.scrollTop + ROW_H / 2;
  if (y < 0) return { edge: 'top' };
  if (y > view.height) return { edge: 'bottom' };
  return { y: y + offset, ancestor };
}

export function LinkedTrees({ id, linkMode, onSelectTarget, targetTree, sourceRatio = 0.42 }: {
  id: string;
  linkMode: 'all' | 'selected';
  onSelectTarget: (p: FieldPath) => void;
  targetTree?: { renderExtra?: (p: FieldPath) => ReactNode; header?: ReactNode; filter?: ((p: FieldPath) => boolean) | null; toolsExtra?: ReactNode };
  sourceRatio?: number;
}) {
  const { model, src, tgt, field, update } = useEditor();
  const status = useStatus();
  const [sv, setSv] = useState<TreeView | null>(null);
  const [tv, setTv] = useState<TreeView | null>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const used = useMemo(() => usedSourceFields(model), [model]);

  const links = useMemo(() => {
    const out = new Map<string, Link>();
    for (const [fm, m] of Object.entries(model.targetFieldMappings))
      for (const b of Object.values(m.boxes)) if (b.kind === 'source') out.set(`${b.field}|${fm}`, { key: `${b.field}|${fm}`, src: b.field, tgt: fm, fm });
    return [...out.values()];
  }, [model]);

  const onDrop = (target: FieldPath, sourcePath: FieldPath) => {
    // unmapped target: new target field mapping whose result is the source box; else add a box
    const bid = newAuthoringId();
    const mapped = !!model.targetFieldMappings[target];
    update((m) => { const n = addBox(m, target, { kind: 'source', field: sourcePath }, bid)[0]; return mapped ? n : connect(n, target, bid, 'target', 0); });
    onSelectTarget(target);
  };

  const gTop = gutter.current?.getBoundingClientRect().top ?? 0;
  const W = GUTTER_W;
  const paths: ReactNode[] = [];
  const ticks: ReactNode[] = [];
  const edgeCount = { st: 0, sb: 0, tt: 0, tb: 0 };
  for (const l of links) {
    const a = endpoint(l.src, sv, src, (sv?.top ?? 0) - gTop);
    const b = endpoint(l.tgt, tv, tgt, (tv?.top ?? 0) - gTop);
    if (!a || !b) continue;
    if ('edge' in a) { if (a.edge === 'top') edgeCount.st++; else edgeCount.sb++; }
    if ('edge' in b) { if (b.edge === 'top') edgeCount.tt++; else edgeCount.tb++; }
    const sel = l.fm === field;
    if (linkMode === 'selected' && !sel) {
      if ('y' in a) ticks.push(<line key={'s' + l.key} x1={0} x2={10} y1={a.y} y2={a.y} className="lk-tick" />);
      if ('y' in b) ticks.push(<line key={'t' + l.key} x1={W - 10} x2={W} y1={b.y} y2={b.y} className="lk-tick" />);
      continue;
    }
    if ('edge' in a && 'edge' in b) continue;
    if (('edge' in a || 'edge' in b) && !sel) continue; // off-screen ends are counted, not drawn
    const y1 = 'y' in a ? a.y : a!.edge === 'top' ? 2 : (sv?.height ?? 0) + (sv?.top ?? 0) - gTop - 2;
    const y2 = 'y' in b ? b.y : b!.edge === 'top' ? 2 : (tv?.height ?? 0) + (tv?.top ?? 0) - gTop - 2;
    const dashed = ('y' in a && a.ancestor) || ('y' in b && b.ancestor) || 'edge' in a || 'edge' in b;
    const orphan = !src.fields.has(l.src);
    paths.push(
      <path key={l.key} d={`M0,${y1} C${W * 0.5},${y1} ${W * 0.5},${y2} ${W - 18},${y2}`}
        className={`lk ${sel ? 'lk--sel' : field ? 'lk--dim' : ''} ${dashed ? 'lk--dashed' : ''} ${orphan ? 'lk--orphan' : ''}`}
        onClick={() => onSelectTarget(l.fm)}><title>{`${l.src} → ${l.tgt}`}</title></path>
    );
  }
  const fx: ReactNode[] = [];
  if (linkMode === 'all' && tv)
    for (const p of Object.keys(model.targetFieldMappings)) {
      const e = endpoint(p, tv, tgt, tv.top - gTop);
      if (!e || !('y' in e) || e.ancestor) continue;
      const st = status(p);
      fx.push(
        <g key={p} className={`fx fx--${st.replace(/ /g, '-')} ${p === field ? 'is-sel' : ''}`} transform={`translate(${W - 18},${e.y - 8})`} onClick={() => onSelectTarget(p)} data-fx={p}>
          <rect width={17} height={16} rx={3} /><text x={8.5} y={12}>fx</text>
        </g>
      );
    }

  return (
    <SplitPane id={`${id}-trees`} direction="horizontal" defaultRatio={sourceRatio} minPx={200}
      first={
        <FieldTree structure={src} testId={`${id}-source-tree`} draggable onView={setSv} className="lt__tree"
          marker={(p) => (used.has(p) ? <span className="mk mk--used" title="used by the mapping">●</span> : null)} />
      }
      second={
        <div className="lt__right">
          <div ref={gutter} className="lt__gutter" style={{ width: W }} data-testid={`${id}-gutter`}>
            <svg width={W} height="100%">
              {ticks}{paths}{fx}
            </svg>
            {edgeCount.st > 0 && <span className="lt__count lt__count--st" title="links to source rows scrolled above">↑{edgeCount.st}</span>}
            {edgeCount.sb > 0 && <span className="lt__count lt__count--sb" title="links to source rows scrolled below">↓{edgeCount.sb}</span>}
            {edgeCount.tt > 0 && <span className="lt__count lt__count--tt" title="links to target rows scrolled above">↑{edgeCount.tt}</span>}
            {edgeCount.tb > 0 && <span className="lt__count lt__count--tb" title="links to target rows scrolled below">↓{edgeCount.tb}</span>}
          </div>
          <FieldTree structure={tgt} testId={`${id}-target-tree`} initialDepth={3} selected={field} onSelect={onSelectTarget} onView={setTv}
            onRowDrop={onDrop} marker={(p) => <StatusMarker path={p} />} className="lt__target"
            renderExtra={targetTree?.renderExtra} header={targetTree?.header} filter={targetTree?.filter} toolsExtra={targetTree?.toolsExtra} />
        </div>
      }
    />
  );
}
