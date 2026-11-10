import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, StructureLoaded } from '../../api/client';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { refusalAt } from '../../editor/structure-overview/rows';
import { useStructure } from '../../editor/structure-overview/structure-query';
import type { WorkingCopyStore } from '../../editor/store/working-copy';
import type { FieldPath } from '../../generated/mapping-model';
import { localPath } from '../../model/field-path';
import { connectedFields, type Side } from './definition-model';
import './definition.css';
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
  const selectedTarget = useStore(store, (s) => s.selectedTarget);
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

  const setView = (side: Side, mode: ViewMode) => {
    setViews((previous) => ({ ...previous, [side]: mode }));
    savePanelPreference(browserState, viewKey(side), mode);
  };
  const link = (source: FieldPath, target: FieldPath) => {
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
    />
  );

  return (
    <section className="definition-editor" aria-label="Mapping definition">
      <VerticalSplitLayout
        className="definition-split-layout"
        label="Resize mapping area"
        lowerId="definition-mapping-area"
        upper={
          <MessageOverview browserState={browserState}>
            {pane('source')}
            {pane('target')}
          </MessageOverview>
        }
        initialShare={layout.share}
        onCommit={layout.setShare}
      >
        <div className="workbench">
          <section className="panel canvas-panel" aria-label="Mapping expression">
            <p className="graph-empty">
              {selectedTarget === null ? 'Select a target field to see its mapping expression.' : `Mapping expression of /${localPath(selectedTarget)}`}
            </p>
          </section>
        </div>
      </VerticalSplitLayout>
    </section>
  );
}
