export function targetsOf(graph) {
  return graph.nodes.filter(node => node.data.kind === 'target');
}

export function connectedSourcePaths(graphs) {
  const paths=new Set();
  for(const graph of Object.values(graphs)){
    const connected=new Set(graph.edges.map(edge=>edge.source));
    for(const node of graph.nodes)if(node.data.kind==='source'&&connected.has(node.id))paths.add(node.data.path);
  }
  return paths;
}

export function targetNode(graph, path) {
  if (!graph) return undefined;
  const targets = targetsOf(graph);
  return targets.find(node => node.data.path === path) || (targets.length === 1 ? targets[0] : undefined);
}

// Each expression is stored once, under the path of its first target. Original
// single-target workspaces already use this representation.
function ownerPath(map, path) {
  if (Object.hasOwn(map.graphs, path)) return path;
  return Object.keys(map.graphs).find(key =>
    map.graphs[key].nodes.some(node => node.data.kind === 'target' && node.data.path === path));
}

export function graphForPath(map, path) {
  return map.graphs[ownerPath(map, path)];
}

export function updateGraph(map, path, update) {
  const owner = ownerPath(map, path);
  if (owner === undefined) return map;
  const graph = update(map.graphs[owner]);
  return graph === map.graphs[owner] ? map : {...map, graphs:{...map.graphs, [owner]:graph}};
}

export function upstreamIds(graph, ...roots) {
  const incoming = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge.source);
  const seen = new Set(), pending = [...roots];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id) || !incoming.has(id)) continue;
    seen.add(id);
    pending.push(...incoming.get(id));
  }
  return seen;
}

function uniqueId(preferred, used) {
  let id = preferred, suffix = 2;
  while (used.has(id)) id = preferred + ':' + suffix++;
  used.add(id);
  return id;
}

function relabel(graph, ids) {
  return {
    nodes:graph.nodes.map(node => ({...node, id:ids.get(node.id) ?? node.id})),
    edges:graph.edges.map(edge => ({...edge, source:ids.get(edge.source) ?? edge.source, target:ids.get(edge.target) ?? edge.target}))
  };
}

export function groupTargets(map, activePath, addedPath, position) {
  const owner = ownerPath(map, activePath), other = ownerPath(map, addedPath);
  if (!owner || !other || owner === other) return map;
  const original = map.graphs[owner], incoming = map.graphs[other];
  const anchor = targetNode(incoming, addedPath);
  const drop = position ?? {x:targetNode(original, activePath).position.x, y:Math.max(...original.nodes.map(n=>n.position.y)) + 120};
  const used = new Set(original.nodes.map(node => node.id));
  const ids = new Map(incoming.nodes.map(node => [node.id, uniqueId(node.id, used)]));
  const moved = relabel(incoming, ids);
  const edgeIds = new Set(original.edges.map(edge => edge.id));
  const graphs = {...map.graphs};
  delete graphs[other];
  graphs[owner] = {
    nodes:[...original.nodes, ...moved.nodes.map(node => ({...node, position:{
      x:node.position.x + drop.x - anchor.position.x, y:node.position.y + drop.y - anchor.position.y
    }}))],
    edges:[...original.edges, ...moved.edges.map(edge => ({...edge, id:uniqueId(edge.id, edgeIds)}))]
  };
  return {...map, graphs};
}

function subgraph(graph, ids) {
  return {nodes:graph.nodes.filter(node => ids.has(node.id)),
    edges:graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))};
}

export function standaloneExpression(graph, path) {
  const target = targetNode(graph, path);
  const branch = targetsOf(graph).length === 1 ? graph : subgraph(graph, upstreamIds(graph, target.id));
  return relabel(structuredClone(branch), new Map([[target.id,'target']]));
}

export function ungroupTarget(map, path) {
  const owner = ownerPath(map, path), graph = map.graphs[owner];
  if (!graph || targetsOf(graph).length < 2) return map;
  const detached = targetNode(graph, path);
  const branch = upstreamIds(graph, detached.id);
  // Keep shared dependencies, other targets and unrelated floating work.
  const retained = upstreamIds(graph, ...graph.nodes.filter(node => !branch.has(node.id)).map(node => node.id));
  const rest = subgraph(graph, retained);
  const nextOwner = targetsOf(rest).find(node => node.data.path === owner) || targetsOf(rest)[0];
  const graphs = {...map.graphs};
  delete graphs[owner];
  graphs[nextOwner.data.path] = relabel(rest, new Map([[nextOwner.id,'target']]));
  graphs[path] = standaloneExpression(graph, path);
  return {...map, graphs};
}
