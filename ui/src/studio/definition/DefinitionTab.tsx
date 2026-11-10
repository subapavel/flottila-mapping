import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, StructureLoaded } from '../../api/client';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { reachedSourceFields, refusalAt } from '../../editor/structure-overview/rows';
import { useStructure } from '../../editor/structure-overview/structure-query';
import type { WorkingCopyStore } from '../../editor/store/working-copy';
import type { FieldPath } from '../../generated/mapping-model';
import { localPath, stepName } from '../../model/field-path';
import { addNode, addVariable, canvasOf, definitionPreview, newPreviewId, variableTargets, type PreviewNode } from '../mock/definition-preview';
import { testInput, testInstances } from '../mock/test-instances';
import { testPreview } from '../mock/test-preview';
import { formatOf } from '../test/documents';
import { testSourceKey } from '../test/test-session';
import { AddVariable } from './AddVariable';
import { connectedFields, keptRows, typeKind, type Side } from './definition-model';
import './definition.css';
import { action, ActionMenu, useActionMenu, type MenuItem } from './expression/ActionMenu';
import { Canvas } from './expression/Canvas';
import { ClearMapping, DefinitionBar, ExpressionHeader, TextPreview, useDependencies } from './expression/DefinitionTools';
import { MessageOverview } from './MessageOverview';
import { readPanelPreference, savePanelPreference } from './panel-preferences';
import { SchemaPane, VIEW_MODES } from './SchemaPane';
import { useSplitLayout, VerticalSplitLayout } from './SplitLayout';
import type { ViewMode } from './TreeToolbar';

export interface DefinitionTabProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
  browserState: BrowserStateStore;
  /** Where the messages are chosen: the Signature tab. */
  onChooseMessages: () => void;
}

const viewKey = (side: Side) => `definition.${side}.view`;
const isViewMode = (value: unknown): value is ViewMode => VIEW_MODES.includes(value as ViewMode);
const loaded = (data: unknown) => data as StructureLoaded;
/** The last step of a variable's path (the Add Variable dialog's names). */
const VARIABLE_STEP = /\/\$[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The Definition tab (ADR-0028): the source and target message panes above the mapping expression of the selected target
 * field (#157), the height between them resizable and kept per user, as are each pane's view mode and their widths. A
 * target row selects its target field mapping (the store's selected target); a source row is selected in its pane only.
 * In edit mode a source row dropped on a target row, or double-clicked while a target field is selected, adds a
 * source-field box to that target field mapping (the link command), which the fields' refusals refuse (ADR-0027).
 */
export function DefinitionTab({ mappingId, api, store, browserState, onChooseMessages }: DefinitionTabProps) {
  const model = useStore(store, (s) => s.workingCopy);
  const editing = useStore(store, (s) => s.editing);
  const previewStore = definitionPreview(store, browserState, mappingId);
  const preview = useStore(previewStore, (s) => s.value);
  const { variables } = preview;
  const picked = useStore(store, (s) => s.selectedTarget);
  const [variableParent, setVariableParent] = useState<FieldPath | null>(null);
  const [selectedSource, setSelectedSource] = useState<FieldPath | null>(null);
  const [views, setViews] = useState<Record<Side, ViewMode>>(() => ({
    source: readPanelPreference(browserState, viewKey('source'), 'Table', isViewMode),
    target: readPanelPreference(browserState, viewKey('target'), 'Table', isViewMode),
  }));
  const layout = useSplitLayout(browserState, 'definition.layout', 0.4);
  // the shell shows this tab only once both messages are chosen
  const sourceRef = model.source!;
  const targetRef = model.target!;
  // the panes' own queries: a row to drop or add exists only once its structure has loaded
  const sourceQuery = useStructure(mappingId, api, sourceRef);
  const targetQuery = useStructure(mappingId, api, targetRef);
  const connected = useMemo(() => connectedFields(model), [model]);
  const mappings = model.targetFieldMappings ?? {};
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const [dataFlow, setDataFlow] = useState(true);
  const [clearing, setClearing] = useState(false);
  const dependencies = useDependencies(browserState, mappingId);
  const { menu, showMenu, closeMenu } = useActionMenu();
  const fieldTypes = useMemo(() => {
    const types = (data: unknown) =>
      new Map(data && loaded(data).kind === 'loaded' ? keptRows(loaded(data), () => true).map((row) => [row.path, typeKind(row.field)] as const) : []);
    return { source: types(sourceQuery.data), target: types(targetQuery.data) };
  }, [sourceQuery.data, targetQuery.data]);
  // a variable a discard took away leaves nothing selected; a JSON property may be named like a variable
  const selectedTarget = picked !== null && VARIABLE_STEP.test(picked) && !variables.includes(picked) && !fieldTypes.target.has(picked) ? null : picked;

  const setView = (side: Side, mode: ViewMode) => {
    setViews((previous) => ({ ...previous, [side]: mode }));
    savePanelPreference(browserState, viewKey(side), mode);
  };
  /** Puts a preview node on the canvas of `target` and shows that canvas. */
  const addPreviewNode = (target: FieldPath, node: Omit<PreviewNode, 'id'>) => {
    previewStore.getState().edit((d) => addNode(d, target, { id: newPreviewId(), ...node }));
    store.getState().selectTarget(target);
  };
  const link = (source: FieldPath, target: FieldPath) => {
    // a variable's expression is a preview: its source fields too
    if (variables.includes(target)) return addPreviewNode(target, { kind: 'source', ref: source });
    store.getState().link(source, target, {
      source: refusalAt(loaded(sourceQuery.data), source, 'source'),
      target: refusalAt(loaded(targetQuery.data), target, 'target'),
    });
    store.getState().selectTarget(target);
  };
  const pane = (side: Side) => (
    <SchemaPane
      side={side}
      mappingId={mappingId}
      api={api}
      structureRef={side === 'source' ? sourceRef : targetRef}
      mode={views[side]}
      onMode={(mode) => setView(side, mode)}
      editing={editing}
      connected={connected[side]}
      mappings={mappings}
      selected={side === 'source' ? selectedSource : selectedTarget}
      onPick={side === 'source' ? setSelectedSource : (path) => store.getState().selectTarget(path)}
      onAdd={(path) => {
        if (selectedTarget !== null) link(path, selectedTarget);
      }}
      onDirect={link}
      onAssign={onChooseMessages}
      onFieldMenu={(event, path) => fieldMenu(event, side, path)}
      variables={side === 'target' ? variables : undefined}
    />
  );

  const view = dataFlow ? layout.view : 'split';
  const selectedDependencies = selectedTarget !== null && mappings[selectedTarget] !== undefined ? [selectedTarget] : [];
  const usesOf = (path: FieldPath) => Object.keys(mappings).filter((target) => reachedSourceFields(mappings[target]).includes(path));
  /** The target field menu's previews (the prototype's): grouping, variables and reading one (#164, #163). */
  function targetActions(path: FieldPath): MenuItem[] {
    const addVariableItem = action('Add Variable', () => setVariableParent(path), { disabled: !editing || fieldTypes.target.get(path) !== 'structure' });
    if (variables.includes(path)) {
      const destinations = variableTargets(variables, [...fieldTypes.target.keys()], path);
      const add = (target: FieldPath) => addPreviewNode(target, { kind: 'variable', ref: path });
      // on the selected target's canvas at once, else on the canvas chosen
      const here = selectedTarget !== null && destinations.includes(selectedTarget);
      const addToExpression = action('Add variable to expression', here ? () => add(selectedTarget) : null, {
        disabled: !editing || destinations.length === 0,
        children: here ? undefined : destinations.map((target) => action(`/${localPath(target)}`, () => add(target), { key: target })),
      });
      return [addToExpression, addVariableItem];
    }
    const grouped = selectedTarget === null || selectedTarget === path || canvasOf(preview, selectedTarget).nodes.some((n) => n.kind === 'target' && n.ref === path);
    const addTarget = action('Add target to expression', () => addPreviewNode(selectedTarget!, { kind: 'target', ref: path }), { disabled: !editing || grouped });
    return [addTarget, addVariableItem];
  }
  function fieldMenu(event: ReactMouseEvent | KeyboardEvent, side: Side, path: FieldPath) {
    const matches = side === 'source' ? usesOf(path) : [path];
    const items: MenuItem[] =
      side === 'source'
        ? [action('Where Used', null, { disabled: matches.length === 0, children: matches.map((target) => action(`/${localPath(target)}`, () => store.getState().selectTarget(target))) })]
        : targetActions(path);
    showMenu(event, `Field actions for ${stepName(path)}`, [...items, action('Dependencies', null, { children: dependencies.items(matches) })]);
  }

  return (
    <>
      <section
        className="definition-editor"
        data-view={view}
        aria-label="Mapping definition"
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || e.defaultPrevented || view === 'split' || menu || clearing) return;
          e.preventDefault();
          layout.setView('split');
        }}
      >
        <DefinitionBar
          editing={editing}
          dataFlow={dataFlow}
          onDataFlow={setDataFlow}
          view={view}
          onView={layout.setView}
          onChooseMessages={onChooseMessages}
          onClearMapping={() => setClearing(true)}
          onDependencies={() => dependencies.change(true, selectedDependencies)}
          dependencyItems={dependencies.items(selectedDependencies)}
          showMenu={showMenu}
        />
        <VerticalSplitLayout
          className="definition-split-layout"
          label="Resize mapping area"
          lowerId="definition-mapping-area"
          upper={
            <MessageOverview
              browserState={browserState}
              model={model}
              dependencies={dependencies.view}
              selectedTarget={selectedTarget}
              onSelect={(target) => store.getState().selectTarget(target)}
            >
              {pane('source')}
              {pane('target')}
            </MessageOverview>
          }
          initialShare={layout.share}
          onCommit={layout.setShare}
          view={view}
          toolbar={
            dataFlow && (
              <ExpressionHeader
                targetField={selectedTarget}
                view={view}
                onView={layout.setView}
                instances={{
                  library: testInstances(store, browserState, mappingId),
                  format: formatOf(sourceRef),
                  // the test session keeps its source document in the browser state at each change
                  resource: () => {
                    const text = browserState.read(testSourceKey(mappingId));
                    return { text: typeof text === 'string' ? text : '', values: testPreview(store, browserState, mappingId).getState().values };
                  },
                  onLoad: (text) => testInput(store).getState().load(text),
                  disabled: !editing,
                }}
              />
            )
          }
        >
          {!dataFlow ? (
            <TextPreview
              model={model}
              onOpen={(target) => {
                store.getState().selectTarget(target);
                setDataFlow(true);
              }}
            />
          ) : selectedTarget === null || !catalogue.data ? (
            <section className="panel canvas-panel" aria-label="Field mapping canvas">
              <p className="graph-empty">{selectedTarget === null ? 'Select a target field to see its mapping expression.' : 'Loading the function catalogue…'}</p>
            </section>
          ) : (
            <Canvas
              key={selectedTarget}
              mappingId={mappingId}
              store={store}
              targetField={selectedTarget}
              catalogue={catalogue.data}
              browserState={browserState}
              fieldTypes={fieldTypes}
              findField={(side, path) => (side === 'source' ? setSelectedSource(path) : store.getState().selectTarget(path))}
            />
          )}
        </VerticalSplitLayout>
      </section>
      {clearing && (
        <ClearMapping
          onClose={() => setClearing(false)}
          onClear={() => {
            store.getState().deleteBoxes(Object.values(mappings).flatMap((mapping) => Object.keys(mapping.boxes)));
            setClearing(false);
          }}
        />
      )}
      {variableParent !== null && (
        <AddVariable
          parent={variableParent}
          taken={(path) => variables.includes(path) || fieldTypes.target.has(path)}
          close={() => setVariableParent(null)}
          create={(name) => {
            previewStore.getState().edit((d) => addVariable(d, variableParent, name));
            setVariableParent(null);
          }}
        />
      )}
      <ActionMenu menu={menu} onClose={closeMenu} />
    </>
  );
}
