import { Label, Modal, ModalBody, ModalHeader, Switch } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import type { TraceEntry } from '../../api/client';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { displayEntry, type ShownValue } from './display-queue';
import { TARGET, type ExpressionGraph, type ExpressionNode } from '../definition/expression/expression-graph';
import { readPanelPreference, savePanelPreference } from '../definition/panel-preferences';
import { queueColumns, type QueueCell } from './queue-columns';
import './test.css';

/** The most rows the dialog shows, as in the prototype. */
const MAX_ROWS = 500;
const NUMBERS_KEY = 'definition.queue.numbers';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const STATUS = { created: 'created', suppressed: 'suppressed (SUPPRESS)', truncated: 'truncated (maxOccurs)' } as const;

export interface QueueDialogProps {
  graph: ExpressionGraph;
  /** The node whose queue shows, a box or the target field, as the graph has it now. */
  node: ExpressionNode;
  /** The last test run's trace by authoring id; none before a run. */
  trace: Readonly<Record<string, TraceEntry>> | undefined;
  /** Whether the trace is a stale trace (GLOSSARY): it still shows, marked. */
  stale: boolean;
  /** The target field mapping's authoring id, under which the trace keeps the target field's occurrences. */
  mappingId: string | undefined;
  browserState: BrowserStateStore;
  onClose: () => void;
}

function Value({ value }: { value: ShownValue }) {
  switch (value.kind) {
    case 'value':
      return <code>{value.text}</code>;
    case 'empty':
      return <code>""</code>;
    case 'suppress':
      return (
        <Label isCompact color="grey">
          SUPPRESS
        </Label>
      );
  }
}

function Cell({ cell }: { cell: QueueCell }) {
  if (cell.kind === 'value') return <Value value={cell.value} />;
  return <small>{cell.kind === 'end' ? 'End' : 'Boundary'}</small>;
}

/**
 * The Display Queue of a node (the prototype's Queue dialog, GLOSSARY: Display queue): the queues the last test run traced
 * for its inputs and output, read by authoring id, a row per value and per context's end; the target field adds its
 * occurrences per parent slot. After an edit the trace is a stale trace: it still shows, marked, until the next run.
 */
export function QueueDialog({ graph, node, trace, stale, mappingId, browserState, onClose }: QueueDialogProps) {
  const [numbers, setNumbers] = useState(() => readPanelPreference(browserState, NUMBERS_KEY, false, isBoolean));
  const { name, columns } = queueColumns(graph, node, trace ?? {});
  const count = Math.max(0, ...columns.map((c) => c.cells?.length ?? 0));
  const occurrences = node.id === TARGET && mappingId !== undefined ? trace?.[mappingId] : undefined;
  const shownOccurrences = occurrences === undefined ? undefined : displayEntry(occurrences);
  const changeNumbers = (checked: boolean) => {
    setNumbers(checked);
    savePanelPreference(browserState, NUMBERS_KEY, checked);
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label="Display Queue">
      <ModalHeader title="Display Queue" description={trace === undefined ? 'No test run yet' : 'Traced queue · last test run'} />
      <ModalBody>
        <div className="queue-bar">
          <strong>
            <i>ƒ</i> {name}
          </strong>
          <Switch id="queue-row-numbers" label="Row numbers" isChecked={numbers} onChange={(_, checked) => changeNumbers(checked)} />
        </div>
        {trace === undefined ? (
          <p className="queue-note">No trace: run the simulation on the Test tab.</p>
        ) : (
          <>
            {stale && (
              <p className="queue-note">
                <Label color="orange" isCompact>
                  stale
                </Label>{' '}
                The working copy changed since this run.
              </p>
            )}
            <div className="queue-scroll">
              <Table aria-label={`${name} queue`} role="table" variant="compact" gridBreakPoint="" className="queue-table">
                <Thead>
                  <Tr>
                    {numbers && <Th>#</Th>}
                    {columns.map((c) => (
                      <Th key={c.label}>{c.label}</Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {Array.from({ length: Math.min(MAX_ROWS, Math.max(1, count)) }, (_, i) => (
                    <Tr key={i}>
                      {numbers && <Td>{i}</Td>}
                      {columns.map((c) => {
                        const cell = c.cells?.[i];
                        return (
                          <Td key={c.label} className={cell && cell.kind !== 'value' ? `q-${cell.kind}` : undefined}>
                            {cell ? <Cell cell={cell} /> : c.cells === undefined && i === 0 ? <em>Not evaluated in the last test run</em> : null}
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            {columns
              .filter((c) => c.size !== undefined)
              .map((c) => (
                <p key={c.label} className="queue-note">
                  {c.label} · {c.size}
                  {c.capped && ` · capped: ${c.capped}`}
                </p>
              ))}
            {count > MAX_ROWS && (
              <p className="queue-note">
                Showing the first {MAX_ROWS} of {count} rows.
              </p>
            )}
            {shownOccurrences?.kind === 'occurrences' && (
              <section className="queue-occurrences" aria-label="Occurrences">
                <h4>
                  Occurrences of {name}, {shownOccurrences.min}..{shownOccurrences.max ?? 'unbounded'}
                </h4>
                {shownOccurrences.capped && <p className="queue-note">capped: {shownOccurrences.capped}</p>}
                <ol aria-label="Parent slots">
                  {shownOccurrences.rows.map((row) =>
                    row.kind === 'left-out' ? (
                      <li key={`${row.from}-${row.to}`}>
                        <em>
                          parent slots {row.from}–{row.to} not in the trace
                        </em>
                      </li>
                    ) : (
                      <li key={row.parentSlot}>
                        parent slot {row.parentSlot}: {row.created} created
                        {row.minOccurs && ` · po:MINOCCURS, fewer than ${shownOccurrences.min}`}
                        <ul>
                          {row.slots.map(({ slot, status }) => (
                            <li key={slot}>
                              slot {slot} {STATUS[status]}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ),
                  )}
                </ol>
              </section>
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
