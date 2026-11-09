import { sourceFields, targetFields, fieldName, inputXml, outputXml } from './model';
import {isVariablePath} from './mappingVariables';

const jsonExample = {
  source: {Order: [{Id:'o1', Line:[{Sku:'a'}]}, {Id:'o2', Line:[{Sku:'b'}]}]},
  target: {Grp: [{Row:['a','b']}, {Row:['b']}]}
};
export const formatOf = (map, side) => map.formats?.[side] === 'JSON' ? 'JSON' : 'XML';
export const example = (format, side) => format === 'JSON' ? JSON.stringify(jsonExample[side], null, 2)
  : side === 'source' ? inputXml : outputXml;
export const schemaName = (side, format) => (format === 'JSON' ? 'JSON_' : 'XSD_') + (side === 'source' ? 'src_orders' : 'tgt_nested');

function jsonShape(fields, path, types) {
  const entries = fields.filter(([p]) => p.substring(0, p.lastIndexOf('/')) === path);
  if (!entries.length) return {type:types?.JSON || 'string'};
  const properties = {};
  const required = [];
  for (const [p, occurs, childTypes] of entries) {
    const key = fieldName(p);
    const [min, max] = occurs.split('..');
    let schema = jsonShape(fields, p, childTypes);
    if (p === 'Doc/Grp/Row') schema = {anyOf:[{type:'string'}, schema]};
    if (max !== '1') {
      schema = {type:'array', items:schema};
      if (min !== '0') schema.minItems = Number(min);
      if (max !== '∞') schema.maxItems = Number(max);
    }
    if (min !== '0') required.push(key);
    properties[key] = schema;
  }
  return required.length ? {type:'object', properties, required} : {type:'object', properties};
}
export function jsonSchemaLines(side) {
  const fields = side === 'source' ? sourceFields : targetFields;
  const root = fields[0][0];
  const schema = {$schema:'https://json-schema.org/draft/2020-12/schema', $id:'urn:flottila:schema:'+root.toLowerCase(), title:root, ...jsonShape(fields,root,fields[0][2])};
  const paths = new Map(fields.map(([path])=>[fieldName(path),path]));
  return JSON.stringify(schema,null,2).split('\n').map(content => {
    const key = content.trimStart().match(/^"([^"]+)":/)?.[1];
    return {content,path:key === 'title' ? root : paths.get(key)};
  });
}
export function schemaFieldTypes(fields, format) {
  const parents = new Set(fields.filter(([p])=>!isVariablePath(p)).map(([path]) => path.split('/').slice(0,-1).join('/')));
  return new Map(fields.map(([path, occurs, types]) => {
    if(isVariablePath(path))return [path,'variable'];
    let type = types?.[format] || 'string';
    if (format === 'JSON' && occurs.split('..')[1] !== '1') type = 'array';
    else if (parents.has(path)) type = format === 'JSON' ? 'object' : 'structure';
    return [path, type];
  }));
}
