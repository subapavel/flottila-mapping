import {useMemo,useState} from 'react';
import {example} from './formats';
import {traceLevels} from './testData';

function readSimulation(key) {
  try {
    const record = JSON.parse(localStorage.getItem(key));
    const result = record?.result;
    if (typeof record?.input !== 'string' || typeof result?.ok !== 'boolean' ||
        !traceLevels.includes(result.level) || (result.ok && typeof result.output !== 'string')) return null;
    if (result.lines !== null && !(Array.isArray(result.lines) && result.lines.every(line =>
      typeof line?.message === 'string' && (line.time === undefined || typeof line.time === 'string')))) return null;
    return record;
  } catch {
    return null;
  }
}

export function useSimulationSession(mapId, sourceFormat, targetFormat, instance) {
  const key = 'flottila-mapping-studio.simulation.v1.'+[mapId,sourceFormat,targetFormat].join('.');
  const instanceKey = instance ? [instance.id,instance.lastUsed ?? 0,instance.revision ?? 0].join(':') : '';
  const run = useMemo(() => {
    const saved = readSimulation(key);
    if (saved?.instanceKey !== undefined) return saved.instanceKey === instanceKey ? saved : null;
    // A legacy run only recorded the instance name. Match it until a new selection is made.
    return !instance || (!instance.lastUsed && saved?.inputName === instance.name) ? saved : null;
  }, [key, instance, instanceKey]);
  const [sessions,setSessions] = useState({});
  const initial = {
    instanceKey,
    input: run?.input ?? instance?.text ?? example(sourceFormat,'source'),
    state: {values:run?.values ?? instance?.values ?? {}, trace:run?.result.level,
      inputName:run?.instanceKey !== undefined ? run.inputName : undefined},
    result: run?.result ?? null
  };
  const session = sessions[key]?.instanceKey === instanceKey ? sessions[key] : initial;
  function update(change) {
    setSessions(all => ({...all, [key]:change(all[key]?.instanceKey === instanceKey ? all[key] : initial)}));
  }
  function storeResult(result) {
    const {input,state} = session;
    const record = {input, result, instanceKey, values:state.values, inputName:state.inputName};
    let storageError = '';
    try {
      localStorage.setItem(key, JSON.stringify(record));
    } catch {
      storageError = 'The browser could not save this simulation. It is available in this session only.';
    }
    update(current => ({...current, result, storageError}));
  }
  return {
    ...session,
    editInput: input => update(current => ({...current, input, result:null})),
    loadInput: item => update(current => ({...current, input:item.text, result:null,
      state:{...current.state, inputName:item.name, values:item.values ?? {}}})),
    updateState: change => update(current => ({...current, state:change(current.state)})),
    invalidateResult: () => {if (session.result) update(current => ({...current, result:null}));},
    storeResult
  };
}
