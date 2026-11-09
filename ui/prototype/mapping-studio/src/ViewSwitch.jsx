
export function ViewSwitch({ label, value, onChange, modes = ['Tree', 'Text'] }) {
  return <div className="switches view-switch" role="group" aria-label={label}>
    {modes.map(mode =>
      <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>{mode}</button>
    )}
  </div>;
}
