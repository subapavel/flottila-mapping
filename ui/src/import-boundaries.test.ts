import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The import boundaries of ADR-0013 ("Modules of ui/src"), with the studio of ADR-0028 in place of the editor, checked
// against the real eslint.config.js.
const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

async function restricted(file: string, specifier: string): Promise<boolean> {
  const [result] = await eslint.lintText(`import x from '${specifier}';\nexport default x;\n`, { filePath: file });
  return result!.messages.some((m) => m.ruleId === 'no-restricted-imports');
}

describe('import boundaries (ADR-0013, ADR-0028)', () => {
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
    ['src/studio/store/working-copy.ts', '../../model/link'],
    ['src/studio/store/working-copy.ts', '../../api/client'],
    ['src/studio/store/working-copy.ts', '../../generated/mapping-model'],
    ['src/studio/store/working-copy.ts', 'zustand/vanilla'],
    ['src/studio/store/working-copy.ts', '../browser-state/browser-state'],
    ['src/studio/browser-state/browser-state.ts', '../../generated/mapping-model'],
    ['src/studio/shell/StudioShell.tsx', '../store/working-copy'],
    ['src/studio/shell/StudioShell.tsx', '../definition/DefinitionTab'],
    ['src/studio/shell/StudioShell.tsx', '@patternfly/react-core'],
    ['src/studio/shell/SaveConflict.tsx', '../../api/client'],
    ['src/studio/test/QueueDialog.tsx', './display-queue'],
    ['src/studio/definition/SchemaPane.tsx', '@tanstack/react-virtual'],
    ['src/studio/definition/SchemaPane.tsx', './rows'],
    ['src/studio/definition/DefinitionTab.tsx', './expression/Canvas'],
    ['src/studio/definition/expression/Canvas.tsx', '@xyflow/react'],
    ['src/studio/definition/expression/expression-layout.ts', '@dagrejs/dagre'],
    ['src/studio/definition/expression/Canvas.tsx', '../../store/working-copy'],
    ['src/app/main.tsx', '../studio/browser-state/browser-state'],
    ['src/app/main.tsx', '../api/fake/fake-api'],
    ['src/app/Page.tsx', '../studio/shell/Studio'],
  ])('%s may import %s', async (file, specifier) => {
    expect(await restricted(file, specifier)).toBe(false);
  });

  test.each([
    ['src/model/link.ts', 'react'],
    ['src/model/link.ts', 'zustand'],
    ['src/model/link.ts', '../api/client'],
    ['src/model/link.ts', '../studio/store/working-copy'],
    ['src/api/http-api.ts', '../model/link'],
    ['src/api/http-api.ts', '../studio/store/working-copy'],
    ['src/api/http-api.ts', 'react'],
    ['src/api/fake/fake-api.ts', '../../model/link'],
    ['src/api/fake/fake-api.ts', '../../../../service/pom.xml?raw'],
    ['src/model/link.ts', '@tanstack/react-virtual'],
    ['src/api/fake/fake-api.ts', '@tanstack/react-virtual'],
    ['src/studio/shell/StudioShell.tsx', '../../app/main'],
    ['src/studio/shell/StudioShell.tsx', '../../app/routes'],
    ['src/studio/definition/expression/Canvas.tsx', '../../../app/Page'],
    ['src/studio/shell/StudioShell.tsx', '@xyflow/react'],
    ['src/studio/shell/StudioShell.tsx', '@dagrejs/dagre'],
    ['src/studio/shell/StudioShell.tsx', '@tanstack/react-virtual'],
    ['src/studio/test/QueueDialog.tsx', '@xyflow/react'],
    ['src/studio/test/QueueDialog.tsx', '@tanstack/react-virtual'],
    ['src/studio/store/working-copy.ts', '../shell/StudioShell'],
    ['src/studio/store/working-copy.ts', '../definition/rows'],
    ['src/studio/store/working-copy.ts', '../../app/main'],
    ['src/studio/store/working-copy.ts', 'react'],
    ['src/studio/store/working-copy.ts', 'react-dom/client'],
    ['src/studio/store/working-copy.ts', '@patternfly/react-core'],
    ['src/studio/store/working-copy.ts', '@xyflow/react'],
    ['src/studio/store/working-copy.ts', '@dagrejs/dagre'],
    ['src/studio/store/working-copy.ts', '@tanstack/react-virtual'],
    ['src/studio/browser-state/browser-state.ts', '../mock/preview-draft'],
    ['src/studio/browser-state/browser-state.ts', '@dagrejs/dagre'],
    ['src/studio/definition/SchemaPane.tsx', '../../app/main'],
    ['src/studio/definition/SchemaPane.tsx', '@xyflow/react'],
    ['src/studio/definition/SchemaPane.tsx', '@dagrejs/dagre'],
    ['src/studio/definition/expression/Canvas.tsx', '@tanstack/react-virtual'],
    ['src/app/main.tsx', '@xyflow/react'],
    ['src/app/main.tsx', '@dagrejs/dagre'],
    ['src/app/main.tsx', '@tanstack/react-virtual'],
  ])('%s may not import %s', async (file, specifier) => {
    expect(await restricted(file, specifier)).toBe(true);
  });
});
