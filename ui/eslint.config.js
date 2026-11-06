import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Import boundaries of ui/src (ADR-0013, "Modules of ui/src"), for production files; src/import-boundaries.test.ts
// checks each rule. A regex names what a folder may NOT import.
const tests = ['src/**/*.test.{ts,tsx}'];
const boundary = (files, regex, message) => ({
  files,
  ignores: tests,
  rules: { 'no-restricted-imports': ['error', { patterns: [{ regex, message }] }] },
});
// Editor subfolders meet through the store: they import the store, model, api and generated, and no other subfolder.
const otherSubfolder = String.raw`\.\./(?!store/|\.\./(model|api|generated)/)`;

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'src/generated']),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  boundary(['src/model/**'], String.raw`^(?!immer$|\./|\.\./generated/)`, 'model imports only generated and immer.'),
  boundary(['src/api/*.{ts,tsx}'], String.raw`^(?!\./|\.\./generated/)`, 'api imports only generated.'),
  boundary(
    ['src/api/fake/**'],
    String.raw`^(?!\./|\.\./[^./]|\.\./\.\./generated/|\.\./\.\./\.\./\.\./(corpus|contract)/)`,
    'The fake ApiClient imports only api, generated, corpus/ fixtures and contract/ files.',
  ),
  boundary(
    ['src/editor/*.{ts,tsx}'],
    String.raw`^(\.\./app(/|$)|@xyflow/|@dagrejs/|@tanstack/react-virtual$)`,
    'The editor never imports app; canvas and tree libraries stay in their folders.',
  ),
  boundary(
    ['src/editor/*/**'],
    String.raw`^(${otherSubfolder}|@xyflow/|@dagrejs/|@tanstack/react-virtual$)`,
    'Editor subfolders meet through the store; canvas and tree libraries stay in their folders.',
  ),
  boundary(
    ['src/editor/function-editor/**'],
    String.raw`^(${otherSubfolder}|@tanstack/react-virtual$)`,
    'Editor subfolders meet through the store; @tanstack/react-virtual stays in structure-overview.',
  ),
  boundary(
    ['src/editor/structure-overview/**'],
    String.raw`^(${otherSubfolder}|@xyflow/|@dagrejs/)`,
    'Editor subfolders meet through the store; @xyflow/react and dagre stay in function-editor.',
  ),
  boundary(['src/app/**'], String.raw`^\.\./editor/`, 'app imports the editor only through editor/index.ts.'),
]);
