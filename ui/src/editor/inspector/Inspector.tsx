import { Button, FormSelect, FormSelectOption, Label, TextInput } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, FunctionCatalogue } from '../../api/client';
import type { CatalogueParam } from '../../generated/function-catalogue';
import type { FieldPath, ParamValue, Params, SourceFieldBox, Table, Udfs } from '../../generated/mapping-model';
import { properAncestors } from '../../model/set-context';
import type { WorkingCopyStore } from '../store/working-copy';
import { badges, boxTitle, duplicateKey, inspected, slotChoices, slotNames, stepName, type Badge, type Inspected, type TableRow } from './inspector';

export interface InspectorProps {
  api: ApiClient;
  /** The working copy, which holds the selected box (ADR-0013). */
  store: WorkingCopyStore;
  /** The selected target field: only a box of its mapping is shown, as on the canvas. */
  targetField: FieldPath | null;
}

/**
 * The inspector (ADR-0012, GLOSSARY): the selected box's catalogue documentation and badges, its box parameters as
 * editors, the context of a source-field box, and one picker per input slot. The params of a `udf` and an
 * `unresolved` box, and of a function the catalogue lacks, are shown read-only.
 */
export function Inspector({ api, store, targetField }: InspectorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const model = useStore(store, (s) => s.workingCopy);
  const selection = useStore(store, (s) => s.selection);
  const shown = inspected(model, targetField, selection);

  return (
    <aside aria-label="Inspector" style={{ width: '18rem', flex: 'none' }}>
      {shown === undefined || catalogue.data === undefined ? (
        <p>Select a box to inspect it.</p>
      ) : (
        // a box of its own: no draft of one box's editors is left in the next box's
        <BoxInspector key={shown.id} store={store} targetField={targetField!} shown={shown} catalogue={catalogue.data} udfs={model.udfs} />
      )}
    </aside>
  );
}

interface BoxInspectorProps {
  store: WorkingCopyStore;
  targetField: FieldPath;
  shown: Inspected;
  catalogue: FunctionCatalogue;
  udfs: Udfs | undefined;
}

function BoxInspector({ store, targetField, shown, catalogue, udfs }: BoxInspectorProps) {
  const { id, box } = shown;
  const entry = box.kind === 'function' ? catalogue[box.fn] : undefined;
  return (
    <>
      <h3 data-testid={`inspector:${id}`}>
        {boxTitle(box)} <small>{id}</small>
      </h3>
      {box.kind === 'source' ? (
        <ContextPicker store={store} targetField={targetField} id={id} box={box} />
      ) : box.kind === 'function' && entry !== undefined ? (
        <>
          <Documentation entry={entry} />
          <section aria-label="Parameters">
            {(entry.params ?? []).map((param) => (
              <ParamEditor
                key={param.name}
                param={param}
                value={box.params?.[param.name] ?? param.default}
                onSet={(value) => store.getState().setParam(targetField, id, param.name, value, catalogue)}
              />
            ))}
          </section>
        </>
      ) : (
        <ReadOnlyParams note={readOnlyNote(box.kind === 'unresolved' ? box.origin : box.kind)} params={box.params} />
      )}
      <Inputs store={store} targetField={targetField} shown={shown} names={slotNames(box, catalogue, udfs)} />
    </>
  );
}

/** Why a box's params are read-only: a UDF, an unresolved function by where it came from, or a function the catalogue lacks. */
function readOnlyNote(kind: 'udf' | 'function' | 'po' | 'cpi' | 'editor'): string {
  switch (kind) {
    case 'udf':
      return 'A UDF: its parameters are read-only.';
    case 'function':
      return 'Not in the function catalogue: its parameters are read-only.';
    default:
      return `An unresolved function from ${kind}: its parameters are read-only.`;
  }
}

const EXECUTION_KIND = { single: 'single value', context: 'context', queue: 'queue' } as const;

/** The catalogue entry (ADR-0026): family, execution kind, inputs, fidelity and portability, with their badges. */
function Documentation({ entry }: { entry: FunctionCatalogue[string] }) {
  return (
    <section aria-label="Documentation">
      <dl style={{ margin: 0 }}>
        <dt>Family</dt>
        <dd>{entry.family}</dd>
        <dt>Execution kind</dt>
        <dd>{EXECUTION_KIND[entry.executionKind]}</dd>
        <dt>Inputs</dt>
        <dd>{(entry.inputs ?? []).map((input) => input.name).join(', ')}</dd>
        <dt>Fidelity</dt>
        <dd>{entry.fidelity.level}</dd>
        <dt>Portable</dt>
        <dd>{entry.portable ? 'yes' : 'no'}</dd>
      </dl>
      {badges(entry).map((badge) => (
        <BadgeView key={badge.kind} badge={badge} />
      ))}
    </section>
  );
}

/** A deviation badge shows its text next to it. */
function BadgeView({ badge }: { badge: Badge }) {
  switch (badge.kind) {
    case 'assumed':
      return <Label color="blue">assumed</Label>;
    case 'deviation':
      return (
        <p>
          <Label color="orange">deviation</Label> {badge.text}
        </p>
      );
    case 'not-portable':
      return <Label color="grey">not portable</Label>;
  }
}

/** Enter in a text field commits it. */
const onEnter = (commit: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') commit();
};

/**
 * One box parameter by its catalogue type: a select of its `values`, a text field (a `syntax` param's pattern is
 * checked by compile), or a table editor. A value equal to the default is left out of the model by the command.
 */
function ParamEditor({ param, value, onSet }: { param: CatalogueParam; value: ParamValue; onSet: (value: ParamValue) => void }) {
  if (param.type === 'table') return <TableEditor name={param.name} table={value as Table} onSet={onSet} />;
  return (
    <div>
      <span>{param.name}</span>
      {param.values ? (
        <FormSelect aria-label={param.name} value={value} onChange={(_event, next) => onSet(next)}>
          {param.values.map((v) => (
            <FormSelectOption key={v} value={v} label={v} />
          ))}
        </FormSelect>
      ) : (
        <TextParam name={param.name} value={value as string} onSet={onSet} />
      )}
      {param.syntax && <small>A {param.syntax}, checked by compile.</small>}
    </div>
  );
}

/** A text field that keeps the author's draft until it loses the focus or Enter is pressed. */
function TextParam({ name, value, onSet }: { name: string; value: string; onSet: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // the model changed under the field (undo, another box): show the model's value
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setDraft(value);
  }
  const commit = () => onSet(draft);
  return <TextInput aria-label={name} value={draft} onChange={(_event, next) => setDraft(next)} onBlur={commit} onKeyDown={onEnter(commit)} />;
}

/**
 * A table parameter as key–value rows. An edit is committed when a field loses the focus, on Enter and on Remove;
 * rows with a duplicate key are refused and stay in the editor with the reason, the model unchanged.
 */
function TableEditor({ name, table, onSet }: { name: string; table: Table; onSet: (value: Table) => void }) {
  const toRows = (t: Table): TableRow[] => Object.entries(t).map(([key, value]) => ({ key, value }));
  const [rows, setRows] = useState(() => toRows(table));
  const [duplicate, setDuplicate] = useState<string | undefined>(undefined);
  // the model's table changed under the editor (undo, another box): show its rows; a save that keeps the same rows
  // keeps the rows the author has not committed yet
  const [shownTable, setShownTable] = useState(() => JSON.stringify(table));
  if (JSON.stringify(table) !== shownTable) {
    setShownTable(JSON.stringify(table));
    setRows(toRows(table));
    setDuplicate(undefined);
  }

  const commit = (next: TableRow[] = rows) => {
    const repeated = duplicateKey(next);
    setDuplicate(repeated);
    if (repeated === undefined) onSet(Object.fromEntries(next.map((row) => [row.key, row.value])));
  };
  const edit = (index: number, part: keyof TableRow, text: string) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [part]: text } : row)));

  return (
    <fieldset aria-label={name} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{name}</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.25rem' }}>
          <TextInput aria-label={`${name} key ${i + 1}`} value={row.key} onChange={(_event, text) => edit(i, 'key', text)} onBlur={() => commit()} onKeyDown={onEnter(commit)} />
          <TextInput aria-label={`${name} value ${i + 1}`} value={row.value} onChange={(_event, text) => edit(i, 'value', text)} onBlur={() => commit()} onKeyDown={onEnter(commit)} />
          <Button
            variant="link"
            isInline
            aria-label={`Remove ${name} row ${i + 1}`}
            onClick={() => {
              const next = rows.filter((_, j) => j !== i);
              setRows(next);
              commit(next);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button variant="link" isInline onClick={() => setRows([...rows, { key: '', value: '' }])}>
        Add row to {name}
      </Button>
      {duplicate !== undefined && <p role="alert">The key "{duplicate}" is already in the table.</p>}
    </fieldset>
  );
}

/** The params of a box the inspector does not edit, as they are in the model. */
function ReadOnlyParams({ note, params }: { note: string; params: Params | undefined }) {
  return (
    <section aria-label="Parameters">
      <p>{note}</p>
      <dl style={{ margin: 0 }}>
        {Object.entries(params ?? {}).map(([name, value]) => (
          <div key={name} data-testid={`param:${name}`}>
            <dt>{name}</dt>
            <dd>
              {typeof value === 'string'
                ? value
                : Object.entries(value)
                    .map(([key, row]) => `${key} = ${row}`)
                    .join('; ')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The context of a source-field box: one of its field's proper ancestors, the parent by default (GLOSSARY: Context). */
function ContextPicker({ store, targetField, id, box }: { store: WorkingCopyStore; targetField: FieldPath; id: string; box: SourceFieldBox }) {
  const ancestors = properAncestors(box.field);
  return (
    <section aria-label="Context">
      <p title={box.field}>Reads {stepName(box.field)}</p>
      <FormSelect aria-label="Context" value={box.context ?? ancestors[0]} onChange={(_event, context) => store.getState().setContext(targetField, id, context)}>
        {ancestors.map((ancestor, i) => (
          <FormSelectOption key={ancestor} value={ancestor} label={i === 0 ? `${stepName(ancestor)} (parent)` : stepName(ancestor)} />
        ))}
      </FormSelect>
    </section>
  );
}

/** One picker per input slot: a box of the same target field mapping, or not connected; a refusal shows as on the canvas. */
function Inputs({ store, targetField, shown, names }: { store: WorkingCopyStore; targetField: FieldPath; shown: Inspected; names: string[] }) {
  const { id, box, mapping } = shown;
  const inputs = box.kind === 'source' ? [] : (box.inputs ?? []);
  const choices = slotChoices(mapping, id);
  if (names.length === 0) return null;
  return (
    <section aria-label="Inputs">
      {names.map((name, slot) => (
        <div key={slot}>
          <span>{name}</span>
          <FormSelect
            aria-label={`Input ${name}`}
            value={inputs[slot] ?? ''}
            onChange={(_event, source) => store.getState().setInput(targetField, id, slot, source === '' ? null : source)}
          >
            <FormSelectOption value="" label="Not connected" />
            {choices.map((choice) => (
              <FormSelectOption key={choice.id} value={choice.id} label={`${choice.title} (${choice.id})`} />
            ))}
          </FormSelect>
        </div>
      ))}
    </section>
  );
}
