import {areas, builtIn, declaration, functionsOf, initialImports, metadata} from './functionModel';

function marker(id) {
  // Stable section identity across browser saves and method renames.
  let hash = 2166136261;
  return Array.from({length:4}, (_,round)=>{
    for (const ch of id+round) hash=Math.imul(hash^ch.charCodeAt(0),16777619);
    return (hash>>>0).toString(16).padStart(8,'0');
  }).join('');
}
function sections(map) {
  const editable = [builtIn(map,areas[0]), builtIn(map,'init'), ...functionsOf(map), builtIn(map,'cleanUp')];
  return [
    {key:'import',tag:marker(map.id+'/imports'),content:(map.imports ?? initialImports).filter(Boolean).map(s=>'import '+s+';').join('\n')},
    ...editable.map(fn=>({key:fn.name===areas[0]?'attributes and methods':fn.name,
      tag:marker(map.id+'/'+(fn.id || fn.name)),content:fn.body,signature:fn.name===areas[0]?'':declaration(fn),fn}))
  ];
}
export function exportSource(map) {
  const {className,packageName} = metadata(map);
  const [imports,...rest] = sections(map);
  const block = s=>'// beginning of '+s.key+' '+s.tag+'\n'+s.content+'\n// end of '+s.key+' '+s.tag;
  const methods=rest.map(s=>s.signature?s.signature+'\n'+block(s)+'\n}':block(s));
  return 'package '+packageName+';\n\n'+block(imports)+'\n\npublic class '+className+' {\n'+methods.join('\n\n')+'\n}\n';
}
export function importSource(map, text) {
  const all=sections(map), found=new Map(), lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  let open=null, body=[];
  for(const line of lines){
    const match=line.match(/^\s*\/\/ (beginning|end) of (.+?) ([a-f0-9]{32})\s*$/i);
    if(!match){if(open)body.push(line);continue;}
    const [,boundary,name,tag]=match;
    if(boundary==='beginning'){
      if(open||found.has(tag))throw Error('Overlapping or duplicate source sections.');
      open={name,tag};body=[];
    }else{
      if(!open||open.tag!==tag||open.name!==name)throw Error('Source section markers do not match.');
      found.set(tag,body.join('\n'));open=null;
    }
  }
  if(open || !all.every(s=>found.has(s.tag)) || all.length!==found.size)throw Error('Choose a source file exported for these functions. Check its section markers.');
  const imports=found.get(all[0].tag).split('\n').map(s=>s.trim()).filter(Boolean).map(s=>{
    const match=s.match(/^import\s+([\w$.*]+);$/);if(!match)throw Error('Invalid import instruction: '+s);return match[1];
  });
  const javaAreas={...map.javaAreas};
  const custom=functionsOf(map).map(f=>({...f}));
  for(const s of all.slice(1)){
    const fn=custom.find(f=>f.id===s.fn.id);
    if(fn)fn.body=found.get(s.tag);
    else javaAreas[s.fn.name]={...s.fn,body:found.get(s.tag)};
  }
  return {...map,imports,javaAreas,customFunctions:custom};
}
