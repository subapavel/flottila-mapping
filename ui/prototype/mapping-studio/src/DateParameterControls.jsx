import {useState} from 'react';
import {Button,Switch} from '@patternfly/react-core';
import {Dialog} from './Panels';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const datePatterns=['ddMMyyyy','MMddyyyy','yyyyMMdd','MMyyyydd','ddyyyyMM','yyyyddMM','yyddMM','ddMMyy','MMddyy',''];
const separators=['/',':','-',' '];

export function CalendarOptions({value,change}){
  const [open,setOpen]=useState(false);
  // Older saved nodes used empty strings for the client defaults and Yes/No for leniency.
  const update=(key,v)=>change({...value,[key]:v});
  return <fieldset className="calendar-options"><legend>Calendar properties</legend>
    <Button variant="link" type="button" isInline aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Hide':'Show'} Advanced Properties</Button>
    {open&&<><label>First Weekday<select aria-label="First Weekday" value={value.first||'Sunday'} onChange={e=>update('first',e.target.value)}>{weekdays.map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Minimum Number of Days Required in First Week<select aria-label="Minimum Number of Days Required in First Week" value={value.days||'1'} onChange={e=>update('days',e.target.value)}>{[1,2,3,4,5,6,7].map(v=><option key={v}>{v}</option>)}</select></label>
      <Switch label="Calendar Is Lenient" isChecked={value.lenient!==false&&value.lenient!=='No'} onChange={(_,checked)=>update('lenient',checked)}/></>}
  </fieldset>;
}

export function DateFormatHelp({apply,close}){
  const [parts,setParts]=useState({date:datePatterns[0],time:'',ds:'/',ts:'/',join:' '});
  const format=(v,sep)=>(v.match(/y+|M+|d+|H+|m+|s+/g)||[]).join(sep);
  const result=[format(parts.date,parts.ds),format(parts.time,parts.ts)].filter(Boolean).join(parts.join);
  const select=(key,label,choices)=><label>{label}<select aria-label={label} value={parts[key]} onChange={e=>setParts({...parts,[key]:e.target.value})}>{choices.map(v=><option key={v} value={v}>{v===' '?'Space':v||'None'}</option>)}</select></label>;
  return <Dialog title="SimpleDateFormat" close={close} footer={<><Button onClick={()=>apply(result)}>Apply format</Button><Button variant="link" onClick={close}>Cancel</Button></>}>
    <div className="fn-parameters"><div className="fn-pair-columns">{select('date','Date format',datePatterns)}{select('time','Time format',['','HHmmss','HHmm'])}</div>
    {select('ds','Date Separator',separators)}{select('ts','Time Separator',separators)}{select('join','Date/Time Separator',[' ',','])}
    <div><label htmlFor="date-format-preview">Format preview</label>
      <output id="date-format-preview">{result||'—'}</output></div></div>
  </Dialog>;
}
