// "$" is the internal path segment reserved by this prototype for a mapping variable.
export const isVariablePath = path => typeof path==='string' && path.split('/').at(-1).startsWith('$');
export const variableName = path => path.split('/').at(-1).slice(1);
const parentOf = path => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';

export function canAddVariable(rows,parent) {
  return !isVariablePath(parent) && rows.some(([path]) => parentOf(path)===parent && !isVariablePath(path));
}

export function availableVariables(rows,target) {
  const before = rows.findIndex(([path]) => path===target);
  return rows.slice(0,Math.max(0,before)).filter(([path]) => isVariablePath(path) && withinVariableScope(path,target));
}

// A variable is visible to the following siblings in its block and their descendants.
const withinVariableScope = (variable,target) => target.startsWith(parentOf(variable)+'/');

export function variableTargets(rows,variable) {
  const index=rows.findIndex(([path])=>path===variable);
  if(index<0 || !isVariablePath(variable))return [];
  return rows.slice(index+1).filter(([target])=>withinVariableScope(variable,target));
}

// Older workspaces stored variables at the end of their parent's subtree.
// Rebuild only the display order. Graph paths and saved connections stay intact.
export function restoreVariableOrder(rows) {
  if (!rows?.some(([path]) => isVariablePath(path))) return rows;
  const children = new Map();
  for (const row of rows) {
    const parent = row[0].includes('/') ? parentOf(row[0]) : '';
    if (!children.has(parent)) children.set(parent,[]);
    children.get(parent).push(row);
  }
  function visit(parent) {
    const siblings = children.get(parent)||[];
    return [...siblings.filter(([p])=>isVariablePath(p)),...siblings.filter(([p])=>!isVariablePath(p))]
      .flatMap(row=>[row,...visit(row[0])]);
  }
  return visit('');
}
