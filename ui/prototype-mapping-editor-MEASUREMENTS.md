# PROTOTYPE #10: mapping-editor measurements (throwaway)

Measured by `node scripts/prototype-measure.mjs --no-screens` (after `npm run build`) against
`vite preview` of the production build. Raw output: `ui/.logs/10-measure.json` (not committed).

- Date: 2026-10-30
- Code: commit `c622e27` on `prototype/mapping-editor`
- Machine: 4 vCPU (`nproc` = 4), Intel Xeon @ 2.80 GHz, 15 GB RAM, Linux 6.18 (container)
- Node `v22.22.0`; Playwright 1.63.0, headless Chromium 153.0.8010.12 (`chromium.launch()`,
  no options), viewport 1440 × 900
- Caveat: headless, software rendering, `requestAnimationFrame` capped at 60 Hz, so 60 fps is the
  ceiling, not a measured headroom. One run each; numbers vary ±20 % between runs (two runs seen).

## Structure tree (variant a, source tree; TanStack Virtual, flat visible-row list)

| Fields | Page load → first tree rows | "Expand all" → painted | Scroll top→bottom, 3 s | Longest frame | Frames > 50 ms | DOM rows mid-scroll |
|---:|---:|---:|---:|---:|---:|---:|
| 5,105 (all expanded) | 236 ms | 13 ms | 59.3 fps | 50 ms | 0 | 54 |
| 20,128 (all expanded) | 317 ms | 23 ms | 60 fps | 16.8 ms | 0 | 54 |

The DOM holds about 54 rows whatever the tree size. "Page load" includes generating the
synthetic structure and building the other two panels.

## Auto-layout (median of 20 runs; 5 runs for ×10)

| Graph | Nodes / edges | dagre | elkjs (layered, bundled, main thread) | Deterministic (2 runs identical) |
|---|---:|---:|---:|---|
| Typical per-field graph (`InvoiceHeader/Comment`, 5 boxes) | 6 / 5 | 2.7 ms | 16.5 ms | dagre yes, elk yes |
| Largest per-field graph (`Totals/TotalAmount`, 14 boxes) | 15 / 15 | 4.1 ms | 20.8 ms | dagre yes, elk yes |
| Whole mapping, variant (b) | 163 / 138 | 40.4 ms | 78.2 ms | dagre yes, elk yes |
| Whole mapping ×10 (synthetic copies) | 1,630 / 1,380 | 450 ms | 650 ms | dagre yes, elk yes |

Boxes are inserted in sorted AuthoringId order; positions are never written into the model.

## Variant (b) pan/zoom, 3 s scripted `setViewport` (zoom 0.15 → 1 → 0.15 while panning)

| Graph | `onlyRenderVisibleElements` | DOM nodes at start | fps | Longest frame | Frames > 50 ms | DOM nodes mid-run |
|---|---|---:|---:|---:|---:|---:|
| Whole mapping (163 nodes) | off | 163 | 56.7 | 33 ms | 0 | 163 |
| Whole mapping (163 nodes) | on | 40 | 55.0 | 100 ms | 1 | 8 |
| ×10 (1,630 nodes) | off | 1,630 | 19.8 | 83 ms | 24 | 1,630 |
| ×10 (1,630 nodes) | on | 1,435 | 48.1 | 133 ms | 1 | 7 |

`onlyRenderVisibleElements` makes no difference at the real mapping's size (163 nodes), and
more than doubles the frame rate at 1,630 nodes, at the price of occasional long frames when
many nodes mount at once while zooming out.

## Checks (from the screenshot run, `ui/.logs/10-screens.log`)

- Dragging a box in variant (a) leaves the model JSON byte-identical; the position goes to
  `sessionStorage` under `prototype-mapping-editor:pos:a:<AuthoringId>`. Observed.
- Copy/paste of `multiply` + `removeContexts` gives two fresh ids; the internal reference
  survives, the references to source boxes outside the fragment become `null` (screenshot
  `a-copy-paste.png`, errors rise from 6 to 8). Observed.
- No page errors in any screenshot step. Observed.
