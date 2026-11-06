import { Button, FormSelect, FormSelectOption, Label, TextInput } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, FunctionCatalogue, StructureLoaded } from '../../api/client';
import type { CatalogueParam } from '../../generated/function-catalogue';
import type { AuthoringId, FieldPath, ParamValue, Params, SourceFieldBox, Table, Udfs } from '../../generated/mapping-model';
import { localPath, stepName } from '../../model/field-path';
import { properAncestors } from '../../model/set-context';
import { selectTrace, selectTraceStale, type WorkingCopyStore } from '../store/working-copy';
import { BoxQueue, TargetFieldQueue, type LastTrace } from './DisplayQueue';
import './inspector-panel.css';
import { boxTitle, duplicateKey, inspected, slotChoices, slotNames, type Inspected, type TableRow } from './inspector-view';
import { remapChoices } from './remap-choices';

export interface InspectorProps {
  api: ApiClient;
  /** The working copy, which holds the selected box (ADR-0013). */
  store: WorkingCopyStore;
  /** The selected target field: only a box of its mapping is shown, as on the canvas. */
  targetField: FieldPath | null;
  /** The orphaned source-field boxes, found against the loaded `source`; each offers a remap. */
  orphaned: ReadonlySet<AuthoringId>;
  source: StructureLoaded | undefined;
  /** Remaps an orphaned source-field box of a target field mapping to a picked source field. */
  onRemap: (targetField: FieldPath, box: AuthoringId, field: FieldPath) => void;
}

/**
 * The inspector (ADR-0012, GLOSSARY), laid out as the prototype's e-inspector-deviation: the selected box's kind and
 * authoring id, its name with the deviation badge, its catalogue documentation as one fidelity line and the deviation
 * note, the toggle that makes it the result or clears it as the result, then the context of a source-field box and,
 * when it is orphaned, a remap picker, or the Inputs (one picker per input slot) and the Parameters (as editors), and
 * last its display queue. The params of a `udf` and an `unresolved` box, and of a function the catalogue lacks, are
 * shown read-only; a catalogue function without params has no Parameters. With no box shown, the selected target
 * field's display queue, when it has a mapping and a test run left a trace.
 */
export function Inspector({ api, store, targetField, orphaned, source, onRemap }: InspectorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const model = useStore(store, (s) => s.workingCopy);
  const selection = useStore(store, (s) => s.selection);
  const trace = useStore(store, selectTrace);
  const stale = useStore(store, selectTraceStale);
  const last = { trace, stale };
  const shown = inspected(model, targetField, selection);
  const mapping = targetField === null ? undefined : model.targetFieldMappings?.[targetField];

  return (
    // as wide as the editor's inspector pane, which its splitter sets (ADR-0012)
    <aside aria-label="Inspector" className="fm-inspector">
      {shown === undefined || catalogue.data === undefined ? (
        <>
          <p>Select a box to inspect it.</p>
          {mapping !== undefined && trace !== undefined && <TargetFieldQueue field={targetField!} mapping={mapping} last={last} />}
        </>
      ) : (
        // a box of its own: no draft of one box's editors is left in the next box's
        <BoxInspector
          key={shown.id}
          store={store}
          targetField={targetField!}
          shown={shown}
          catalogue={catalogue.data}
          udfs={model.udfs}
          // an orphaned box is only found against a loaded source structure
          remapSource={orphaned.has(shown.id) ? source : undefined}
          onRemap={(field) => onRemap(targetField!, shown.id, field)}
          last={last}
        />
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
  /** The source structure whose fields an orphaned source-field box can be remapped to; absent for any other box. */
  remapSource: StructureLoaded | undefined;
  onRemap: (field: FieldPath) => void;
  last: LastTrace;
}

function BoxInspector({ store, targetField, shown, catalogue, udfs, remapSource, onRemap, last }: BoxInspectorProps) {
  const { id, box } = shown;
  const entry = box.kind === 'function' ? catalogue[box.fn] : undefined;
  return (
    <>
      <div className="fm-inspector__kind">
        {KIND[box.kind]} · <code>{id}</code>
      </div>
      <h3 data-testid={`inspector:${id}`} className="fm-inspector__title">
        {boxTitle(box)}
        {entry?.fidelity.level === 'deviation' && (
          <Label isCompact color="orange">
            deviation
          </Label>
        )}
      </h3>
      {entry !== undefined && <Documentation entry={entry} />}
      <ResultToggle store={store} targetField={targetField} shown={shown} />
      {box.kind === 'source' ? (
        <>
          {remapSource && <RemapPicker box={box} source={remapSource} onRemap={onRemap} />}
          <ContextPicker store={store} targetField={targetField} id={id} box={box} />
        </>
      ) : (
        <>
          <Inputs store={store} targetField={targetField} shown={shown} names={slotNames(box, catalogue, udfs)} />
          {box.kind === 'function' && entry !== undefined ? (
            (entry.params ?? []).length > 0 && (
              <Section title="Parameters">
                {entry.params!.map((param) => (
                  <ParamEditor
                    key={param.name}
                    param={param}
                    value={box.params?.[param.name] ?? param.default}
                    onSet={(value) => store.getState().setParam(targetField, id, param.name, value, catalogue)}
                  />
                ))}
              </Section>
            )
          ) : (
            <ReadOnlyParams note={readOnlyNote(box.kind === 'unresolved' ? box.origin : box.kind)} params={box.params} />
          )}
        </>
      )}
      <BoxQueue id={id} last={last} />
    </>
  );
}

/** A part of the inspector under a visible heading, which names it (the prototype's Inputs and Parameters). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <h4 id={heading} className="fm-inspector__heading">
        {title}
      </h4>
      {children}
    </section>
  );
}

const KIND = { source: 'source-field box', function: 'function box', udf: 'UDF box', unresolved: 'unresolved function' } as const;

/**
 * The keyboard path to the sink (spec story 3): the box becomes the target field mapping's `result`, or, when it is the
 * result, `result` is cleared, as a wire into or off the sink does on the canvas.
 */
function ResultToggle({ store, targetField, shown }: { store: WorkingCopyStore; targetField: FieldPath; shown: Inspected }) {
  const isResult = shown.mapping.result === shown.id;
  return (
    <Button variant="secondary" onClick={() => store.getState().setResult(targetField, isResult ? null : shown.id)}>
      {isResult ? 'Clear result' : 'Make this the result'}
    </Button>
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

/**
 * The catalogue entry (ADR-0026) as the prototype's one fidelity line: family, execution kind, fidelity and
 * portability, with every detail, the inputs too, in its title. A deviation's text follows as a note.
 */
function Documentation({ entry }: { entry: FunctionCatalogue[string] }) {
  const kind = EXECUTION_KIND[entry.executionKind];
  const details = [
    `Family: ${entry.family}`,
    `Execution kind: ${kind}`,
    `Inputs: ${(entry.inputs ?? []).map((input) => input.name).join(', ')}`,
    `Fidelity: ${entry.fidelity.level}`,
    `Portable: ${entry.portable ? 'yes' : 'no'}`,
  ].join('\n');
  return (
    <section aria-label="Documentation">
      <p className="fm-inspector__fidelity" title={details}>
        {entry.family} · execution kind {kind} · fidelity {entry.fidelity.level} · {entry.portable ? 'portable' : 'not portable'}
      </p>
      {entry.fidelity.level === 'deviation' && (
        // the catalogue has no deviation code to put in bold before the text; the badge is in the title
        <p role="note" aria-label="Deviation" className="fm-inspector__note">
          {entry.fidelity.text}
        </p>
      )}
    </section>
  );
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
    <div className="fm-inspector__param">
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
    <fieldset aria-label={name} className="fm-inspector__table">
      <legend>{name}</legend>
      {rows.map((row, i) => (
        <div key={i} className="fm-inspector__table-row">
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
    <Section title="Parameters">
      <p>{note}</p>
      <dl className="fm-inspector__list">
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
    </Section>
  );
}

/** The context of a source-field box: one of its field's proper ancestors, the parent by default (GLOSSARY: Context). */
function ContextPicker({ store, targetField, id, box }: { store: WorkingCopyStore; targetField: FieldPath; id: string; box: SourceFieldBox }) {
  const ancestors = properAncestors(box.field);
  return (
    <section aria-label="Context">
      <p title={box.field}>Reads {localPath(box.field)}</p>
      <FormSelect aria-label="Context" value={box.context ?? ancestors[0]} onChange={(_event, context) => store.getState().setContext(targetField, id, context)}>
        {ancestors.map((ancestor, i) => (
          <FormSelectOption key={ancestor} value={ancestor} label={i === 0 ? `${stepName(ancestor)} (parent)` : stepName(ancestor)} />
        ))}
      </FormSelect>
    </section>
  );
}

/**
 * The remap of an orphaned source-field box (GLOSSARY: Remap): a field of the source structure, picked from all of them
 * in tree order; the box keeps its id and wires.
 */
function RemapPicker({ box, source, onRemap }: { box: SourceFieldBox; source: StructureLoaded; onRemap: (field: FieldPath) => void }) {
  const choices = useMemo(() => remapChoices(source), [source]);
  return (
    <section aria-label="Remap">
      <p title={box.field}>The source structure has no field {localPath(box.field)}.</p>
      <FormSelect aria-label="Remap to" value="" onChange={(_event, field) => onRemap(field)}>
        <FormSelectOption value="" label="Choose a source field" isPlaceholder isDisabled />
        {choices.map((choice) => (
          <FormSelectOption key={choice.path} value={choice.path} label={choice.label} />
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
    <Section title="Inputs">
      {names.map((name, slot) => (
        <div key={slot} className="fm-inspector__input">
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
    </Section>
  );
}
