// PROTOTYPE (#10, throwaway): hooks the Playwright measurement script calls (scripts/prototype-measure.mjs).
import { fieldMappingGraph, layoutDagre, layoutElk, wholeMappingGraph, type GraphSpec } from './layout/autoLayout';
import { buildSampleMapping } from './model/sampleMapping';

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function bench(g: GraphSpec, runs: number) {
  const d: number[] = [], e: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); layoutDagre(g); d.push(performance.now() - t); }
  for (let i = 0; i < runs; i++) { const t = performance.now(); await layoutElk(g); e.push(performance.now() - t); }
  const det = JSON.stringify(layoutDagre(g)) === JSON.stringify(layoutDagre(g));
  const detElk = JSON.stringify(await layoutElk(g)) === JSON.stringify(await layoutElk(g));
  return { nodes: g.nodes.length, edges: g.edges.length, dagreMedianMs: median(d), elkMedianMs: median(e), dagreDeterministic: det, elkDeterministic: detElk };
}

export function installMeasureHooks() {
  (window as unknown as Record<string, unknown>).__prototypeMeasure = {
    async benchLayout(runs = 20) {
      const m = buildSampleMapping();
      const entries = Object.entries(m.targetFieldMappings);
      const sizes = entries.map(([p, fm]) => [p, Object.keys(fm.boxes).length] as const);
      const typical = sizes.find(([, n]) => n >= 5 && n <= 8)!;
      const largest = [...sizes].sort((a, b) => b[1] - a[1])[0];
      const g = (p: string) => fieldMappingGraph(m, p, m.targetFieldMappings[p]);
      return {
        typical: { field: typical[0], boxes: typical[1], ...(await bench(g(typical[0]), runs)) },
        largest: { field: largest[0], boxes: largest[1], ...(await bench(g(largest[0]), runs)) },
        whole: await bench(wholeMappingGraph(m), runs),
        whole10x: await bench(wholeMappingGraph(m, 10), Math.min(runs, 5))
      };
    }
  };
}
