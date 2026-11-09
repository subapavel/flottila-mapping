import {CubeIcon} from '@patternfly/react-icons';

const numericTypes = new Set(['number', 'decimal', 'float', 'double', 'integer', 'int', 'long', 'short', 'byte',
  'positiveInteger', 'negativeInteger', 'nonPositiveInteger', 'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte']);
const symbols = {string:'T', boolean:'T/F', array:'[ ]', null:'∅', variable:'V'};

export function FieldTypeIcon({type,showTitle=true}) {
  const container = type === 'structure' || type === 'object';
  const symbol = numericTypes.has(type) ? '#' : symbols[type] || '·';
  return <span className="field-type-icon" data-field-type={type} title={showTitle?type:undefined} aria-hidden="true">
    {container ? <CubeIcon/> : symbol}
  </span>;
}
