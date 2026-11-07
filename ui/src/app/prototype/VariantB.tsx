/*
 * PROTOTYPE (spec #145) — throwaway. Variant B: Masthead with a horizontal Nav, no sidebar. The list is a PF DataList.
 * The editor is full-bleed under one PF Toolbar: title, status, Undo/Redo/Save/Refresh structures and an
 * Editor | Test toggle group; the inspector is a Drawer. Test: three columns, input | result | diagnostics.
 */
import {
  Alert,
  Button,
  Content,
  DataList,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  Label,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  Pagination,
  SearchInput,
  Spinner,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { useState } from 'react';
import { describeError } from '../../api/client';
import { DiagnosticsTable, EditorActions, InspectorDrawer, NewMappingModal, SplitHalves, StatusLabels, StubMapping, TestInput, TestResult, splitId } from './parts';
import type { VariantProps } from './PrototypeHost';
import { OpenWorkbench, type PageTab, type Workbench } from './workbench';

export function VariantB(props: VariantProps) {
  const { open, onOpen } = props;
  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo>
            <span className="pf-v6-u-font-size-lg pf-v6-u-font-weight-bold">Flottila Mapping</span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Nav variant="horizontal" aria-label="Main navigation" onSelect={() => onOpen(undefined)}>
          <NavList>
            <NavItem itemId="mappings" isActive>
              Mappings
            </NavItem>
            <NavItem itemId="structures">Structures</NavItem>
          </NavList>
        </Nav>
      </MastheadContent>
    </Masthead>
  );
  return (
    <Page masthead={masthead} isContentFilled className="proto-pf proto-b">
      {open === undefined ? (
        <ListB {...props} />
      ) : props.created.has(open) ? (
        <PageSection isFilled>
          <StubMapping id={open} />
        </PageSection>
      ) : (
        <OpenWorkbench key={open} mappingId={open} api={props.api} browserState={props.browserState} tab={props.tab} onTab={props.onTab}>
          {(wb) => <EditorB wb={wb} tab={props.tab} onTab={props.onTab} onBack={() => onOpen(undefined)} />}
        </OpenWorkbench>
      )}
    </Page>
  );
}

function ListB({ mappings, loadError, onOpen, onCreate }: VariantProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [creating, setCreating] = useState(false);
  const term = search.trim().toLowerCase();
  const filtered = (mappings ?? []).filter((m) => m.id.toLowerCase().includes(term));
  const shown = filtered.slice((page - 1) * perPage, page * perPage);
  return (
    <PageSection isFilled>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h1" size="xl">
              Mappings
            </Title>
          </ToolbarItem>
          <ToolbarItem>
            <SearchInput aria-label="Filter mappings" placeholder="Filter by id" value={search} onChange={(_e, v) => (setSearch(v), setPage(1))} onClear={() => setSearch('')} />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <Button onClick={() => setCreating(true)}>New mapping</Button>
            </ToolbarItem>
            <ToolbarItem variant="pagination">
              <Pagination itemCount={filtered.length} perPage={perPage} page={page} onSetPage={(_e, p) => setPage(p)} onPerPageSelect={(_e, n) => (setPerPage(n), setPage(1))} isCompact />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>
      {loadError ? <Alert variant="danger" isInline title={describeError(loadError).title} /> : null}
      {mappings === undefined ? (
        <Spinner aria-label="Loading the mappings" />
      ) : (
        <DataList aria-label="Mappings" onSelectDataListItem={(_e, id) => onOpen(id)}>
          {shown.map((m) => (
            <DataListItem key={m.id} id={m.id} aria-labelledby={`b-${m.id}`}>
              <DataListItemRow>
                <DataListItemCells
                  dataListCells={[
                    <DataListCell key="name" width={3}>
                      <Title headingLevel="h2" size="md" id={`b-${m.id}`}>
                        {splitId(m.id).name}
                      </Title>
                      <Content component="small">
                        <code>{m.id}</code>
                      </Content>
                    </DataListCell>,
                    <DataListCell key="pkg" alignRight isFilled={false}>
                      <Label color="blue">{splitId(m.id).pkg}</Label>
                    </DataListCell>,
                  ]}
                />
              </DataListItemRow>
            </DataListItem>
          ))}
        </DataList>
      )}
      <NewMappingModal isOpen={creating} onClose={() => setCreating(false)} onCreate={onCreate} defaultPackage="mappings" taken={(id) => (mappings ?? []).some((m) => m.id === id)} />
    </PageSection>
  );
}

function EditorB({ wb, tab, onTab, onBack }: { wb: Workbench; tab: PageTab; onTab: (t: PageTab) => void; onBack: () => void }) {
  const [inspector, setInspector] = useState(true);
  return (
    <>
      <PageSection padding={{ default: 'noPadding' }}>
        <Toolbar aria-label="Mapping toolbar" inset={{ default: 'insetMd' }}>
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="link" isInline onClick={onBack}>
                Mappings
              </Button>
            </ToolbarItem>
            <ToolbarItem variant="separator" />
            <ToolbarItem>
              <Title headingLevel="h1" size="lg">
                {splitId(wb.mappingId).name}
              </Title>
            </ToolbarItem>
            <ToolbarItem>
              <StatusLabels wb={wb} onErrors={() => onTab('test')} />
            </ToolbarItem>
            <ToolbarItem>
              <ToggleGroup aria-label="Editor or Test">
                <ToggleGroupItem text="Editor" isSelected={tab === 'editor'} onChange={() => onTab('editor')} />
                <ToggleGroupItem text="Test" isSelected={tab === 'test'} onChange={() => onTab('test')} />
              </ToggleGroup>
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              {tab === 'editor' && !inspector && (
                <ToolbarItem>
                  <Button variant="link" onClick={() => setInspector(true)}>
                    Inspector
                  </Button>
                </ToolbarItem>
              )}
              <ToolbarItem>
                <EditorActions wb={wb} />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </PageSection>
      {wb.alerts}
      <PageSection isFilled padding={{ default: 'noPadding' }} className="proto-fill proto-column">
        {tab === 'editor' ? (
          <InspectorDrawer wb={wb} open={inspector} onClose={() => setInspector(false)}>
            <SplitHalves top={<div className="proto-fill proto-column proto-pad">{wb.structures}</div>} bottom={wb.functionEditor} />
          </InspectorDrawer>
        ) : (
          <div className="proto-three proto-pad proto-fill">
            <section className="proto-column proto-gap proto-fill" aria-labelledby="b-in">
              <Title headingLevel="h2" size="lg" id="b-in">
                Input
              </Title>
              <TestInput wb={wb} />
            </section>
            <section className="proto-column proto-gap proto-fill proto-scroll" aria-labelledby="b-out">
              <Title headingLevel="h2" size="lg" id="b-out">
                Result
              </Title>
              <TestResult wb={wb} />
            </section>
            <section className="proto-column proto-gap proto-fill proto-scroll" aria-labelledby="b-diag">
              <Title headingLevel="h2" size="lg" id="b-diag">
                Diagnostics
              </Title>
              <DiagnosticsTable wb={wb} />
            </section>
          </div>
        )}
      </PageSection>
    </>
  );
}
