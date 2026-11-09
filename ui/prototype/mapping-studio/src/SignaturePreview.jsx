import {Button} from '@patternfly/react-core';
import {CubeIcon} from '@patternfly/react-icons';
import {messages} from './signatureModel';
import {sourceFields,targetFields} from './model';

export function SignaturePreview({map,editing,onEdit}){
  return <div className="signature"><div className="signature-pair">{['source','target'].map(side=><section className="panel" key={side}><header className="editor-section-head"><h2><span className={'role-tile '+side}><CubeIcon/></span>{side==='source'?'Source':'Target'} structure</h2></header>
    <div className="sig-preview">{messages(map,side).map((row,i)=><details key={row.id} open><summary>{i+1}. {row.name||'Unassigned'} <small>{row.format} · {row.occurrence}</small></summary>
      <div>{row.schema&&<code>{row.schema}</code>}{row.namespace&&<p>{row.namespace}</p>}{(row.name==='Orders'?sourceFields:row.name==='Doc'?targetFields:[]).slice(1).map(([path,occ])=><p key={path} style={{paddingLeft:12*(path.split('/').length-1)}}>{path.split('/').at(-1)} <small>{occ}</small></p>)}</div></details>)}</div>
  </section>)}</div><p className="panel sig-preview">The expression editor uses the single-message Orders → Doc example. <Button size="sm" variant="link" onClick={onEdit}>{editing?'Edit signature':'View signature'}</Button></p></div>;
}
