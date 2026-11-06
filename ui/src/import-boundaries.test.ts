import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The import boundaries of ADR-0013 ("Modules of ui/src"), checked against the real eslint.config.js.
const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

async function restricted(file: string, specifier: string): Promise<boolean> {
  const [result] = await eslint.lintText(`import x from '${specifier}';\nexport default x;\n`, { filePath: file });
  return result!.messages.some((m) => m.ruleId === 'no-restricted-imports');
}

describe('import boundaries (ADR-0013)', () => {
  test.each([
    ['src/model/link.ts', '../generated/mapping-model'],
    ['src/model/link.ts', 'immer'],
    ['src/model/link.ts', './same-model'],
    ['src/api/http-api.ts', '../generated/api'],
    ['src/api/http-api.ts', './client'],
    ['src/api/fake/fake-api.ts', '../client'],
    ['src/api/fake/fake-api.ts', '../../generated/api'],
    ['src/api/fake/fake-api.ts', '../../../../corpus/mappings/order-id-copy.mapping.json?raw'],
    ['src/api/fake/fake-api.ts', '../../../../contract/function-catalogue.json?raw'],
    ['src/editor/MappingEditor.tsx', './store/working-copy'],
    ['src/editor/MappingEditor.tsx', '../api/client'],
    ['src/editor/store/working-copy.ts', '../../model/link'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../store/working-copy'],
    ['src/editor/diagnostics/DiagnosticsPanel.tsx', '../store/working-copy'],
    ['src/editor/diagnostics/DiagnosticsPanel.tsx', '../../api/client'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../../api/client'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../../generated/api'],
    ['src/editor/structure-overview/StructureOverview.tsx', '@tanstack/react-virtual'],
    ['src/editor/function-editor/Canvas.tsx', '@xyflow/react'],
    ['src/editor/function-editor/layout.ts', '@dagrejs/dagre'],
    ['src/editor/inspector/Inspector.tsx', '../store/working-copy'],
    ['src/editor/inspector/Inspector.tsx', '../../model/set-context'],
    ['src/editor/inspector/Inspector.tsx', '../../api/client'],
    ['src/editor/MappingEditor.tsx', './inspector/Inspector'],
    ['src/app/main.tsx', '../editor'],
    ['src/app/main.tsx', '../api/fake/fake-api'],
  ])('%s may import %s', async (file, specifier) => {
    expect(await restricted(file, specifier)).toBe(false);
  });

  test.each([
    ['src/model/link.ts', 'react'],
    ['src/model/link.ts', 'zustand'],
    ['src/model/link.ts', '../api/client'],
    ['src/model/link.ts', '../editor'],
    ['src/api/http-api.ts', '../model/link'],
    ['src/api/http-api.ts', '../editor'],
    ['src/api/http-api.ts', 'react'],
    ['src/api/fake/fake-api.ts', '../../model/link'],
    ['src/api/fake/fake-api.ts', '../../../../service/pom.xml?raw'],
    ['src/editor/MappingEditor.tsx', '../app/main'],
    ['src/editor/MappingEditor.tsx', '@tanstack/react-virtual'],
    ['src/editor/store/working-copy.ts', '@tanstack/react-virtual'],
    ['src/model/link.ts', '@tanstack/react-virtual'],
    ['src/api/fake/fake-api.ts', '@tanstack/react-virtual'],
    ['src/editor/store/working-copy.ts', '../test-panel/TestPanel'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../test-panel/TestPanel'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../index'],
    ['src/editor/structure-overview/StructureOverview.tsx', '../../app/main'],
    ['src/editor/structure-overview/StructureOverview.tsx', '@xyflow/react'],
    ['src/editor/test-panel/TestPanel.tsx', '@tanstack/react-virtual'],
    ['src/editor/diagnostics/DiagnosticsPanel.tsx', '../test-panel/TestPanel'],
    ['src/editor/diagnostics/DiagnosticsPanel.tsx', '../structure-overview/rows'],
    ['src/editor/diagnostics/DiagnosticsPanel.tsx', '@xyflow/react'],
    ['src/editor/test-panel/TestPanel.tsx', '@dagrejs/dagre'],
    ['src/editor/MappingEditor.tsx', '@xyflow/react'],
    ['src/editor/MappingEditor.tsx', '@dagrejs/dagre'],
    ['src/editor/store/working-copy.ts', '@xyflow/react'],
    ['src/editor/browser-state/browser-state.ts', '@dagrejs/dagre'],
    ['src/editor/function-editor/Canvas.tsx', '../structure-overview/rows'],
    ['src/editor/function-editor/Canvas.tsx', '../inspector/Inspector'],
    ['src/editor/inspector/Inspector.tsx', '../function-editor/palette'],
    ['src/editor/inspector/Inspector.tsx', '../structure-overview/rows'],
    ['src/editor/inspector/Inspector.tsx', '@xyflow/react'],
    ['src/editor/inspector/Inspector.tsx', '@dagrejs/dagre'],
    ['src/editor/inspector/Inspector.tsx', '@tanstack/react-virtual'],
    ['src/app/main.tsx', '../editor/store/working-copy'],
    ['src/app/main.tsx', '../editor/inspector/Inspector'],
    ['src/app/main.tsx', '../editor/MappingEditor'],
    ['src/app/main.tsx', '@tanstack/react-virtual'],
  ])('%s may not import %s', async (file, specifier) => {
    expect(await restricted(file, specifier)).toBe(true);
  });
});
