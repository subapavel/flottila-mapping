import { Label } from '@patternfly/react-core';
import type { TraceEntry } from '../../api/client';
import type { AuthoringId, FieldPath, TargetFieldMapping } from '../../generated/mapping-model';
import { displayEntry, type DisplayEntry, type OccurrenceRow, type ShownValue } from './display-queue';
import { stepName } from './inspector';

/** The last run's trace by authoring id (`undefined` before a run), and whether it is a stale trace. */
export interface LastTrace {
  trace: Record<AuthoringId, TraceEntry> | undefined;
  stale: boolean;
}

/** The display queue of a box (GLOSSARY): the queue or value it gave in the last test run. */
export function BoxQueue({ id, last }: { id: AuthoringId; last: LastTrace }) {
  return (
    <section aria-label="Display queue">
      <h4>Display queue</h4>
      <Traced last={last} id={id} />
    </section>
  );
}

/** The display queue of a target field (ADR-0012): its result queue, then its occurrences per parent slot. */
export function TargetFieldQueue({ field, mapping, last }: { field: FieldPath; mapping: TargetFieldMapping; last: LastTrace }) {
  return (
    <section aria-label="Display queue of the target field">
      <h4>Display queue of {stepName(field)}</h4>
      <h5>Result queue</h5>
      <Traced last={last} id={mapping.result} />
      <h5>Occurrences</h5>
      <Traced last={last} id={mapping.id} />
    </section>
  );
}

/** One entry of the trace, its stale mark, or why there is none. */
function Traced({ last: { trace, stale }, id }: { last: LastTrace; id: AuthoringId | null }) {
  if (trace === undefined) return <p>No trace: run a test.</p>;
  const entry = id === null ? undefined : trace[id];
  return (
    <>
      {stale && (
        <p>
          <Label color="orange">stale</Label> The working copy changed since this run.
        </p>
      )}
      {entry === undefined ? <p>Not evaluated in the last test run.</p> : <Entry entry={displayEntry(entry)} />}
    </>
  );
}

function Entry({ entry }: { entry: DisplayEntry }) {
  switch (entry.kind) {
    case 'atomic':
      return (
        <p>
          <Value value={entry.value} /> <small>{entry.type}</small>
        </p>
      );
    case 'queue':
      return (
        <>
          <Capped text={entry.capped} />
          <ol aria-label="Contexts">
            {entry.contexts.map((context, i) => (
              <li key={i}>
                {context.length === 0 ? <em>no values</em> : context.map((value, j) => <Value key={j} value={value} />)}
              </li>
            ))}
          </ol>
        </>
      );
    case 'occurrences':
      return (
        <>
          <Capped text={entry.capped} />
          <p>
            Occurs {entry.min}..{entry.max ?? 'unbounded'}
          </p>
          <ol aria-label="Parent slots">
            {entry.rows.map((row, i) => (
              <Row key={i} row={row} min={entry.min} />
            ))}
          </ol>
        </>
      );
  }
}

/** A value, the empty value `""`, or SUPPRESS: each looks different. */
function Value({ value }: { value: ShownValue }) {
  switch (value.kind) {
    case 'value':
      return <code style={{ marginRight: '0.5em' }}>{value.text}</code>;
    case 'empty':
      return (
        <Label isCompact variant="outline" style={{ marginRight: '0.5em' }}>
          ""
        </Label>
      );
    case 'suppress':
      return (
        <Label isCompact color="grey" style={{ marginRight: '0.5em' }}>
          SUPPRESS
        </Label>
      );
  }
}

const STATUS = { created: 'created', suppressed: 'suppressed (SUPPRESS)', truncated: 'truncated (maxOccurs)' } as const;

function Row({ row, min }: { row: OccurrenceRow; min: number }) {
  if (row.kind === 'left-out') {
    return (
      <li>
        <em>
          parent slots {row.from}–{row.to} not in the trace
        </em>
      </li>
    );
  }
  return (
    <li data-testid={`parent-slot:${row.parentSlot}`}>
      parent slot {row.parentSlot}: {row.created} created
      {row.minOccurs && (
        <>
          {' '}
          <Label status="danger" isCompact>
            po:MINOCCURS
          </Label>{' '}
          fewer than {min}
        </>
      )}
      <ul>
        {row.slots.map(({ slot, status }) => (
          <li key={slot}>
            slot {slot} {STATUS[status]}
          </li>
        ))}
      </ul>
    </li>
  );
}

function Capped({ text }: { text: string | undefined }) {
  if (text === undefined) return null;
  return (
    <p>
      <Label color="purple" isCompact>
        capped
      </Label>{' '}
      {text}
    </p>
  );
}
