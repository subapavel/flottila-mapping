// PROTOTYPE (#10, throwaway): three variants of the mapping editor on one route,
// switchable via ?variant=a|b|c, the floating bottom bar, or the arrow keys.
import { Button, Drawer, DrawerContent, DrawerContentBody, Label } from '@patternfly/react-core';
import { useState } from 'react';
import { PrototypeSwitcher, type VariantKey } from './PrototypeSwitcher';
import { EditorProvider, useEditor } from './shared/editorState';
import { SidePanel } from './shared/SidePanels';
import { VariantA } from './variants/VariantA';
import { VariantB } from './variants/VariantB';
import { VariantC } from './variants/VariantC';

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: 'a', name: 'PO style' },
  { key: 'b', name: 'One data-flow canvas' },
  { key: 'c', name: 'Table first' }
];

export function PrototypeMappingEditor() {
  return (
    <EditorProvider>
      <Shell />
    </EditorProvider>
  );
}

function Shell() {
  const [variant, setVariant] = useState<VariantKey>(() => {
    const v = new URLSearchParams(location.search).get('variant');
    return v === 'b' || v === 'c' ? v : 'a';
  });
  const change = (k: VariantKey) => {
    const u = new URL(location.href);
    u.searchParams.set('variant', k);
    history.replaceState(null, '', u);
    setVariant(k);
  };
  const { drawer, setDrawer, run, model } = useEditor();
  return (
    <div className="proto-app">
      <header className="proto-header">
        <span className="proto-header__badge">PROTOTYPE #10</span>
        <strong>Mapping editor</strong>
        <span className="muted">PurchaseOrder → Invoice · {Object.keys(model.targetFieldMappings).length} target field mappings</span>
        <span className="proto-header__spacer" />
        <Label color={run.errors.length ? 'red' : 'green'} isCompact>{run.errors.length} errors</Label>
        <Button size="sm" variant={drawer === 'test' ? 'primary' : 'secondary'} onClick={() => setDrawer(drawer === 'test' ? null : 'test')} data-testid="open-test">Test</Button>
        <Button size="sm" variant={drawer === 'json' ? 'primary' : 'secondary'} onClick={() => setDrawer(drawer === 'json' ? null : 'json')} data-testid="open-json">Model JSON</Button>
      </header>
      <Drawer isExpanded={drawer !== null} position="end" className="proto-drawer">
        <DrawerContent panelContent={<SidePanel />}>
          <DrawerContentBody className="proto-body">
            {variant === 'a' && <VariantA />}
            {variant === 'b' && <VariantB />}
            {variant === 'c' && <VariantC />}
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  );
}
