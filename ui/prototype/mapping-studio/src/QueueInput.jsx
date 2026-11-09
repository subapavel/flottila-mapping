import {useEffect,useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {InstanceTools} from './InstanceTools';
import {Dialog} from './Panels';
import {parsePayload,readInstance} from './testData';

export function QueueInputTools({instances,format,resource,onLoad,enabled}){
  return <div className="expression-input-tools" role="group" aria-label="Queue test input">
    <InstanceTools instances={instances} format={format} resource={resource}
      selectLabel="Queue test input" showGenerate={false}
      onEdit={onLoad} disabled={!enabled} validateFile/>
  </div>;
}

export function QueueFilePrompt({format,close,onFile}){
  const [error,setError]=useState(''),[reading,setReading]=useState(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  async function choose(e){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    setReading(true);setError('');
    try{const text=await readInstance(file,format);parsePayload(text,format);
      if(mounted.current)onFile({id:'upload',name:file.name,text,values:{}});
    }catch{if(mounted.current)setError('Could not read this file. Choose a valid '+format+' test input.');}
    finally{if(mounted.current)setReading(false);}
  }
  return <Dialog title="Choose a test input" close={close} description={'Choose a '+format+' file to display this queue.'}
    footer={<Button variant="link" onClick={close}>Cancel</Button>}>
    <label className="form-field">Test input file<input autoFocus type="file" accept={'.'+format.toLowerCase()+',.zip'} onChange={choose} disabled={reading}/></label>
    {error&&<p role="alert">{error}</p>}
  </Dialog>;
}
