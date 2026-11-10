import { Button, Modal, ModalBody, ModalHeader } from '@patternfly/react-core';
import { FileImportIcon, FileMedicalIcon, SaveIcon, TrashIcon } from '@patternfly/react-icons';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Tool } from '../definition/Tool';
import { PreviewBadge } from '../mock/PreviewBadge';
import {
  currentInstance,
  instanceActions,
  instancesOf,
  readInstance,
  TEST_INSTANCES_ISSUE,
  type InstanceFormat,
  type InstanceResource,
  type TestInstancesStore,
} from '../mock/test-instances';
import { parseDocument } from './documents';
import './test.css';

export interface InstanceToolsProps {
  library: TestInstancesStore;
  format: InstanceFormat;
  /** What Add and Save take, read when they are clicked: the source document and the parameter values as they are then. */
  resource: () => InstanceResource;
  /** Loads a document read from a file as the source document. */
  onLoad: (text: string) => void;
  disabled: boolean;
  /** Whether a file read must parse as the format before it loads (the prototype's queue test input). */
  validateFile?: boolean;
  selectLabel?: string;
}

type Dialog = 'add' | 'delete' | null;

/**
 * The test instance tools (the prototype's InstanceTools, a preview, #170): Load Test Instance reads a file or the
 * `instance.<format>` of a zip into the source document; Add, Save and Delete Test Instance and the select change the
 * mapping's test instance library, a draft of the edit session (ADR-0028). The test session follows the current instance.
 */
export function InstanceTools({ library, format, resource, onLoad, disabled, validateFile = false, selectLabel = 'Select test instance' }: InstanceToolsProps) {
  const list = useStore(library, (s) => s.value);
  const entries = instancesOf(list, format);
  const current = currentInstance(list, format);
  const actions = instanceActions(library, format);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // the file input is disabled while a file is read, so one read is under way at most
  const locked = disabled || reading;

  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    // the input is cleared after each read, so a change always brings a file
    const chosen = event.target.files![0]!;
    event.target.value = '';
    setReading(true);
    setNotice('');
    try {
      const text = await readInstance(chosen, format);
      if (validateFile) parseDocument(text, format);
      onLoad(text);
    } catch {
      setNotice(`Could not read this file. Choose a valid ${format} test input.`);
    } finally {
      setReading(false);
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    try {
      actions.create(name.trim(), resource());
      setNotice('');
      setDialog(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const close = () => {
    setDialog(null);
    setNotice('');
  };

  return (
    <>
      <PreviewBadge feature="Test instances" issue={TEST_INSTANCES_ISSUE} />
      <Tool label="Load Test Instance" icon={FileImportIcon} disabled={locked} onClick={() => file.current?.click()} />
      <span className="tool-separator" />
      <Tool
        label="Add Test Instance"
        icon={FileMedicalIcon}
        disabled={locked}
        onClick={() => {
          setName('');
          setNotice('');
          setDialog('add');
        }}
      />
      <Tool
        label="Save Test Instance"
        icon={SaveIcon}
        disabled={locked || !current}
        onClick={() => {
          actions.save(resource());
          setNotice('Test instance saved. Save the mapping to keep it in this browser.');
        }}
      />
      <Tool
        label="Delete Test Instance"
        icon={TrashIcon}
        disabled={locked || !current}
        onClick={() => {
          setNotice('');
          setDialog('delete');
        }}
      />
      <select aria-label={selectLabel} value={current?.id ?? ''} disabled={locked || !current} onChange={(e) => actions.select(e.target.value)}>
        {entries.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <input ref={file} type="file" hidden disabled={locked} aria-label="Test instance file" accept={`.${format.toLowerCase()},.zip`} onChange={(e) => void load(e)} />
      {notice && !dialog && (
        <span role="status" className="instance-tool-notice">
          {notice}
        </span>
      )}
      {dialog === 'add' && (
        <Modal isOpen variant="small" aria-label="Add Test Instance" onClose={close}>
          <ModalHeader title="Add Test Instance" />
          <ModalBody>
            <form onSubmit={add}>
              <label className="form-field">
                Test instance name
                <input autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </label>
              {notice && <p role="alert">{notice}</p>}
              <div className="form-actions">
                <Button type="submit" isDisabled={!name.trim()}>
                  OK
                </Button>
                <Button variant="link" onClick={close}>
                  Cancel
                </Button>
              </div>
            </form>
          </ModalBody>
        </Modal>
      )}
      {dialog === 'delete' && current && (
        <Modal isOpen variant="small" aria-label="Delete Test Instance" onClose={close}>
          <ModalHeader title="Delete Test Instance" />
          <ModalBody>
            <p>Delete {current.name} from this browser?</p>
            <div className="form-actions">
              <Button
                variant="danger"
                icon={<TrashIcon />}
                onClick={() => {
                  actions.remove();
                  setDialog(null);
                }}
              >
                Delete
              </Button>
              <Button variant="link" onClick={close}>
                Cancel
              </Button>
            </div>
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
