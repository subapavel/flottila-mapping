import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Import boundaries of ui/src (ADR-0013, "Modules of ui/src", with the studio of ADR-0028 in place of the editor), for
// production files; src/import-boundaries.test.ts checks each rule. A regex names what a folder may NOT import. A file
// takes the last block whose files match it, so a folder's block repeats what the blocks before it forbid.
const tests = ['src/**/*.test.{ts,tsx}'];
const boundary = (files, regex, message) => ({
  files,
  ignores: tests,
  rules: { 'no-restricted-imports': ['error', { patterns: [{ regex, message }] }] },
});
const app = String.raw`(\.\./)+app(/|$)`;
// The store and the browser state are UI-free: they import each other, model, api and generated, and no other folder.
const otherFolder = String.raw`\.\./(?!store/|browser-state/|\.\./(model|api|generated)/)`;

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
    ['src/studio/**'],
    String.raw`^(${app}|@xyflow/|@dagrejs/|@tanstack/react-virtual$)`,
    'The studio never imports app; the canvas and tree libraries stay in their folders.',
  ),
  boundary(
    ['src/studio/store/**', 'src/studio/browser-state/**'],
    String.raw`^(${app}|${otherFolder}|react$|react-dom(/|$)|@patternfly/|@xyflow/|@dagrejs/|@tanstack/react-virtual$)`,
    'The store and the browser state import only each other, model, api and generated, and no UI library.',
  ),
  boundary(
    ['src/studio/definition/*.{ts,tsx}'],
    String.raw`^(${app}|@xyflow/|@dagrejs/)`,
    'The studio never imports app; @xyflow/react and dagre stay in definition/expression.',
  ),
  boundary(
    ['src/studio/definition/expression/**'],
    String.raw`^(${app}|@tanstack/react-virtual$)`,
    'The studio never imports app; @tanstack/react-virtual stays in the definition panes.',
  ),
  boundary(
    ['src/app/**'],
    String.raw`^(@xyflow/|@dagrejs/|@tanstack/react-virtual$)`,
    'app hosts the studio; the canvas and tree libraries stay in their studio folders.',
  ),
]);
