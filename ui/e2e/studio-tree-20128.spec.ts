import { expect, test } from '@playwright/test';
import { TREE_FIELDS, TREE_MAPPING } from '../src/api/fake/generated-tree';
import { collectProblems } from './problems';

// GATE check 7, tree target, on the Mapping studio (ADR-0012, ADR-0028, #156): the generated tree of 20,128 fields in the
// Definition tab's source pane, Tree view, fully expanded as a pane opens, scrolled top to bottom for 3 s, one scroll
// step per animation frame. The p95 of the frame intervals is the scenario's score in ms; headless Chromium caps frames
// at 60 Hz, so 16.7 ms is the floor. The thresholds are the old editor's journey's (tree-20128.spec.ts), and the
// virtualised pane keeps fewer than 50 rows in the DOM.
const SCROLL_MS = 3000;

test('ui/studio-tree-20128/scroll', async ({ page }, testInfo) => {
  const problems = collectProblems(page);

  await page.goto(`/?api=fake&mapping=${encodeURIComponent(TREE_MAPPING)}#definition`);
  const pane = page.getByRole('region', { name: 'source message' });
  await pane.getByRole('group', { name: 'Source message view' }).getByRole('button', { name: 'Tree' }).click();
  const fields = pane.getByRole('table', { name: 'source fields' });
  await expect(fields.getByRole('button', { name: 'Tree', exact: true })).toBeVisible();
  const scroll = pane.locator('.fields-scroll');

  const run = await scroll.evaluate(
    (element, ms) =>
      new Promise<{ frames: number[]; rows: number; scrollHeight: number }>((resolve) => {
        const max = element.scrollHeight - element.clientHeight;
        const frames: number[] = [];
        let rows = 0;
        let start: number | undefined;
        let last = 0;
        const step = (now: number) => {
          if (start === undefined) start = now;
          else frames.push(now - last);
          last = now;
          const t = (now - start) / ms;
          if (t >= 1) {
            resolve({ frames, rows, scrollHeight: element.scrollHeight });
            return;
          }
          element.scrollTop = t * max;
          rows = Math.max(rows, element.querySelectorAll('tbody tr').length);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    SCROLL_MS,
  );

  const sorted = [...run.frames].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const result = {
    scenario: 'ui/studio-tree-20128/scroll',
    p95FrameMs: Number(p95.toFixed(1)),
    maxFrameMs: Number(sorted.at(-1)!.toFixed(1)),
    frames: run.frames.length,
    maxRowsInDom: run.rows,
  };
  console.log(`${result.scenario} p95 frame time ${result.p95FrameMs} ms (${JSON.stringify(result)})`);
  testInfo.annotations.push({ type: 'p95-frame-ms', description: String(result.p95FrameMs) });
  await testInfo.attach('studio-tree-20128-scroll.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  // scrolled to the end, the last field's row is shown and the root's has left the DOM
  await scroll.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(fields.getByRole('button', { name: 'Tree', exact: true })).toHaveCount(0);
  await expect(fields.getByRole('row').last()).toBeVisible();
  expect(run.scrollHeight).toBeGreaterThanOrEqual(TREE_FIELDS * 20);
  expect(run.rows).toBeLessThan(50);
  expect(problems).toEqual([]);
});
