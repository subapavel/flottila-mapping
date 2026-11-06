import { expect, test } from '@playwright/test';
import { TREE_FIELDS, TREE_MAPPING, TREE_SEED, generatedStructure, structurePaths } from '../src/api/fake/generated-tree';

// GATE check 7, tree target (ADR-0012, ADR-0013 "Performance"): the generated tree of 20,128 fields, fully expanded on
// both sides with every leaf linked, scrolled top to bottom for 3 s, one scroll step per animation frame. The p95 of
// the frame intervals is the scenario's score in ms; headless Chromium caps frames at 60 Hz, so 16.7 ms is the floor.
const SCROLL_MS = 3000;

test('ui/tree-20128/scroll', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  const { expandable } = structurePaths(generatedStructure(TREE_SEED, TREE_FIELDS));
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`flottila-mapping:v1:mapping:${TREE_MAPPING}:expanded`, JSON.stringify({ source: expandable, target: expandable })] as const,
  );

  await page.goto(`/?mapping=${TREE_MAPPING}&api=fake`);
  const tree = page.getByRole('tree', { name: 'Source structure' });
  await expect(tree.getByRole('treeitem').first()).toBeVisible();
  await expect(page.getByTestId(/^field-link:/).first()).toBeAttached();

  const run = await tree.evaluate(
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
          rows = Math.max(rows, element.querySelectorAll('[role="treeitem"]').length);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    SCROLL_MS,
  );

  const sorted = [...run.frames].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const result = {
    scenario: 'ui/tree-20128/scroll',
    p95FrameMs: Number(p95.toFixed(1)),
    maxFrameMs: Number(sorted.at(-1)!.toFixed(1)),
    frames: run.frames.length,
    maxRowsInDom: run.rows,
  };
  console.log(`${result.scenario} p95 frame time ${result.p95FrameMs} ms (${JSON.stringify(result)})`);
  testInfo.annotations.push({ type: 'p95-frame-ms', description: String(result.p95FrameMs) });
  await testInfo.attach('tree-20128-scroll.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  await expect(tree.getByRole('treeitem').last()).toBeVisible();
  expect(run.scrollHeight).toBeGreaterThanOrEqual(TREE_FIELDS * 20);
  expect(run.rows).toBeLessThanOrEqual(100);
  expect(problems).toEqual([]);
});
