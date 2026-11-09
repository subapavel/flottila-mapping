import { useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from '@patternfly/react-core';
import { CheckIcon, CopyIcon, ExclamationCircleIcon } from '@patternfly/react-icons';

export async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers and local previews may only expose the synchronous copy event.
  let handled = false;
  function provideText(event) {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    handled = true;
  }
  document.addEventListener('copy', provideText);
  try {
    if (!document.execCommand('copy') || !handled) throw new Error('Clipboard unavailable');
  } finally {
    document.removeEventListener('copy', provideText);
  }
}

export function CopyTextButton({ label, text }) {
  const trigger = useRef(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [receipt, setReceipt] = useState(null);
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(null), 2400);
    return () => clearTimeout(timer);
  }, [receipt]);
  const feedback = receipt?.text === text ? receipt?.message : '';
  async function copy() {
    try {
      await writeClipboardText(text);
      setReceipt({text, message:'Copied!'});
    } catch {
      setReceipt({text, message:'Could not copy. Select the text and copy it manually.'});
    }
  }
  const icon = !feedback ? <CopyIcon/> : feedback==='Copied!' ? <CheckIcon/> : <ExclamationCircleIcon/>;
  return <>
    <Button ref={trigger} type="button" variant="plain" className="copy-text-button"
      aria-label={'Copy ' + label + ' to clipboard'} isDisabled={!text} onClick={copy} icon={icon}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onKeyDown={e=>{if(e.key==='Escape'){setFocus(false);setHover(false);setReceipt(null);}}}/>
    {text&&(hover||focus||feedback)?<Tooltip className="copy-tooltip" aria="none" aria-live="off" triggerRef={trigger} trigger="manual" isVisible
      position="top-end" maxWidth="16rem" content={feedback||'Copy to clipboard'}/>:null}
    <span className="pf-v6-screen-reader" role="status">{feedback}</span>
  </>;
}

export function CopySurface({label, text, className='', beforeCopy, children}) {
  return <div className={'copy-surface '+className+(beforeCopy?' has-paste':'')}>
    {children}
    <div className="clipboard-actions">
      {beforeCopy}
      <CopyTextButton label={label} text={text}/>
    </div>
  </div>;
}
