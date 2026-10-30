# Frontend stack and editor libraries for a React + PatternFly mapping editor

Question (wayfinder ticket #9): which current PatternFly and React versions fit together; which
libraries can draw a node-and-edge mapping canvas and large virtualised trees (licence,
maintenance, size, documented limits); and how existing two-tree mapping editors are drawn.

State as of 2026-10-30. Registry facts come from `npm view <pkg> version license time dist.unpackedSize
dependencies peerDependencies` run on that date against `https://registry.npmjs.org/<pkg>`.
Source-repo facts come from shallow clones of the named repository at the commit given in the
link. Vendor help sites (patternfly.org, reactflow.dev, help.sap.com, altova.com, help.qlik.com)
were not reachable from the research environment; PatternFly and React Flow docs were therefore
read from their source repositories, and SAP / Altova / Talend pages are cited from the official
help pages as returned by search (page text not fetched directly — marked "(search excerpt)").

## Answer in short

- **React 19 + PatternFly 6 is a supported pair.** React is at 19.3.1; every `@patternfly/react-*`
  6.7.0 package declares `react: ^17 || ^18 || ^19`, and PatternFly states it supports React 17,
  18 and 19 in PatternFly 6.
- **Canvas:** `@xyflow/react` (React Flow 12, MIT) is the best-maintained generic node editor;
  `@patternfly/react-topology` (MIT) is on-brand but built for topology/pipeline views with
  automatic layouts, MobX and an old `popper.js@1`; JointJS core / `@joint/react` (MPL-2.0) is
  allowed but heavier, with many features in commercial JointJS+; Rete.js (MIT) is lightly
  maintained (last core release 2025-06-30).
- **Trees:** PatternFly `TreeView` is not virtualised (renders every expanded node; only a
  `useMemo` flag for large data). For large schemas use a flat "visible rows" list with a
  virtualiser — `react-virtuoso`, `@tanstack/react-virtual` or `react-window` (all MIT) — and
  optionally `@headless-tree/core` (MIT) for tree state, keyboard and ARIA.
- **Prior art that uses PatternFly:** Kaoto's DataMapper draws exactly this: two virtualised
  trees (`react-virtuoso`) with an SVG overlay of Bézier links (`@visx/shape`), not React Flow
  and not react-topology. It has no function canvas; transformations are XPath on target nodes.
- **SAP PO / Integration Suite** separates the two-tree *structure overview* from a per-target-field
  *data-flow editor* (function graph), with *display queue* for testing; MapForce puts everything
  on one canvas; Talend tMap is table-first with expressions per output column.

## 1. React and PatternFly versions

| Package | Latest | Published | Licence | React peer range |
|---|---|---|---|---|
| `react` / `react-dom` | 19.3.1 | 2026-10-14 | MIT | (`react-dom` → `react ^19.3.1`) |
| `@patternfly/react-core` | 6.7.0 | 2026-10-15 | MIT | `^17 \|\| ^18 \|\| ^19` |
| `@patternfly/react-table` | 6.7.0 | 2026-10-15 | MIT | `^17 \|\| ^18 \|\| ^19` |
| `@patternfly/react-topology` | 6.7.0 | 2026-10-16 | MIT | `^17 \|\| ^18 \|\| ^19` |
| `@patternfly/react-virtualized-extension` | 6.2.0 | 2025-10-17 | MIT | `^17 \|\| ^18 \|\| ^19` |

Sources: npm registry for each package (`https://registry.npmjs.org/react`,
`https://registry.npmjs.org/@patternfly/react-core`, `…/@patternfly/react-table`,
`…/@patternfly/react-topology`, `…/@patternfly/react-virtualized-extension`).

- PatternFly FAQ: "We support React 17, 18, and 19 in PatternFly 6."
  ([faqs.md](https://github.com/patternfly/patternfly-org/blob/8e08661e4e/packages/documentation-site/patternfly-docs/content/get-help/faqs.md), source of patternfly.org/get-help/faqs)
- The PatternFly 6.3 release highlights: "PatternFly now includes support for React 19 across all
  components and extensions … This update is non-breaking, and PatternFly 6 will continue to
  support React 17 and 18."
  ([release-highlights.md, section "PatternFly 6.3"](https://github.com/patternfly/patternfly-org/blob/8e08661e4e/packages/documentation-site/patternfly-docs/content/releases/release-highlights.md))
- `react-core` peer range `"react": "^17 || ^18 || ^19"`
  ([package.json](https://github.com/patternfly/patternfly-react/blob/eb3b20788f/packages/react-core/package.json));
  a recent fix "various: inert react 19 support (#12315)" is in the react-core changelog
  ([CHANGELOG.md](https://github.com/patternfly/patternfly-react/blob/eb3b20788f/packages/react-core/CHANGELOG.md)).
- `@patternfly/react-virtualized-extension` 6.2.0 depends on `react-virtualized ^9.22.5`
  (npm registry); its last release is a year old.

## 2. Mapping canvas libraries

| Library | Latest (published) | Licence | Runtime deps (registry) | Unpacked size | React | Fit notes |
|---|---|---|---|---|---|---|
| `@xyflow/react` (React Flow 12) | 12.12.0 (2026-09-24) | MIT | `zustand`, `classcat`, `@xyflow/system` | 1.2 MB | `>=17` | Generic node editor; custom nodes with multiple handles; zoom/pan, selection, minimap |
| `@patternfly/react-topology` | 6.7.0 (2026-10-16) | MIT | `d3`, `mobx`, `mobx-react@7`, `webcola`, `@dagrejs/dagre@1.1.2`, `popper.js@1`, PF core | 4.9 MB | `^17–^19` | PatternFly look; built for topology & pipeline graphs with layouts |
| `@joint/core` + `@joint/react` | 4.3.4 (2026-10-27) / 4.3.7 | MPL-2.0 | none (core) | 6.3 MB (core) | `>=18` (react pkg) | Full diagramming; "data mapping tools" listed as a use case; advanced plugins commercial |
| `rete` + `rete-react-plugin` | 2.0.6 (2025-06-30) / 2.1.2 (2026-07-10) | MIT | `@babel/runtime`; react plugin peers `styled-components` | 0.2 MB + 0.6 MB | `^16.8–^19` | Visual-programming framework (dataflow / control-flow engines) |

Sources: npm registry for each package; repositories as linked below. No project publishes a
min+gzip figure in its README; the unpacked size is the registry `dist.unpackedSize` (includes
ESM, CJS, types, CSS) and is not a bundle size.

**React Flow (`@xyflow/react`)**
- Licence MIT, "Copyright (c) 2019-2025 webkid GmbH"; React Flow Pro is a paid subscription for
  support and pro examples, the library stays MIT ([LICENSE](https://github.com/xyflow/xyflow/blob/d4bc936eda/LICENSE),
  [README "Commercial Usage"](https://github.com/xyflow/xyflow/blob/d4bc936eda/packages/react/README.md)).
- README features: custom nodes "with multiple handles", "Only nodes that have changed are
  re-rendered", MiniMap, Controls, Background ([README](https://github.com/xyflow/xyflow/blob/d4bc936eda/packages/react/README.md)).
- Documented performance switch: `onlyRenderVisibleElements` — "only render nodes and edges that
  would be visible in the viewport. This might improve performance when you have a large number
  of nodes and edges but also adds an overhead. @default false"
  ([component-props.ts](https://github.com/xyflow/xyflow/blob/d4bc936eda/packages/react/src/types/component-props.ts)).
  No node-count limit is stated in the repository; the reactflow.dev performance guide could not
  be fetched.
- Maintenance: repo commit on 2026-10-29; 12.x releases continuing (registry).

**PatternFly Topology (`@patternfly/react-topology`)**
- Purpose per its docs: "create a visual representation of complex application architectures"
  — nodes, edges, groups ([AboutTopology.md](https://github.com/patternfly/react-topology/blob/54e767a53e/packages/module/patternfly-docs/content/examples/AboutTopology.md)).
- Ships layouts BreadthFirst, Cola, Concentric, Dagre, Force, Grid plus a pipelines module
  ([src/layouts](https://github.com/patternfly/react-topology/tree/54e767a53e/packages/module/src/layouts),
  [src/pipelines](https://github.com/patternfly/react-topology/tree/54e767a53e/packages/module/src/pipelines));
  docs cover custom nodes/edges, anchors, drag-drop, pan-zoom, context menu, sidebar
  ([examples](https://github.com/patternfly/react-topology/tree/54e767a53e/packages/module/patternfly-docs/content/examples)).
- No performance or size limits documented in the docs folder (grep for "performance",
  "large", "virtualiz" found none).
- Dependencies include `popper.js ^1.16.1`, `mobx-react ^7.6.0`, `webcola 3.4.0` (registry).
- Kaoto uses it for its route canvas (`Visualization/Canvas/Canvas.tsx` imports
  `@patternfly/react-topology`), not for the DataMapper
  ([Canvas.tsx](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/components/Visualization/Canvas/Canvas.tsx)).

**JointJS**
- "The *JointJS* library is licensed under the Mozilla Public License 2.0"; JointJS+ (commercial)
  "adds production-ready plugins (stencils, inspectors, toolbars, advanced layouts,
  import/export, and more) … JointJS for React, and direct support"
  ([joint-core README](https://github.com/clientIO/joint/blob/efaadcb05b/packages/joint-core/README.md)).
  Yet `@joint/react` is published under MPL-2.0 in the same repo
  ([joint-react LICENSE](https://github.com/clientIO/joint/blob/efaadcb05b/packages/joint-react/LICENSE), registry) — see open question 5.
- Lists "data mapping tools" among its use cases; `@joint/react` README claims "Smooth
  interaction on large graphs with thousands of nodes" (no measurement given)
  ([joint-react README](https://github.com/clientIO/joint/blob/efaadcb05b/packages/joint-react/README.md)).
- Monorepo also contains `joint-layout-elk` (elkjs is `EPL-2.0 OR GPL-3.0-or-later`, usable under
  EPL-2.0; registry) and `joint-router-avoid`.

**Rete.js**
- "JavaScript framework for visual programming", MIT, renderers for React, Vue, Angular, Svelte
  ([README](https://github.com/retejs/rete/blob/2aae199501/README.md)).
- Core release cadence: 2.0.3 (2024-01), 2.0.4/2.0.5 (2024-08), 2.0.6 (2025-06-30) — no core
  release in 16 months (registry). The React plugin requires `styled-components` as a peer.

**Not a canvas library but relevant (layout):** `@dagrejs/dagre` 3.1.3 MIT; `elkjs` 0.12.1
`EPL-2.0 OR GPL-3.0-or-later` (registry).

## 3. Large virtualised trees

| Library | Latest (published) | Licence | Deps | Unpacked | What it is | Documented limits |
|---|---|---|---|---|---|---|
| PatternFly `TreeView` | 6.7.0 | MIT | (react-core) | — | Nested `<ul>` tree component | None; `useMemo` flag "helps prevent unnecessary re-renders for large data sets" |
| PatternFly Table tree rows | 6.7.0 | MIT | (react-table) | — | Tree table (`isTreeTable`) | Virtualised tables via the extension only |
| `react-virtuoso` | 4.18.20 (2026-10-29) | MIT | none | 0.25 MB | Virtualised list/grid component, variable heights, grouped mode | None stated |
| `@tanstack/react-virtual` | 3.14.24 (2026-10-29) | MIT | `@tanstack/virtual-core` | 0.06 MB | Headless virtualiser hook | None stated |
| `react-window` | 2.5.1 (2026-10-26) | MIT | none | 0.42 MB | List/grid components | None stated |
| `react-arborist` | 4.0.1 (2026-10-11) | MIT | `redux`, `react-window@1`; peers `react-dnd@16` | 0.45 MB | Complete tree component (DnD, rename, virtualised) | None stated |
| `@headless-tree/core` (+ `/react`) | 1.8.0 (2026-10-15) | MIT | none | 0.54 MB | Headless tree state, ARIA, keyboard, DnD; flat item list | "Compatible with common virtualization library to support 100k+ items"; core 3.1 kB min+gz |
| `react-complex-tree` | 2.6.4 (2026-08-24) | MIT | none | 1.3 MB | Predecessor of headless-tree | — |

Sources: npm registry per package; repositories below.

- **PatternFly TreeView** renders children recursively — `TreeView.tsx` maps `data` and nests a
  `TreeView` for `item.children`; `TreeViewListItem` renders children when
  `internalIsExpanded || hasAnimations` ([TreeView.tsx](https://github.com/patternfly/patternfly-react/blob/eb3b20788f/packages/react-core/src/components/TreeView/TreeView.tsx),
  [TreeViewListItem.tsx](https://github.com/patternfly/patternfly-react/blob/eb3b20788f/packages/react-core/src/components/TreeView/TreeViewListItem.tsx)).
  The only large-data guidance: "Turning on memoization with the `useMemo` property helps prevent
  unnecessary re-renders for large data sets"
  ([TreeView.md](https://github.com/patternfly/patternfly-react/blob/eb3b20788f/packages/react-core/src/components/TreeView/examples/TreeView.md)).
  Features shown: search, checkboxes, icons, badges, action items, guides, compact.
- PatternFly table design guidelines list "Virtualized tables (no pagination)" as an option
  ([table.md](https://github.com/patternfly/patternfly-org/blob/8e08661e4e/packages/documentation-site/patternfly-docs/content/components/table/table.md));
  the implementation is the separate `react-virtualized-extension` (registry, section 1).
- **TanStack Virtual**: "a headless UI utility for virtualizing long lists … It is not a
  component therefore does not ship with or render any markup or styles"
  ([introduction.md](https://github.com/TanStack/virtual/blob/51b06cd5e0/docs/introduction.md)).
- **react-window**: "helps render large lists of data quickly"; v2 has no runtime deps and
  supports React 18/19 only ([README](https://github.com/bvaughn/react-window/blob/18f1892c93/README.md), registry).
- **react-virtuoso**: "Variable sized items out of the box; no manual measurements", grouped mode
  with sticky headers, MIT; the chat Message List is a separate product
  ([README](https://github.com/petyosi/react-virtuoso/blob/31aef22e25/README.md)).
- **react-arborist** features: drag-and-drop sorting, open/close, inline rename, "Virtualized
  rendering", keyboard navigation ([README](https://github.com/brimdata/react-arborist/blob/a4c7805719/README.md));
  it still depends on `react-window ^1.8.11` and `react-dnd ^16` (registry).
- **Headless Tree**: "official successor for react-complex-tree"; "The interface gives you a flat
  list of tree nodes … allows you to virtualize the tree with any virtualization library … The
  library automatically provides the necessary aria tags to emulate a nested tree structure";
  per-feature min+gzip sizes from Bundlephobia as of v0.0.15
  ([readme.md](https://github.com/lukasbach/headless-tree/blob/37fcfd9393/readme.md)).

## 4. How existing two-tree mapping editors are drawn

**Kaoto DataMapper (Apache Camel, PatternFly, Apache-2.0)** — read from source
([KaotoIO/kaoto @ f109c16bb7](https://github.com/KaotoIO/kaoto/tree/f109c16bb7/packages/ui/src/components/View)):
- Layout: `SourceTargetView` composes `SourcePanel`, `MappingLinksContainer` (SVG) and `TargetPanel`, with
  PatternFly `Split`, `Button`, zoom icons
  ([SourceTargetView.tsx](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/components/View/SourceTargetView.tsx)).
- Trees: each panel flattens the expanded document tree (`sourceBodyTree.flatten(expansionState)`)
  and renders rows with `react-virtuoso` `<Virtuoso>`; connection ports are re-synced on
  expand/collapse ([SourcePanel.tsx](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/components/View/SourcePanel.tsx)).
- Links: one absolutely positioned `<svg>`; each link is a cubic Bézier drawn with
  `@visx/shape` `LinePath` + `@visx/curve` `curveMonotoneX`, endpoint dots, click selects the
  target node; endpoint coordinates come from DOM port positions minus the SVG's
  `getBoundingClientRect()`; collapsed/scrolled-away nodes use `getNearestVisiblePort`
  ([MappingLink.tsx](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/components/View/MappingLink.tsx),
  [MappingLinkContainer.tsx](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/components/View/MappingLinkContainer.tsx)).
- Line styles: `copy-of`, `complete`, `regular`, `partial`, `out-of-view`
  ([visualization.ts](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/models/datamapper/visualization.ts)).
- No function canvas: target nodes carry actions `valueSelector`, `copyOfSelector`, `if`,
  `choose`/`when`/`otherwise`, `forEach`, `forEachGroup`, `sort`, `variable`, … and an XPath
  editor; the result is serialised as XSLT
  ([mapping-action.ts](https://github.com/KaotoIO/kaoto/blob/f109c16bb7/packages/ui/src/models/datamapper/mapping-action.ts),
  [services/mapping](https://github.com/KaotoIO/kaoto/tree/f109c16bb7/packages/ui/src/services/mapping)).
- Package `@kaoto/kaoto` 2.14.0 (2026-10-29) pins PatternFly 6.6.x, peers React `^19.2.4`, and
  also depends on `@carbon/react`, `@dnd-kit/core`, `zustand`, `mobx` (registry).

**SAP PI/PO message mapping** (help.sap.com, NetWeaver 7.31 docs; search excerpts):
- *Structure overview* shows source on the left and target on the right; a green or yellow
  target field shows an (incomplete) mapping; double-click opens it in the data-flow editor
  ([Structure Overview](https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-us/4b/fb444966d33de4e10000000a42189e/content.htm?no_cache=true)).
- *Data-flow editor*: one *target field mapping* per target field; functions and fields are
  movable rectangles ("data-flow objects") connected by small input/output rectangles, a
  function chooser below; objects turn green when complete
  ([Data-Flow Editor](https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-US/4b/f414eeeaca4c86e10000000a42189e/content.htm?no_cache=true)).
- Runtime model shown to the user as queues per source field and contexts
  ([Processing an Input Queue](https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-us/4b/f414e4eaca4c86e10000000a42189e/content.htm?no_cache=true),
  [Mapping Fields Within a Context](https://help.sap.com/saphelp_em900/helpdata/en/4b/f414f7eaca4c86e10000000a42189e/content.htm?no_cache=true)).
- *Display queue* shows values of functions, fields and constants for a test instance, opened
  from an element's context menu ([Using Display Queue](https://help.sap.com/doc/saphelp_snc700_ehp04/7.0.4/en-US/4c/929f140a1847d8ba349637b46d5440/content.htm?no_cache=true)).
  Other aids: Text Preview (red = missing mapping), Dependencies (colour-coded), Delete Floating
  Objects ([Message Mappings](https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-US/4b/f413a8eaca4c86e10000000a42189e/content.htm?no_cache=true)).

**SAP Integration Suite / Cloud Integration** (search excerpts): source and target messages
added from WSDL/XSD; fields connected and functions applied in the "mapping expression" area;
*Simulate* tests the whole mapping, *Display Queue* tests one node
([Message Mapping](https://help.sap.com/docs/r/368c481cd6954bdfa5d0435479fd4eaf/Cloud/en-US/459ccdf98a7542d897c1e802d0be800a.html),
[Defining the Message Mapping](https://help.sap.com/docs/r/368c481cd6954bdfa5d0435479fd4eaf/Cloud/en-US/c0e0f6d3905b48e0afa317f9abbcc48c.html)).

**Altova MapForce** (search excerpt of the 2026 manual): one *Mapping pane* holding source and
target components plus function components dragged from the *Libraries* window; inputs on the
left and outputs on the right of each component as small triangles; a mapping is a line between
connectors ([MapForce 2026 Professional manual](https://www.altova.com/documents/MapForceProfessional.pdf)).

**Talend tMap** (search excerpts): table-first *Map Editor* — input tables (main + lookups) top
left, *Var* panel in the middle, output tables top right with one expression per output column
(expression builder via "[...]"), schema editor and expression editor tabs at the bottom; tXMLMap
adds a tree schema editor ([Map editor interfaces](https://help.qlik.com/talend/en-US/studio-user-guide/8.0-R2026-09/map-editor-interfaces),
[tMap operation](https://help.qlik.com/talend/en-US/studio-user-guide/8.0-R2024-05/tmap-operation),
[tXMLMap operation](https://help.qlik.com/talend/en-US/studio-user-guide/8.0-R2026-06/txmlmap-operation)).

These three map directly onto the prototype's variants: (a) SAP PO = trees + per-field function
graph, (b) MapForce = one data-flow canvas, (c) Talend tMap = table-first with inline expressions.

## 5. Implications for the prototype (not decisions)

- React 19 + PatternFly 6.7 can be used without version risk.
- Trees: a flat visible-row list + virtualiser (Kaoto's pattern) is the documented way to scale;
  PatternFly `TreeView` would need replacing or wrapping for schemas with thousands of fields.
- Links between virtualised trees cannot be React Flow edges unless the trees are inside the
  flow; Kaoto's overlay SVG with "nearest visible port" handles rows that are scrolled away.
- A per-field function graph (variant a) or whole-mapping canvas (variant b) fits React Flow's
  custom-node/handle model; react-topology targets laid-out topologies rather than free editing.

## Open questions for "What should the mapping editor look like?"

1. Tree scale target: how many fields must a source/target tree hold (e.g. IDoc / EDIFACT
   schemas) and at what frame rate? None of the libraries publishes a measured limit except
   Headless Tree's "100k+ items" claim — the prototype has to measure.
2. Can React Flow host the function graph while the two trees stay outside it (Kaoto-style SVG
   overlay), or must the trees become React Flow nodes for variant (b)? How do links behave when
   an endpoint row is virtualised away?
3. Does `onlyRenderVisibleElements` matter for a per-field graph (tens of nodes), or only for a
   whole-mapping canvas (b)?
4. Is the PatternFly visual language enough with React Flow plus PF tokens, or is
   `@patternfly/react-topology` worth its MobX/`popper.js@1` dependencies for consistency?
5. JointJS: does the MPL-2.0 `@joint/react` give everything needed, given that the core README
   lists "JointJS for React" under the commercial JointJS+? (Licence of the published package is
   MPL-2.0; feature parity unknown.)
6. Tree state: own flatten/expansion code (Kaoto) vs `@headless-tree/core` for keyboard and ARIA
   — accessibility requirements for the editor are not yet stated.
7. Display queue placement: SAP opens it per element from a context menu; Cloud Integration
   tests per node in the mapping-expression area. Panel, popover or inline?
8. Line rendering: plain SVG Bézier (Kaoto, ~no deps) vs a canvas library's edges; how are
   context/queue semantics (e.g. context change) shown on a link or in the function graph?
9. Layout of function graphs: free placement (SAP, MapForce) or automatic (dagre MIT, elkjs
   under EPL-2.0)?
