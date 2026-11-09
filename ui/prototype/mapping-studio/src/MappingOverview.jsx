import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm, TextArea } from '@patternfly/react-core';
import { component, esr } from './signatureModel';

export function MappingOverview({ map, editing, onDescriptionChange }) {
  const fields = [
    ['Name', map.title || map.name],
    ['Mapping ID', map.name],
    ['Namespace', esr],
    ['Software Component Version', component],
    ['Status', 'In Process']
  ];

  return <section className="mapping-overview" aria-label="Overview">
    <div className="panel overview-properties">
      <h2>Mapping details</h2>
      <DescriptionList isHorizontal isCompact>
        {fields.map(([term, value]) => <DescriptionListGroup key={term}>
          <DescriptionListTerm>{term}</DescriptionListTerm>
          <DescriptionListDescription>{term==='Mapping ID'||term==='Namespace'?<code>{value}</code>:value}</DescriptionListDescription>
        </DescriptionListGroup>)}
      </DescriptionList>
    </div>
    <div className="panel overview-description">
      <label htmlFor="mapping-description">Description</label>
      <TextArea id="mapping-description" readOnlyVariant={editing?undefined:"default"} rows={8} resizeOrientation="vertical"
        value={map.description || ''} onChange={(_, value) => onDescriptionChange(value)}/>
    </div>
  </section>;
}
