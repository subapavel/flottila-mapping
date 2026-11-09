import { Button, Tab, TabContent, Tabs, TabTitleText } from '@patternfly/react-core';
import { CheckCircleIcon, CodeIcon, EditIcon, ExchangeAltIcon, FlaskIcon, ListAltIcon, ProjectDiagramIcon, SaveIcon } from '@patternfly/react-icons';

const views = [
  ['overview','Overview',ListAltIcon], ['definition','Definition',ProjectDiagramIcon],
  ['test','Test',FlaskIcon], ['signature','Signature',ExchangeAltIcon], ['functions','Functions',CodeIcon]
].map(([key,label,Icon])=>({key,title:<TabTitleText id={'view-label-'+key}><Icon aria-hidden="true"/> {label}</TabTitleText>}));

export function currentView() {
  const key=location.hash.slice(1);
  return views.some(view=>view.key===key)?key:'overview';
}

export function EditorPanel({activeTab,panelRef,children}) {
  return <TabContent className="studio-tab-panel" id="studio-tab-panel" ref={panelRef} aria-labelledby={'view-label-'+activeTab}>
    {children}
  </TabContent>;
}

export function EditorHeader({ map, activeTab, onTabChange, panelRef, editing, onEdit, onCancel, editButtonRef, unsaved, checking, onCheck, onSave }) {
  const title = map.title || map.name;

  function navigateTabs(event) {
    if(event.target.getAttribute('role')!=='tab')return;
    const buttons=Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
    const index=buttons.indexOf(event.target);
    const next={Home:0,End:buttons.length-1,ArrowLeft:(index+buttons.length-1)%buttons.length,ArrowRight:(index+1)%buttons.length};
    if(!Object.hasOwn(next,event.key))return;
    event.preventDefault();
    const button=buttons[next[event.key]];
    button.focus();
    button.click();
  }
  return (
    <header className="tab-line">
      <Tabs activeKey={activeTab} onSelect={(_, key) => onTabChange(key)} tabListAriaLabel="Editor views" onKeyDown={navigateTabs} unmountOnExit>
        {views.map(({key,title})=><Tab key={key} eventKey={key} title={title} tabIndex={activeTab===key?0:-1} tabContentRef={panelRef} tabContentId="studio-tab-panel"/>)}
      </Tabs>
      <div className="mapping-summary">
        <h1 title={title}>{title}</h1>
      </div>
      <div className="mapping-actions">
        {editing ? <><Button size="sm" variant="link" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="secondary" icon={<CheckCircleIcon/>} isDisabled={!unsaved||checking} onClick={onCheck}>
          {checking ? 'Checking…' : 'Check'}
        </Button>
        <Button size="sm" variant="primary" icon={<SaveIcon/>} isDisabled={!unsaved} onClick={onSave}>Save</Button></> :
          <Button ref={editButtonRef} size="sm" variant="primary" icon={<EditIcon/>} onClick={onEdit}>Edit</Button>}
      </div>
    </header>
  );
}
