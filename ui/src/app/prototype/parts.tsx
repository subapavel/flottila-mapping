/*
 * PROTOTYPE (spec #145, ticket #145) — throwaway. Small PF-native pieces the three variants share: the editor's two
 * halves with a splitter, the inspector Drawer, the Test pieces (input, result, diagnostics), the editor actions and
 * the New mapping modal. The layout around them is each variant's own.
 */
import {
  Alert,
  Button,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  EmptyState,
  EmptyStateBody,
  FileUpload,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Diagnostic } from '../../api/client';
import { localPath } from '../../model/field-path';
import { locate, targetFieldOf } from '../../editor/store/locations';
import { Splitter } from '../../editor/layout/Splitter';
import type { Split, SplitRules } from '../../editor/layout/split';
import { indentXml } from '../../editor/test-panel/indent-xml';
import { useLastRun, type Workbench } from './workbench';

const HALVES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };

/** Two panes on top of each other with the editor's splitter between them; each fills its share of the height. */
export function SplitHalves({ top, bottom, initial = 0.5 }: { top: ReactNode; bottom: ReactNode; initial?: number }) {
  const [split, setSplit] = useState<Split>({ ratio: initial, collapsed: null });
  const pane = (grow: number, hidden: boolean): CSSProperties => ({ flex: `${grow} 1 0`, minHeight: 0, display: hidden ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' });
  const a = split.collapsed === 'end' ? 1 : split.ratio;
  const b = split.collapsed === 'start' ? 1 : 1 - split.ratio;
  return (
    <div className="proto-fill proto-column">
      <div id="proto-top-half" style={pane(a, split.collapsed === 'start')}>
        {top}
      </div>
      <Splitter orientation="horizontal" label="Resize the structures and the function editor" controls="proto-top-half" split={split} rules={HALVES} onChange={setSplit} />
      <div style={pane(b, split.collapsed === 'end')}>{bottom}</div>
    </div>
  );
}

/** The inspector as a PF Drawer panel at the end of `children`; inline, so it pushes the content rather than covering it. */
export function InspectorDrawer({
  wb,
  open,
  onClose,
  children,
  defaultSize = '360px',
}: {
  wb: Workbench;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  defaultSize?: string;
}) {
  const panel = (
    <DrawerPanelContent isResizable defaultSize={defaultSize} minSize="280px" resizeAriaLabel="Resize the inspector">
      <DrawerHead>
        <Title headingLevel="h2" size="lg">
          Inspector
        </Title>
        <DrawerActions>
          <DrawerCloseButton onClose={onClose} aria-label="Close the inspector" />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody className="proto-scroll">{wb.inspector}</DrawerPanelBody>
    </DrawerPanelContent>
  );
  return (
    <Drawer isExpanded={open} isInline position="end" className="proto-fill">
      <DrawerContent panelContent={panel}>
        <DrawerContentBody className="proto-fill proto-column">{children}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}

/** The editor actions as PF buttons at the default size. */
export function EditorActions({ wb, variant = 'secondary' }: { wb: Workbench; variant?: 'secondary' | 'plain' }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem>
        <Button variant={variant === 'plain' ? 'link' : 'secondary'} onClick={wb.undo} isDisabled={!wb.canUndo}>
          Undo
        </Button>
      </FlexItem>
      <FlexItem>
        <Button variant={variant === 'plain' ? 'link' : 'secondary'} onClick={wb.redo} isDisabled={!wb.canRedo}>
          Redo
        </Button>
      </FlexItem>
      <FlexItem>
        <Button variant={variant === 'plain' ? 'link' : 'secondary'} onClick={wb.refreshStructures} isLoading={wb.refreshing}>
          Refresh structures
        </Button>
      </FlexItem>
      <FlexItem>
        <Button onClick={wb.save} isDisabled={!wb.unsaved || wb.saving} isLoading={wb.saving}>
          Save
        </Button>
      </FlexItem>
    </Flex>
  );
}

/** The status labels: errors, warnings, unsaved. */
export function StatusLabels({ wb, onErrors }: { wb: Workbench; onErrors?: () => void }) {
  return (
    <LabelGroup aria-label="Mapping status" numLabels={4}>
      <Label status={wb.errorCount > 0 ? 'danger' : 'success'} onClick={onErrors}>
        {wb.errorCount} {wb.errorCount === 1 ? 'error' : 'errors'}
      </Label>
      {wb.warningCount > 0 && <Label status="warning">{wb.warningCount} warnings</Label>}
      {wb.unsaved && <Label color="orange">Unsaved</Label>}
    </LabelGroup>
  );
}

/** The input message: a PF FileUpload whose text preview is also the editable input; Run sits under it. */
export function TestInput({ wb }: { wb: Workbench }) {
  const t = wb.test;
  return (
    <div className="proto-column proto-fill proto-gap">
      <FileUpload
        id="proto-test-input"
        type="text"
        className="proto-upload"
        value={t.input}
        filename={t.filename}
        filenamePlaceholder="Drag a file here or upload one"
        browseButtonText="Upload"
        allowEditingUploadedText
        onFileInputChange={(_e, file) => t.setFilename(file.name)}
        onDataChange={(_e, data) => t.setInput(data)}
        onTextChange={(_e, text) => t.setInput(text)}
        onClearClick={() => {
          t.setFilename('');
          t.setInput('');
        }}
        aria-label="Input message"
      />
      <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <Button onClick={t.run} isLoading={t.running} isDisabled={t.running}>
            Run test
          </Button>
        </FlexItem>
        <FlexItem>
          <RunStatus wb={wb} />
        </FlexItem>
      </Flex>
    </div>
  );
}

function RunStatus({ wb }: { wb: Workbench }) {
  const { lastRun, stale } = useLastRun(wb.store);
  if (lastRun === null) return <span className="pf-v6-u-text-color-subtle">No run yet</span>;
  const kind = lastRun.kind === 'output' ? 'Output' : lastRun.kind === 'error' ? 'Runtime error' : 'Refused by compile';
  return (
    <LabelGroup numLabels={3}>
      <Label status={lastRun.kind === 'output' ? 'success' : 'danger'}>{kind}</Label>
      {stale ? <Label color="orange">Stale: the working copy changed</Label> : <Label color="blue">Live</Label>}
    </LabelGroup>
  );
}

/** The target message of the last run, as a PF CodeBlock, or an empty state. */
export function TestResult({ wb }: { wb: Workbench }) {
  const { lastRun } = useLastRun(wb.store);
  const shown = useMemo(() => (lastRun?.kind === 'output' ? indentXml(lastRun.output) : ''), [lastRun]);
  if (wb.test.failure) return <Alert variant="danger" isInline title={wb.test.failure} />;
  if (lastRun === null) {
    return (
      <EmptyState titleText="No run yet" headingLevel="h3" variant="sm">
        <EmptyStateBody>Upload or type an input message, then Run test.</EmptyStateBody>
      </EmptyState>
    );
  }
  if (lastRun.kind === 'error') {
    return (
      <Alert variant="danger" isInline title={`Runtime error ${lastRun.error.code}`}>
        <p>{lastRun.error.message}</p>
        {lastRun.error.authoringId !== undefined && (
          <Button variant="link" isInline onClick={() => wb.show(lastRun.error.authoringId!)}>
            Show {lastRun.error.authoringId}
          </Button>
        )}
      </Alert>
    );
  }
  if (lastRun.kind === 'refused') return <Alert variant="warning" isInline title="Compile refused the working copy: nothing ran. See the diagnostics." />;
  return (
    <CodeBlock className="proto-code">
      <CodeBlockCode>{shown}</CodeBlockCode>
    </CodeBlock>
  );
}

/** The working copy's diagnostics and the last run's, as a compact PF Table; a location leads to its field. */
export function DiagnosticsTable({ wb }: { wb: Workbench }) {
  const compiled = useStore(wb.store, (s) => s.diagnostics);
  const compileFailure = useStore(wb.store, (s) => s.compileFailure);
  const model = useStore(wb.store, (s) => s.workingCopy);
  const { lastRun } = useLastRun(wb.store);
  const rows: { origin: string; d: Diagnostic }[] = [
    ...compiled.map((d) => ({ origin: 'Compile', d })),
    ...(lastRun?.diagnostics ?? []).filter((d) => !compiled.some((c) => c.code === d.code && c.message === d.message)).map((d) => ({ origin: 'Run', d })),
  ];
  const place = (d: Diagnostic) => {
    const loc = d.location;
    const target = targetFieldOf(loc, (id) => locate(model, id)?.field);
    if (loc.kind === 'file-position') return `${loc.file}:${loc.line}:${loc.column}`;
    if (loc.kind === 'field-path') {
      return (
        <Button variant="link" isInline onClick={() => wb.showField(loc.side, loc.fieldPath)}>
          {localPath(loc.fieldPath)}
        </Button>
      );
    }
    const text = loc.kind === 'authoring-id' ? loc.authoringId : target ? localPath(target) : loc.pointer;
    if (target === undefined) return text;
    return (
      <Button variant="link" isInline onClick={() => (loc.kind === 'authoring-id' ? wb.show(loc.authoringId) : wb.showField('target', target))}>
        {text}
      </Button>
    );
  };
  return (
    <>
      {compileFailure !== null && <Alert variant="warning" isInline isPlain title={`The working copy could not be compiled: ${compileFailure}`} />}
      {rows.length === 0 ? (
        <EmptyState titleText="No diagnostics" headingLevel="h3" variant="xs" status="success" />
      ) : (
        <Table aria-label="Diagnostics" variant="compact" isStickyHeader>
          <Thead>
            <Tr>
              <Th width={10}>Severity</Th>
              <Th width={10}>Origin</Th>
              <Th width={20}>Code</Th>
              <Th width={20}>Location</Th>
              <Th>Message</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(({ origin, d }, i) => (
              <Tr key={i}>
                <Td dataLabel="Severity">
                  <Label status={d.severity === 'error' ? 'danger' : 'warning'} isCompact>
                    {d.severity}
                  </Label>
                </Td>
                <Td dataLabel="Origin">{origin}</Td>
                <Td dataLabel="Code">
                  <code>{d.code}</code>
                </Td>
                <Td dataLabel="Location">{place(d)}</Td>
                <Td dataLabel="Message">{d.message}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}

/** A new mapping as the modal gives it; the prototype keeps it in memory only. */
export interface NewMapping {
  name: string;
  pkg: string;
  open: boolean;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** The New mapping modal (owner decision 3): name, package, and whether to open it afterwards. */
export function NewMappingModal({
  isOpen,
  onClose,
  onCreate,
  defaultPackage,
  taken,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (m: NewMapping) => void;
  defaultPackage: string;
  taken: (id: string) => boolean;
}) {
  const [name, setName] = useState('');
  const [pkg, setPkg] = useState(defaultPackage);
  const [open, setOpen] = useState(true);
  const [touched, setTouched] = useState(false);
  const nameError = name === '' ? 'Enter a name.' : !NAME.test(name) ? 'Letters, digits, dot, dash and underscore only.' : taken(`${pkg}/${name}`) ? `${pkg}/${name} already exists.` : undefined;
  const pkgError = !PACKAGE.test(pkg) ? 'A folder path such as mappings/orders.' : undefined;
  const valid = nameError === undefined && pkgError === undefined;
  const close = () => {
    setName('');
    setTouched(false);
    onClose();
  };
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onCreate({ name, pkg, open });
    close();
  };
  return (
    <Modal variant="small" isOpen={isOpen} onClose={close} aria-labelledby="proto-new-title">
      <ModalHeader title="New mapping" labelId="proto-new-title" description="Source and target structures are picked in the editor." />
      <ModalBody>
        <Form
          id="proto-new-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormGroup label="Name" isRequired fieldId="proto-new-name">
            <TextInput id="proto-new-name" isRequired value={name} onChange={(_e, v) => setName(v)} validated={touched && nameError ? 'error' : 'default'} />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={touched && nameError ? 'error' : 'default'}>{touched && nameError ? nameError : 'For example po-to-invoice.'}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label="Package" isRequired fieldId="proto-new-package">
            <TextInput id="proto-new-package" isRequired value={pkg} onChange={(_e, v) => setPkg(v)} validated={touched && pkgError ? 'error' : 'default'} />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={touched && pkgError ? 'error' : 'default'}>
                  {touched && pkgError ? pkgError : `A folder-like namespace. The mapping id will be ${pkg || '…'}/${name || '…'}.`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <Checkbox id="proto-new-open" label="Open in the editor after creating" isChecked={open} onChange={(_e, v) => setOpen(v)} />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button type="submit" form="proto-new-form">
          Create
        </Button>
        <Button variant="link" onClick={close}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** A mapping created in this session: the prototype stubs the create call, so it opens without structures. */
export function StubMapping({ id }: { id: string }) {
  return (
    <EmptyState titleText={`${id} has no structures yet`} headingLevel="h2" variant="lg">
      <EmptyStateBody>
        PROTOTYPE: the create call is stubbed and kept in memory. In the real editor the next step picks the source and
        the target structure here.
      </EmptyStateBody>
      <Flex justifyContent={{ default: 'justifyContentCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
        <Button variant="primary">Choose source structure</Button>
        <Button variant="secondary">Choose target structure</Button>
      </Flex>
    </EmptyState>
  );
}

/** The package and the name of a mapping id: the package is the folder part. */
export function splitId(id: string): { pkg: string; name: string } {
  const i = id.lastIndexOf('/');
  return i < 0 ? { pkg: '', name: id } : { pkg: id.slice(0, i), name: id.slice(i + 1) };
}
