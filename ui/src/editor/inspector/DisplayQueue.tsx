import { Label } from '@patternfly/react-core';
import type { TraceEntry } from '../../api/client';
import type { AuthoringId, FieldPath, TargetFieldMapping } from '../../generated/mapping-model';
import { stepName } from '../../model/field-path';
import { displayEntry, queueSize, type DisplayEntry, type OccurrenceRow, type ShownValue } from './display-queue';
// the module's styles go with the component, which the function editor's strip shows too (F-29)
import './inspector-panel.css';

/** The last run's trace by authoring id (`undefined` before a run), and whether it is a stale trace. */
export interface LastTrace {
  trace: Record<AuthoringId, TraceEntry> | undefined;
  stale: boolean;
}

export interface BoxQueueProps {
  id: AuthoringId | null;
  last: LastTrace;
  /** Names the region, "Display queue" by default; a second view of a queue on the page names itself apart. */
  label?: string;
  /** What the queue is of, as "result" or "selected box": shown with the box's id after the heading. */
  subject?: string;
}

/**
 * The display queue of a box (GLOSSARY): the queue or value it gave in the last test run; no box (`null`) gave none.
 * Its heading line, after the prototype's .dq__head, holds the subject and id when given, and a queue's size.
 */
export function BoxQueue({ id, last, label = 'Display queue', subject }: BoxQueueProps) {
  return (
    <section aria-label={label} className="fm-queue">
      <div className="fm-queue__head">
        <h4>Display queue</h4>
        {subject !== undefined && (
          <>
            {' '}
            <span className="fm-queue__subject">{subject}</span> <code className="fm-queue__id">{id}</code>
          </>
        )}
        <Size last={last} id={id} after={subject === undefined ? ' ' : ' · '} />
      </div>
      <Traced last={last} id={id} />
    </section>
  );
}

/** The display queue of a target field (ADR-0012): its result queue, then its occurrences per parent slot. */
export function TargetFieldQueue({ field, mapping, last }: { field: FieldPath; mapping: TargetFieldMapping; last: LastTrace }) {
  return (
    <section aria-label="Display queue of the target field" className="fm-queue">
      <h4>Display queue of {stepName(field)}</h4>
      <div className="fm-queue__head">
        <h5>Result queue</h5> <code className="fm-queue__id">{mapping.result}</code>
        <Size last={last} id={mapping.result} after=" · " />
      </div>
      <Traced last={last} id={mapping.result} />
      <h5>Occurrences</h5>
      <Traced last={last} id={mapping.id} />
    </section>
  );
}

/**
 * A traced queue's size on the heading line, "n contexts, n slots" after the text `after` (" · " when it follows an
 * id), after .dq__meta; nothing for any other entry.
 */
function Size({ last: { trace }, id, after }: { last: LastTrace; id: AuthoringId | null; after: string }) {
  const size = queueSize(id === null ? undefined : trace?.[id]);
  return size === undefined ? null : (
    <span className="fm-queue__size">
      {after}
      {size}
    </span>
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
          {/* each context a bracketed row of value boxes, "ctx n" above it (inspector-panel.css), after .dq__ctx */}
          <ol aria-label="Contexts" className="fm-queue__contexts">
            {entry.contexts.map((context, i) => (
              <li key={i} title={`context ${i + 1}`}>
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
      return <code className="fm-queue__value">{value.text}</code>;
    case 'empty':
      return (
        <Label isCompact variant="outline" className="fm-queue__value">
          ""
        </Label>
      );
    case 'suppress':
      return (
        <Label isCompact color="grey" className="fm-queue__value">
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
