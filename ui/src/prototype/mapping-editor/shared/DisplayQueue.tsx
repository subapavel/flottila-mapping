// PROTOTYPE (#10, throwaway): display queue: contexts, context changes, empty contexts, SUPPRESS.
import { SUPPRESS, type Queue } from '../eval/mockEvaluator';

const MAX_SLOTS = 300;

export function DisplayQueue({ queue, generating, title, id, compact }: {
  queue: Queue | null;
  generating?: boolean;
  title: string;
  id?: string;
  compact?: boolean;
}) {
  if (!queue) return <div className="dq dq--none">No value for {title} (unconnected, unresolved or orphaned).</div>;
  let slotNo = 0;
  let shown = 0;
  const total = queue.reduce((a, c) => a + c.length, 0);
  return (
    <div className={`dq ${compact ? 'dq--compact' : ''}`} data-testid="display-queue">
      <div className="dq__head">
        <strong>Display queue</strong> <span className="dq__title">{title}</span>
        {id && <code className="dq__id">{id}</code>}
        <span className="dq__meta">
          {generating ? 'generating function (one value per parent occurrence)' : `${queue.length} context${queue.length === 1 ? '' : 's'}, ${total} slot${total === 1 ? '' : 's'}`}
        </span>
      </div>
      {queue.length === 0 && <div className="dq__noctx">no contexts at all (the context field is absent in the input, or an input is unconnected)</div>}
      <div className="dq__row">
        {queue.map((ctx, ci) => {
          if (shown > MAX_SLOTS) return null;
          return (
            <div key={ci} className={`dq__ctx ${ctx.length === 0 ? 'dq__ctx--empty' : ''}`} title={`context ${ci + 1}`}>
              <span className="dq__ctxno">ctx {ci + 1}</span>
              {ctx.length === 0 && <span className="dq__emptylabel">empty context</span>}
              {ctx.map((s, si) => {
                slotNo++;
                shown++;
                return (
                  <span key={si} className={`dq__slot ${s === SUPPRESS ? 'dq__slot--suppress' : ''} ${s === '' ? 'dq__slot--blank' : ''}`}>
                    <sup>{slotNo}</sup>
                    {s === SUPPRESS ? 'SUPPRESS' : s === '' ? '""' : s}
                  </span>
                );
              })}
            </div>
          );
        })}
        {shown > MAX_SLOTS && <span className="dq__more">… {total - shown} more slots</span>}
      </div>
    </div>
  );
}
