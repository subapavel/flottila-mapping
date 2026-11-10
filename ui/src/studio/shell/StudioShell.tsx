import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TabContent,
} from '@patternfly/react-core';
import { CubesIcon, TimesIcon } from '@patternfly/react-icons';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient } from '../../api/client';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { SaveConflict } from '../../editor/SaveConflict';
import { selectUnsaved, STUDIO_TABS, type StudioTab, type WorkingCopyStore } from '../../editor/store/working-copy';
import { EditorHeader, TAB_PANEL_ID, tabLabelId } from './EditorHeader';
import { Masthead } from './Masthead';

/** The key of the tab a mapping was last left on, kept per mapping (ADR-0028, viewer preferences). */
export const lastTabKey = (mappingId: string) => `mapping:${mappingId}:studio-tab`;

export const isStudioTab = (value: unknown): value is StudioTab => (STUDIO_TABS as readonly unknown[]).includes(value);

/** The tab a mapping opens on: the URL hash's, else the one it was last left on, else Overview. */
export function openingTab(hash: string, kept: unknown): StudioTab {
  const named = hash.slice(1);
  if (isStudioTab(named)) return named;
  return isStudioTab(kept) ? kept : 'overview';
}

export interface StudioShellProps {
  /** The mapping's id, its workspace path; its last segment is the mapping's name. */
  mappingId: string;
  api: ApiClient;
  /** The open mapping's store (ADR-0013), whose UI slice holds the tab and edit mode (ADR-0028). */
  store: WorkingCopyStore;
  browserState: BrowserStateStore;
  /** Where the masthead's brand leads: the start page. */
  listHref: string;
}

/**
 * The Mapping studio around one open mapping (ADR-0028, the prototype's main.jsx): the masthead, the tab line with the
 * mapping's name and Edit, or Cancel and Save in edit mode, and the active tab's body. The tab follows the URL hash
 * both ways. The structures are refreshed once on open (ADR-0027); Save sends `If-Match` and meets a save conflict in
 * its dialog; Cancel with unsaved changes asks before it discards them; the page asks before it unloads while the
 * working copy differs from the baseline.
 */
export function StudioShell({ mappingId, api, store, browserState, listHref }: StudioShellProps) {
  const name = mappingId.slice(mappingId.lastIndexOf('/') + 1);
  const tab = useStore(store, (s) => s.tab);
  const editing = useStore(store, (s) => s.editing);
  const unsaved = useStore(store, selectUnsaved);
  const hasMessages = useStore(store, (s) => s.workingCopy.source !== undefined && s.workingCopy.target !== undefined);
  const panelRef = useRef<HTMLElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const keepTab = useCallback(
    (next: StudioTab) => {
      store.getState().setTab(next);
      browserState.write(lastTabKey(mappingId), next);
    },
    [store, browserState, mappingId],
  );
  const changeTab = (next: StudioTab) => {
    keepTab(next);
    history.replaceState(null, '', `#${next}`);
  };
  useEffect(() => {
    const navigate = () => {
      const named = window.location.hash.slice(1);
      if (isStudioTab(named)) keepTab(named);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [keepTab]);

  useEffect(() => {
    if (!unsaved) return undefined;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [unsaved]);

  // Refresh on open (ADR-0027); an answer that comes after the studio closed leaves the store alone.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let open = true;
    const sent = store.getState().workingCopy;
    api.refresh(mappingId, sent).then(
      (answer) => {
        if (!open) return;
        const orphaned = store.getState().applyRefresh(sent, answer);
        if (orphaned !== null) setNotice(`The structures changed. Orphaned references: ${orphaned}`);
      },
      (error: unknown) => setNotice(`The structures could not be refreshed: ${describeError(error).title}`),
    );
    return () => {
      open = false;
    };
  }, [api, mappingId, store]);

  // A compile the store scheduled after an edit must not answer into a closed studio.
  useEffect(() => () => store.getState().cancelCompile(), [store]);

  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof describeError> | null>(null);
  const [saved, setSaved] = useState(0);
  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      await store.getState().save();
      // a save conflict resolves too: its dialog asks, and nothing was saved
      if (!store.getState().conflict) setSaved((n) => n + 1);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setSaving(false);
    }
  };

  const [asking, setAsking] = useState(false);
  const keepEditingId = useId();
  const leaveEditing = () => {
    setAsking(false);
    setFailure(null);
    store.getState().discard();
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const needsMessages = (tab === 'definition' || tab === 'test') && !hasMessages;

  return (
    <>
      <Masthead homeHref={listHref} />
      <main className="main">
        <EditorHeader
          title={name}
          activeTab={tab}
          onTabChange={changeTab}
          panelRef={panelRef}
          editing={editing}
          unsaved={unsaved}
          saving={saving}
          editButtonRef={editButtonRef}
          onEdit={() => store.getState().startEditing()}
          onCancel={() => (unsaved ? setAsking(true) : leaveEditing())}
          onSave={() => void save()}
        />
        {notice !== null && (
          <div className="feedback" role="status">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice(null)}>
              <TimesIcon />
            </button>
          </div>
        )}
        {failure && (
          <Alert variant="danger" isInline title={failure.title} className="feedback-alert">
            <p>{failure.detail}</p>
            <ul aria-label="Save diagnostics">
              {failure.diagnostics.map(({ severity, code, message }, i) => (
                <li key={i}>
                  {severity} <code>{code}</code>: {message}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <TabContent className="studio-tab-panel" id={TAB_PANEL_ID} ref={panelRef} aria-labelledby={tabLabelId(tab)}>
          {/* PatternFly renders no panel without children: a tab not built yet has an empty body (#154) */}
          {needsMessages ? <ChooseMessages /> : <></>}
        </TabContent>
      </main>
      <Modal variant="small" isOpen={asking} onClose={() => setAsking(false)} aria-labelledby="discard-title" elementToFocus={`#${CSS.escape(keepEditingId)}`}>
        <ModalHeader title="Discard changes?" labelId="discard-title" />
        <ModalBody>
          <p>
            Discard your unsaved changes to <strong>{name}</strong> and return to view mode?
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={leaveEditing}>
            Discard changes
          </Button>
          <Button id={keepEditingId} variant="link" onClick={() => setAsking(false)}>
            Keep editing
          </Button>
        </ModalFooter>
      </Modal>
      <SaveConflict store={store} />
      <AlertGroup className="mapping-save-toast" isToast isLiveRegion aria-label="Save notifications">
        {saved > 0 && (
          <Alert
            key={saved}
            variant="success"
            title={`Mapping ${name} saved`}
            // a timed-out alert renders nothing by itself; the next save's key mounts a new one
            timeout={8000}
            actionClose={<AlertActionCloseButton aria-label="Dismiss save notification" onClose={() => setSaved(0)} />}
          />
        )}
      </AlertGroup>
    </>
  );
}

/** The body of Definition and Test while the mapping lacks a message: what to do, and the link to Signature. */
function ChooseMessages() {
  return (
    <div className="panel">
      <EmptyState titleText="Choose the source and target messages" headingLevel="h2" icon={CubesIcon}>
        <EmptyStateBody>This tab needs both messages of the mapping.</EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button component="a" href="#signature" variant="link">
              Choose them on the Signature tab
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </div>
  );
}
