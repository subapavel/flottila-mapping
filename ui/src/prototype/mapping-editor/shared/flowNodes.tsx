// PROTOTYPE (#10, throwaway): React Flow node renderers for function boxes, source fields and
// target fields. Shared by variants (a) and (b); each variant owns its own layout.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { CATALOGUE_BY_NAME, fidelityText } from '../model/catalogue';
import { ancestors, parentPath, shortPath, type Structure } from '../model/structures';
import type { AuthoringId, Box, FieldPath } from '../model/types';

export type BoxNodeData = {
  box: Box;
  id: AuthoringId;
  inputNames: string[];
  orphaned: boolean;
  errors: string[];
  src: Structure;
  editable: boolean;
  onParam?: (id: AuthoringId, name: string, value: string) => void;
  onContext?: (id: AuthoringId, ctx: FieldPath | undefined) => void;
};
export type BoxNodeT = Node<BoxNodeData, 'box'>;
export type FieldNodeT = Node<{ path: FieldPath; side: 'source' | 'target'; status?: string; orphaned?: boolean }, 'field'>;

function FidelityBadge({ fn }: { fn: string }) {
  const c = CATALOGUE_BY_NAME[fn];
  if (!c || c.fidelity.level === 'exact') return null;
  return (
    <span className={`fid fid--${c.fidelity.level}`} title={fidelityText(c)}>
      {c.fidelity.level === 'deviation' ? `≠ ${c.fidelity.deviationId}` : 'assumed'}
    </span>
  );
}

export const BoxNode = memo(function BoxNode({ data, selected }: NodeProps<BoxNodeT>) {
  const { box, id, inputNames, orphaned, errors } = data;
  const kindClass = box.kind === 'function' && box.fn === 'constant' ? 'constant' : box.kind;
  const exec = box.kind === 'function' ? CATALOGUE_BY_NAME[box.fn]?.executionKind : undefined;
  const title =
    box.kind === 'source' ? shortPath(box.field).split('/').slice(-2).join('/') :
    box.kind === 'function' ? box.fn : box.kind === 'udf' ? box.udf : box.name;
  return (
    <div className={`fbox fbox--${kindClass} ${selected ? 'is-selected' : ''} ${orphaned ? 'is-orphaned' : ''} ${errors.length ? 'has-error' : ''}`} title={errors.join('\n')}>
      <div className="fbox__head">
        <span className="fbox__kind">{box.kind === 'source' ? 'source field' : box.kind === 'udf' ? 'UDF' : box.kind === 'unresolved' ? `unresolved (${box.origin})` : exec === 'single' || !exec ? 'fn' : `${exec} fn`}</span>
        <span className="fbox__title">{title}</span>
        {box.kind === 'function' && <FidelityBadge fn={box.fn} />}
        {orphaned && <span className="fbox__orphan">orphaned</span>}
      </div>
      <code className="fbox__id">{id}</code>
      {inputNames.map((n, i) => (
        <div key={i} className="fbox__in" style={{ height: 20 }}>
          <Handle type="target" position={Position.Left} id={`in-${i}`} />
          <span>{n}</span>
        </div>
      ))}
      {box.kind === 'source' && <SourceContext data={data} />}
      {box.kind !== 'source' && box.params && Object.entries(box.params).map(([k, v]) => (
        <label key={k} className="fbox__param">
          <span>{k}</span>
          {typeof v === 'string' ? (
            <input className="nodrag" value={v} readOnly={!data.editable} onChange={(e) => data.onParam?.(id, k, e.target.value)} />
          ) : (
            <span className="fbox__table" title={Object.entries(v).map(([a, b]) => `${a} → ${b}`).join('\n')}>table, {Object.keys(v).length} rows</span>
          )}
        </label>
      ))}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
});

function SourceContext({ data }: { data: BoxNodeData }) {
  const b = data.box as Extract<Box, { kind: 'source' }>;
  const parent = parentPath(b.field);
  const ctx = b.context ?? parent;
  const opts = ancestors(data.src, b.field);
  return (
    <label className="fbox__param">
      <span>context</span>
      <select className="nodrag" value={ctx} disabled={!data.editable} onChange={(e) => data.onContext?.(data.id, e.target.value)}>
        {opts.map((a) => <option key={a} value={a}>{shortPath(a).split('/').pop()}{a === parent ? ' (parent)' : ''}</option>)}
      </select>
      {b.context && <span className="fbox__nondefault" title="non-default context">≠ parent</span>}
    </label>
  );
}

export const FieldNode = memo(function FieldNode({ data, selected }: NodeProps<FieldNodeT>) {
  const parts = shortPath(data.path).split('/');
  return (
    <div className={`fnode fnode--${data.side} ${selected ? 'is-selected' : ''} ${data.orphaned ? 'is-orphaned' : ''}`} title={data.path}>
      {data.side === 'target' && <Handle type="target" position={Position.Left} id="in-0" />}
      <span className="fnode__side">{data.side === 'source' ? 'source field' : 'target field'}</span>
      <span className="fnode__name">{parts.slice(-2).join('/')}</span>
      {data.status && <span className={`fnode__status st--${data.status.replace(/ /g, '-')}`}>{data.status}</span>}
      {data.orphaned && <span className="fbox__orphan">orphaned</span>}
      {data.side === 'source' && <Handle type="source" position={Position.Right} id="out" />}
    </div>
  );
});

export const nodeTypes = { box: BoxNode, field: FieldNode };
