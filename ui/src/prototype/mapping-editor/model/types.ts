// PROTOTYPE (#10, throwaway). Hand-written TypeScript shape of the mapping model, ADR-0010.
// Layout is deliberately absent: positions live only in browser state (layout/positions.ts).

export type AuthoringId = string;
export type FieldPath = string;

export type ParamValue = string | Record<string, string>;
export type Params = Record<string, ParamValue>;

export type SourceBox = { kind: 'source'; field: FieldPath; context?: FieldPath };
export type FunctionBox = { kind: 'function'; fn: string; inputs?: (AuthoringId | null)[]; params?: Params };
export type UdfBox = { kind: 'udf'; udf: string; inputs?: (AuthoringId | null)[]; params?: Params };
export type UnresolvedBox = {
  kind: 'unresolved';
  name: string;
  origin: 'po' | 'cpi' | 'editor';
  inputs?: (AuthoringId | null)[];
  params?: Params;
};
export type Box = SourceBox | FunctionBox | UdfBox | UnresolvedBox;

export type TargetFieldMapping = {
  id: AuthoringId;
  /** ADR-0010: the id of the box whose output feeds the field. PROTOTYPE: null while the author
   *  has not wired anything to the target yet (open question, see hand-back). */
  result: AuthoringId | null;
  boxes: Record<AuthoringId, Box>;
};

export type RootSelector =
  | { element: string }
  | { wsdl: { interface: string; operation: string; direction: 'input' | 'output' | 'fault'; fault?: string } }
  | { json: '$' };

export type StructureRef = { bundle: string[]; root: RootSelector; fingerprint: string };

export type UdfDecl = {
  executionKind: 'single' | 'context' | 'queue';
  inputs: string[];
  params?: Record<string, string>;
  source: string;
};

export type MappingModel = {
  formatVersion: 1;
  source: StructureRef;
  target: StructureRef;
  targetFieldMappings: Record<FieldPath, TargetFieldMapping>;
  udfs?: Record<string, UdfDecl>;
};

export function boxInputs(b: Box): (AuthoringId | null)[] {
  return b.kind === 'source' ? [] : b.inputs ?? [];
}
