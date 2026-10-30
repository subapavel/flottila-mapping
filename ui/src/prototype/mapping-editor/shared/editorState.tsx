// PROTOTYPE (#10, throwaway): in-memory editor state shared by all variants. No persistence.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { runMapping, type RunResult } from '../eval/mockEvaluator';
import { SAMPLE_INPUT } from '../eval/sampleInput';
import { groupErrors, type DesignError } from '../model/derive';
import type { Fragment } from '../model/ops';
import { buildSampleMapping } from '../model/sampleMapping';
import { sourceStructure, targetStructure, type Structure } from '../model/structures';
import type { AuthoringId, FieldPath, MappingModel } from '../model/types';

export type Drawer = 'test' | 'json' | null;

type EditorState = {
  model: MappingModel;
  update: (f: (m: MappingModel) => MappingModel) => void;
  src: Structure;
  tgt: Structure;
  run: RunResult;
  runCount: number;
  rerun: () => void;
  inputXml: string;
  setInputXml: (s: string) => void;
  errorsByPath: Map<FieldPath, (DesignError | { code: string; message: string })[]>;
  field: FieldPath | null; // selected target field
  box: AuthoringId | null; // selected box (or display-queue subject)
  select: (field: FieldPath | null, box?: AuthoringId | null) => void;
  drawer: Drawer;
  setDrawer: (d: Drawer) => void;
  clipboard: Fragment | null;
  setClipboard: (f: Fragment | null) => void;
  revision: number;
};

const Ctx = createContext<EditorState | null>(null);

export function useEditor(): EditorState {
  const c = useContext(Ctx);
  if (!c) throw new Error('no editor state');
  return c;
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const url = new URLSearchParams(location.search);
  const [src] = useState(() => sourceStructure(Number(url.get('sourceFields') ?? 5000)));
  const [tgt] = useState(() => targetStructure(Number(url.get('targetFields') ?? 1500)));
  const [model, setModel] = useState<MappingModel>(buildSampleMapping);
  const [revision, setRevision] = useState(0);
  const [inputXml, setInputXml] = useState(SAMPLE_INPUT);
  const [runCount, setRunCount] = useState(0);
  const [field, setField] = useState<FieldPath | null>(url.get('field'));
  const [box, setBox] = useState<AuthoringId | null>(url.get('box'));
  const [drawer, setDrawer] = useState<Drawer>((url.get('drawer') as Drawer) ?? null);
  const [clipboard, setClipboard] = useState<Fragment | null>(null);

  const update = useCallback((f: (m: MappingModel) => MappingModel) => { setModel(f); setRevision((r) => r + 1); }, []);
  // The mock run is cheap, so it re-runs on every model or input change ("live"); Run forces it.
  const run = useMemo(() => runMapping(model, src, tgt, inputXml), [model, src, tgt, inputXml, runCount]);
  const errorsByPath = useMemo(() => groupErrors(run.errors.filter((e): e is DesignError => 'targetPath' in e && !!e.targetPath)), [run]);
  const select = useCallback((f: FieldPath | null, b: AuthoringId | null = null) => { setField(f); setBox(b); }, []);

  const value: EditorState = {
    model, update, src, tgt, run, runCount, rerun: () => setRunCount((c) => c + 1), inputXml, setInputXml,
    errorsByPath, field, box, select, drawer, setDrawer, clipboard, setClipboard, revision
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
