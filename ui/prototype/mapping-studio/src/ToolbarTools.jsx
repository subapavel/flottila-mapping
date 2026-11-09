import {AngleDownIcon,ExpandIcon,WindowMinimizeIcon,WindowRestoreIcon} from '@patternfly/react-icons';

export function Tool({label,icon:Icon,pressed,onClick,disabled,menu=false}) {
  return <button type="button" className="def-tool" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled}
    aria-haspopup={menu?'menu':undefined} onClick={onClick}>{Icon&&<Icon/>}{menu&&<AngleDownIcon className="tool-caret"/>}</button>;
}

export function PaneSizeTools({pane, label, upper=false, view, onChange}) {
  function sizeButton(action, nextView, icon) {
    const restore = view === nextView;
    return <Tool label={restore ? 'Restore split view' : action+' '+pane}
      icon={restore ? WindowRestoreIcon : icon} onClick={() => onChange(restore ? 'split' : nextView)}/>;
  }
  return <div className="pane-size-tools" role="group" aria-label={label}>
    {sizeButton('Minimize', upper ? 'maximized' : 'minimized', WindowMinimizeIcon)}
    {sizeButton('Maximize', upper ? 'minimized' : 'maximized', ExpandIcon)}
  </div>;
}
