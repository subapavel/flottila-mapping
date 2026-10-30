// PROTOTYPE (#10, throwaway): measurements and screenshots of the mapping-editor prototype.
// Usage: npm run build && node scripts/prototype-measure.mjs [--no-screens] [--no-measure]
// Uses the pre-installed Playwright Chromium (chromium.launch() with no options).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ui = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const PORT = 4179;
const BASE = `http://localhost:${PORT}/prototype-mapping-editor.html?switcher`;
const T = '/Q{urn:example:invoice}Invoice';
const enc = encodeURIComponent;

function startPreview() {
  const p = spawn(process.execPath, [join(ui, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ui, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview did not start')), 30000);
    p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(p); } });
    p.stderr.on('data', (d) => process.stderr.write(d));
  });
}

// Runs `step(t)` for t in [0,1] once per animation frame over `ms`, returns frame stats.
const FRAME_FN = `window.__frames = (ms, step, probeAt) => new Promise((res) => {
  const deltas = []; let probe = null; const start = performance.now(); let last = start;
  const f = (now) => {
    deltas.push(now - last); last = now;
    const t = (now - start) / ms;
    if (probe === null && t >= (probeAt ?? 2)) probe = window.__probe ? window.__probe() : null;
    if (t >= 1) {
      const d = deltas.slice(1);
      const total = d.reduce((a, b) => a + b, 0);
      res({ frames: d.length, fps: +(d.length / (total / 1000)).toFixed(1), longestMs: +Math.max(...d).toFixed(1), over50: d.filter((x) => x > 50).length, probe });
    } else { step(t); requestAnimationFrame(f); }
  };
  requestAnimationFrame(f);
});`;

async function treeMeasure(page, fields) {
  await page.goto(`${BASE}&variant=a&sourceFields=${fields}`);
  await page.waitForSelector('[data-testid="source-tree-scroll"] [data-tree-row]');
  const firstRowsMs = await page.evaluate(() => performance.now());
  await page.evaluate(FRAME_FN);
  const expandMs = await page.evaluate(async () => {
    const t0 = performance.now();
    document.querySelector('[data-testid="source-tree-expand-all"]').click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  });
  const rows = await page.evaluate(() => document.querySelector('[data-testid="source-tree"] .ftree__count').textContent);
  const scroll = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="source-tree-scroll"]');
    window.__probe = () => el.querySelectorAll('[data-tree-row]').length;
    const max = el.scrollHeight - el.clientHeight;
    return window.__frames(3000, (t) => { el.scrollTop = t * max; }, 0.5);
  });
  return { fields, firstRowsMs: Math.round(firstRowsMs), expandAllMs: Math.round(expandMs), rows, scroll };
}

async function panZoom(page, scale, visibleOnly) {
  await page.goto(`${BASE}&variant=b&scale=${scale}&visibleOnly=${visibleOnly ? 1 : 0}`);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1500);
  await page.evaluate(FRAME_FN);
  const nodes = await page.evaluate(() => document.querySelectorAll('.react-flow__node').length);
  const r = await page.evaluate(async () => {
    const rf = window.__protoRf;
    window.__probe = () => document.querySelectorAll('.react-flow__node').length;
    return window.__frames(3000, (t) => {
      const zoom = 0.15 + 0.85 * Math.sin(t * Math.PI); // out -> in -> out
      rf.setViewport({ x: -t * 1500 * zoom, y: -t * 3000 * zoom, zoom });
    }, 0.5);
  });
  return { scale, visibleOnly, domNodesAtStart: nodes, ...r };
}

// Round 2: link-gutter redraw in variant (d) while the source tree scrolls or the splitter moves.
async function gutterMeasure(page, fields) {
  await page.goto(`${BASE}&variant=d&sourceFields=${fields}`);
  await page.waitForSelector('[data-testid="d-gutter"]');
  await page.getByTestId('d-source-tree-expand-all').click();
  await page.getByTestId('d-target-tree-expand-all').click();
  await page.waitForTimeout(500);
  await page.evaluate(FRAME_FN);
  const run = (mode) => page.evaluate(async (mode) => {
    const el = document.querySelector('[data-testid="d-source-tree-scroll"]');
    const g = document.querySelector('[data-testid="d-gutter"]');
    window.__probe = () => g.querySelectorAll('path.lk').length + g.querySelectorAll('g.fx').length;
    el.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const atStart = window.__probe();
    const max = el.scrollHeight - el.clientHeight;
    // full: top -> bottom of the whole tree; mapped: oscillate over the first 700 px, where the links are
    const r = await window.__frames(3000, (t) => { el.scrollTop = mode === 'full' ? t * max : 350 - 350 * Math.cos(t * 6 * Math.PI); }, 0.5);
    return { mode, drawnAtStart: atStart, ...r };
  }, mode);
  const full = await run('full');
  const mapped = await run('mapped');
  // collapse the bottom half so the trees fill the page and more links are on screen
  await page.locator('[data-testid="d-split-handle"] button').last().click();
  await page.waitForTimeout(300);
  const mappedTall = { ...(await run('mapped')), mode: 'mapped, bottom collapsed' };
  await page.locator('[data-testid="d-split-handle"] button').last().click();
  return { fields, full, mapped, mappedTall };
}

async function splitterMeasure(page) {
  await page.goto(`${BASE}&variant=d`);
  await page.waitForSelector('[data-testid="d-split-handle"]');
  await page.waitForTimeout(800);
  await page.evaluate(FRAME_FN);
  return page.evaluate(async () => {
    const h = document.querySelector('[data-testid="d-split-handle"]');
    const g = document.querySelector('[data-testid="d-gutter"]');
    window.__probe = () => g.querySelectorAll('path.lk').length + g.querySelectorAll('g.fx').length;
    const r0 = h.getBoundingClientRect();
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r0.left + 100, clientY: r0.top + 4 }));
    const y = (t) => 470 - 300 * Math.sin(t * 4 * Math.PI); // between ~170 and ~770 px
    const r = await window.__frames(3000, (t) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: r0.left + 100, clientY: y(t) })), 0.5);
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    return r;
  });
}

async function measure(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const out = { trees: [], layout: null, panZoom: [], gutter: [], splitter: null };
  await page.goto(`${BASE}&variant=a`); // warm-up: the first load pays for a cold cache
  await page.waitForSelector('[data-tree-row]');
  if (!args.has('--only-round2')) {
    for (const n of [5000, 20000]) out.trees.push(await treeMeasure(page, n));
    await page.goto(`${BASE}&variant=c`);
    await page.waitForFunction(() => !!window.__prototypeMeasure);
    out.layout = await page.evaluate(() => window.__prototypeMeasure.benchLayout(20));
    for (const scale of [1, 10]) for (const v of [false, true]) out.panZoom.push(await panZoom(page, scale, v));
  }
  for (const n of [5000, 20000]) out.gutter.push(await gutterMeasure(page, n));
  out.splitter = await splitterMeasure(page);
  await page.close();
  return out;
}

async function screens(browser) {
  const dir = join(ui, 'prototype-screenshots');
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name, url, act) => {
    await page.goto(`${BASE}&${url}`);
    await page.waitForTimeout(1200);
    if (act) { await act(); await page.waitForTimeout(600); }
    await page.screenshot({ path: join(dir, `${name}.png`) });
    console.log('screenshot', name);
  };
  await shot('a-default', 'variant=a');
  await shot('a-display-queue-open', `variant=a&field=${enc(`${T}/Totals/TotalAmount`)}`, async () => {
    await page.locator('.react-flow__node', { hasText: 'removeContexts' }).first().click();
  });
  await shot('a-orphaned-reference', `variant=a&field=${enc(`${T}/InvoiceLine/ArticleText`)}`, async () => {
    await page.locator('.react-flow__node', { hasText: 'orphaned' }).first().click();
  });
  await shot('a-copy-paste', `variant=a&field=${enc(`${T}/Totals/TotalAmount`)}`, async () => {
    await page.locator('.react-flow__node', { hasText: 'multiply' }).first().click();
    await page.keyboard.down('Control');
    await page.locator('.react-flow__node', { hasText: 'removeContexts' }).first().click();
    await page.keyboard.up('Control');
    await page.getByTestId('copy').click();
    await page.getByTestId('paste').click();
    await page.getByTestId('open-json').click();
  });
  await shot('b-default', 'variant=b');
  await shot('b-zoomed-out-whole-mapping', 'variant=b&fit=all');
  await shot('b-display-queue', 'variant=b', async () => {
    await page.locator('.react-flow__node', { hasText: 'formatDate' }).first().click();
  });
  await shot('b-structures-drawer', 'variant=b', async () => {
    await page.getByRole('button', { name: 'Structures' }).click();
  });
  await shot('c-default', 'variant=c');
  await shot('c-expanded-row-inline-queue', `variant=c&q=Totals&expand=${enc(`${T}/Totals/TotalAmount`)}&field=${enc(`${T}/Totals/TotalAmount`)}`, async () => {
    await page.locator('.chip__name', { hasText: 'removeContexts' }).first().click();
  });
  await shot('c-orphaned-and-errors', 'variant=c&filter=attention');
  await shot('c-expanded-splitByValue', `variant=c&q=FirstSchedule&expand=${enc(`${T}/InvoiceLine/FirstScheduleDate`)}&field=${enc(`${T}/InvoiceLine/FirstScheduleDate`)}`, async () => {
    await page.locator('.chip__name', { hasText: 'collapseContexts' }).first().click();
  });
  // ---- round 2: CPI-style split variants ----
  const F = (p) => enc(`${T}/${p}`);
  await shot('d-default', `variant=d&field=${F('InvoiceHeader/CurrencyCode')}`);
  await shot('d-scrolled-links-to-ancestor', `variant=d&field=${F('InvoiceLine/LineAmount')}`, async () => {
    await page.getByTestId('d-source-tree-collapse').click();
    await page.evaluate(() => { document.querySelector('[data-testid="d-target-tree-scroll"]').scrollTop = 560; });
  });
  await shot('d-display-queue-tab', `variant=d&tab=queue&field=${F('Totals/TotalAmount')}`);
  await shot('e-default', `variant=e&field=${F('InvoiceHeader/CurrencyCode')}`);
  await shot('e-quick-insert', `variant=e&field=${F('InvoiceHeader/CurrencyCode')}`, async () => {
    const c = await page.getByTestId('graph-canvas').boundingBox();
    await page.mouse.move(c.x + c.width * 0.45, c.y + c.height * 0.25);
    await page.keyboard.press('/');
    await page.keyboard.type('con');
  });
  await shot('e-inspector-deviation', `variant=e&field=${F('InvoiceHeader/InvoiceDate')}`, async () => {
    await page.locator('.react-flow__node', { hasText: 'formatDate' }).first().click();
  });
  await shot('f-default', `variant=f&field=${F('InvoiceHeader/CurrencyCode')}`);
  await shot('f-status-filter-unmapped', `variant=f&status=${enc('attention')}&field=${F('InvoiceLine/Remark')}`);
  const tabs = ['InvoiceHeader/InvoiceDate', 'InvoiceLine/DeliveryDate', 'Totals/TotalAmount'].map((p) => `${T}/${p}`);
  await shot('f-multiple-tabs', `variant=f&open=${enc(tabs.join(','))}&field=${enc(tabs[2])}`);
  await shot('f-bottom-maximised', `variant=f&open=${enc(tabs.join(','))}&field=${enc(tabs[2])}&max=1`);
  await shot('split-resized', `variant=d&field=${F('Totals/TotalAmount')}`, async () => {
    const h = await page.getByTestId('d-split-handle').boundingBox();
    await page.mouse.move(h.x + 300, h.y + 4);
    await page.mouse.down();
    await page.mouse.move(h.x + 300, 150, { steps: 10 });
    await page.mouse.up();
  });
  await shot('test-panel-output-errors', 'variant=a&drawer=test');
  const remark = enc(`${T}/InvoiceLine/Remark`);
  await shot('model-json-drawer', `variant=c&drawer=json&q=Remark&field=${remark}&expand=${remark}`);
  // Check: dragging a box changes browser state only, never the model JSON.
  await page.goto(`${BASE}&variant=a&drawer=json&field=${enc(`${T}/Totals/TotalAmount`)}`);
  await page.waitForTimeout(1200);
  const before = await page.getByTestId('model-json').locator('pre').textContent();
  const box = await page.locator('.react-flow__node', { hasText: 'multiply' }).first().boundingBox();
  await page.mouse.move(box.x + 20, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.getByTestId('model-json').locator('pre').textContent();
  const stored = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('prototype-mapping-editor:pos:')));
  checks.dragLeavesModelUnchanged = before === after;
  checks.dragStoredInSessionStorage = stored;
  await page.close();
  return errors;
}
const checks = {};

const preview = await startPreview();
const browser = await chromium.launch();
try {
  if (!args.has('--no-screens')) {
    const errs = await screens(browser);
    console.log('page errors during screenshots:', errs.length ? errs : 'none');
    console.log('checks:', JSON.stringify(checks));
  }
  if (!args.has('--no-measure')) {
    const r = await measure(browser);
    console.log(JSON.stringify(r, null, 2));
    mkdirSync(join(ui, '.logs'), { recursive: true });
    writeFileSync(join(ui, '.logs', '10-measure.json'), JSON.stringify(r, null, 2));
  }
} finally {
  await browser.close();
  preview.kill();
}
