// PROTOTYPE (#10, throwaway). Variant (f) "Split + target status": top = source tree | links |
// target tree with Occ./type/status/inline-chain columns and a status filter; bottom = one closable
// tab per open target field mapping, canvas with the display queue docked under it; the bottom can
// be maximised, leaving a one-line breadcrumb on top.
import { Breadcrumb, BreadcrumbItem, Button, Label, Tab, Tabs, TabTitleText, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { useCallback, useEffect, useState } from 'react';
import { chainText } from '../model/derive';
import { occurrenceText, shortPath } from '../model/structures';
import type { FieldPath } from '../model/types';
import { useEditor } from '../shared/editorState';
import { GraphCanvas } from '../shared/GraphCanvas';
import { LinkedTrees } from '../shared/LinkedTrees';
import { SplitPane } from '../shared/SplitPane';
import { useStatus } from '../shared/StatusMarker';
import { DEFAULT_FIELD } from './VariantD';

const FILTERS = ['all', 'mapped', 'attention', 'unmapped mandatory', 'orphaned', 'error'];
const COLOR: Record<string, 'green' | 'red' | 'orange' | 'grey' | 'blue'> = { mapped: 'green', 'unmapped mandatory': 'red', orphaned: 'orange', error: 'red', auto: 'blue', unmapped: 'grey' };

export function VariantF() {
  const { model, tgt, field, select } = useEditor();
  const status = useStatus();
  const url = new URLSearchParams(location.search);
  const [filter, setFilter] = useState(url.get('status') ?? 'all');
  const [open, setOpen] = useState<FieldPath[]>(() => (url.get('open') ? url.get('open')!.split(',') : []));
  const [max, setMax] = useState(url.get('max') === '1');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!field) select(open[open.length - 1] ?? DEFAULT_FIELD, null); }, []);
  useEffect(() => { if (field && !open.includes(field)) setOpen((o) => [...o, field]); }, [field, open]);

  const close = (p: FieldPath) => {
    const i = open.indexOf(p);
    const rest = open.filter((x) => x !== p);
    setOpen(rest);
    if (p === field) select(rest[Math.min(i, rest.length - 1)] ?? null, null);
  };
  const statusFilter = useCallback((p: FieldPath) => {
    const s = status(p);
    if (filter === 'all') return true;
    if (filter === 'attention') return s === 'unmapped mandatory' || s === 'orphaned' || s === 'error';
    return s === filter;
  }, [filter, status]);

  const extra = (p: FieldPath) => {
    const f = tgt.fields.get(p)!;
    const fm = model.targetFieldMappings[p];
    const s = status(p);
    const chain = fm ? chainText(fm) : '';
    return (
      <>
        <span className="fcol fcol--occ">{occurrenceText(f)}</span>
        <span className="fcol fcol--type">{f.type ?? '—'}</span>
        <span className="fcol fcol--status">{s !== 'unmapped' && <Label isCompact color={COLOR[s]}>{s}</Label>}</span>
        <span className="fcol fcol--chain" title={chain}>{chain}</span>
      </>
    );
  };
  const header = (
    <div className="fcols__head"><span className="fcol--name">Target field</span><span className="fcol fcol--occ">Occ.</span><span className="fcol fcol--type">Type</span><span className="fcol fcol--status">Status</span><span className="fcol fcol--chain">Mapping</span></div>
  );
  const crumbs = field ? shortPath(field).split('/').filter(Boolean) : [];

  return (
    <div className="vsplit" data-testid="variant-f">
      <SplitPane id="f" direction="vertical" defaultRatio={0.5} minPx={60} testId="f-split" forceCollapsed={max ? 'first' : undefined}
        collapsedFirst={
          <div className="crumb" data-testid="breadcrumb">
            <Breadcrumb>{crumbs.map((c, i) => <BreadcrumbItem key={i} isActive={i === crumbs.length - 1}>{c}</BreadcrumbItem>)}</Breadcrumb>
            <Button size="sm" variant="link" onClick={() => setMax(false)}>Show structures</Button>
          </div>
        }
        first={
          <LinkedTrees id="f" linkMode="all" sourceRatio={0.28} onSelectTarget={(p) => select(p, null)}
            targetTree={{
              renderExtra: extra, header, filter: filter === 'all' ? null : statusFilter,
              toolsExtra: (
                <ToggleGroup isCompact aria-label="status filter" className="f__filter">
                  {FILTERS.map((x) => <ToggleGroupItem key={x} text={x} isSelected={filter === x} onChange={() => setFilter(x)} />)}
                </ToggleGroup>
              )
            }} />
        }
        second={
          <div className="lower">
            <div className="lower__tabbar">
              <Tabs activeKey={field ?? ''} onSelect={(_e, k) => select(String(k), null)} onClose={(_e, k) => close(String(k))} className="lower__tabs" isOverflowHorizontal>
                {open.map((p) => (
                  <Tab key={p} eventKey={p} closeButtonAriaLabel={`close ${p}`}
                    title={<TabTitleText><span className={`mk st--${status(p).replace(/ /g, '-')}`}>●</span> {shortPath(p).split('/').slice(-2).join('/')}</TabTitleText>} />
                ))}
              </Tabs>
              <Button size="sm" variant={max ? 'primary' : 'secondary'} onClick={() => setMax(!max)} data-testid="maximise">{max ? 'Restore' : 'Maximise'}</Button>
            </div>
            <div className="lower__body">
              {field && open.includes(field) ? <GraphCanvas key={field} field={field} scope="f" palette dockedQueue /> : <div className="muted lower__scroll">Click a target field to open its mapping in a tab.</div>}
            </div>
          </div>
        }
      />
    </div>
  );
}
