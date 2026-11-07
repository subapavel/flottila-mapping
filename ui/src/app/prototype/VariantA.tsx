/*
 * PROTOTYPE (spec #145) — throwaway. Variant A: the PF app shell by the book. Masthead + vertical sidebar Nav
 * (Mappings, Structures); each page a PageSection with Breadcrumb and Title; the editor page has Tabs Editor | Test
 * and the inspector is a Drawer at the right of the whole work area. Test: input left; result over diagnostics right.
 */
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Masthead,
  MastheadBrand,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  Pagination,
  SearchInput,
  Spinner,
  Tab,
  Tabs,
  TabTitleText,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { describeError } from '../../api/client';
import { DiagnosticsTable, EditorActions, InspectorDrawer, NewMappingModal, SplitHalves, StatusLabels, StubMapping, TestInput, TestResult, splitId } from './parts';
import type { VariantProps } from './PrototypeHost';
import { OpenWorkbench, type PageTab, type Workbench } from './workbench';

export function VariantA(props: VariantProps) {
  const { open, onOpen } = props;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [section, setSection] = useState<'mappings' | 'structures'>('mappings');
  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton isHamburgerButton isSidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} aria-label="Navigation" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo>
            <span className="pf-v6-u-font-size-lg pf-v6-u-font-weight-bold">Flottila Mapping</span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
    </Masthead>
  );
  const sidebar = (
    <PageSidebar isSidebarOpen={sidebarOpen}>
      <PageSidebarBody>
        <Nav aria-label="Main navigation" onSelect={(_e, item) => (setSection(item.itemId as 'mappings' | 'structures'), onOpen(undefined))}>
          <NavList>
            <NavItem itemId="mappings" isActive={section === 'mappings'}>
              Mappings
            </NavItem>
            <NavItem itemId="structures" isActive={section === 'structures'}>
              Structures
            </NavItem>
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );
  return (
    <Page masthead={masthead} sidebar={sidebar} isContentFilled className="proto-pf proto-a">
      {section === 'structures' ? (
        <PageSection isFilled>
          <EmptyState titleText="Structures" headingLevel="h1">
            <EmptyStateBody>PROTOTYPE: the structure browser is not part of this prototype.</EmptyStateBody>
          </EmptyState>
        </PageSection>
      ) : open === undefined ? (
        <MappingListA {...props} />
      ) : props.created.has(open) ? (
        <>
          <EditorHeader id={open} onBack={() => onOpen(undefined)} />
          <PageSection isFilled>
            <StubMapping id={open} />
          </PageSection>
        </>
      ) : (
        <OpenWorkbench key={open} mappingId={open} api={props.api} browserState={props.browserState} tab={props.tab} onTab={props.onTab}>
          {(wb) => <OpenMappingA wb={wb} tab={props.tab} onTab={props.onTab} onBack={() => onOpen(undefined)} />}
        </OpenWorkbench>
      )}
    </Page>
  );
}

function MappingListA({ mappings, loadError, onOpen, onCreate }: VariantProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [creating, setCreating] = useState(false);
  const term = search.trim().toLowerCase();
  const filtered = (mappings ?? []).filter((m) => m.id.toLowerCase().includes(term));
  const shown = filtered.slice((page - 1) * perPage, page * perPage);
  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem isActive>Mappings</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mt-md">
          Mappings
        </Title>
        <Content component="p">The workspace's message mappings.</Content>
      </PageSection>
      <PageSection isFilled>
        {loadError ? <Alert variant="danger" isInline title={describeError(loadError).title} /> : null}
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput aria-label="Filter mappings" placeholder="Filter by id" value={search} onChange={(_e, v) => (setSearch(v), setPage(1))} onClear={() => setSearch('')} />
            </ToolbarItem>
            <ToolbarItem>
              <Button onClick={() => setCreating(true)}>New mapping</Button>
            </ToolbarItem>
            <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
              <Pagination itemCount={filtered.length} perPage={perPage} page={page} onSetPage={(_e, p) => setPage(p)} onPerPageSelect={(_e, n) => (setPerPage(n), setPage(1))} isCompact />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {mappings === undefined ? (
          <Spinner aria-label="Loading the mappings" />
        ) : (
          <Table aria-label="Mappings">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Package</Th>
                <Th>Mapping id</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shown.map((m) => (
                <Tr key={m.id}>
                  <Td dataLabel="Name">
                    <Button variant="link" isInline onClick={() => onOpen(m.id)}>
                      {splitId(m.id).name}
                    </Button>
                  </Td>
                  <Td dataLabel="Package">{splitId(m.id).pkg}</Td>
                  <Td dataLabel="Mapping id">
                    <code>{m.id}</code>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </PageSection>
      <NewMappingModal isOpen={creating} onClose={() => setCreating(false)} onCreate={onCreate} defaultPackage="mappings" taken={(id) => (mappings ?? []).some((m) => m.id === id)} />
    </>
  );
}

function EditorHeader({ id, wb, onBack, onErrors }: { id: string; wb?: Workbench; onBack: () => void; onErrors?: () => void }) {
  const { pkg, name } = splitId(id);
  return (
    <PageSection>
      <Breadcrumb>
        <BreadcrumbItem to="#" onClick={(e) => (e.preventDefault(), onBack())}>
          Mappings
        </BreadcrumbItem>
        <BreadcrumbItem>{pkg}</BreadcrumbItem>
        <BreadcrumbItem isActive>{name}</BreadcrumbItem>
      </Breadcrumb>
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="pf-v6-u-mt-md">
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
          <Title headingLevel="h1" size="2xl">
            {name}
          </Title>
          {wb && <StatusLabels wb={wb} onErrors={onErrors} />}
        </Flex>
        {wb && (
          <FlexItem>
            <EditorActions wb={wb} />
          </FlexItem>
        )}
      </Flex>
    </PageSection>
  );
}

function OpenMappingA({ wb, tab, onTab, onBack }: { wb: Workbench; tab: PageTab; onTab: (t: PageTab) => void; onBack: () => void }) {
  const [inspector, setInspector] = useState(true);
  return (
    <>
      <EditorHeader id={wb.mappingId} wb={wb} onBack={onBack} onErrors={() => onTab('test')} />
      <PageSection type="tabs">
        <Tabs activeKey={tab} onSelect={(_e, k) => onTab(k as PageTab)} aria-label="Mapping" usePageInsets>
          <Tab eventKey="editor" title={<TabTitleText>Editor</TabTitleText>} />
          <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>} />
        </Tabs>
      </PageSection>
      {wb.alerts}
      <PageSection isFilled padding={{ default: 'noPadding' }} className="proto-fill proto-column">
        {tab === 'editor' ? (
          <InspectorDrawer wb={wb} open={inspector} onClose={() => setInspector(false)}>
            {!inspector && (
              <Toolbar>
                <ToolbarContent>
                  <ToolbarItem align={{ default: 'alignEnd' }}>
                    <Button variant="link" onClick={() => setInspector(true)}>
                      Show inspector
                    </Button>
                  </ToolbarItem>
                </ToolbarContent>
              </Toolbar>
            )}
            <SplitHalves top={<div className="proto-fill proto-column proto-pad">{wb.structures}</div>} bottom={wb.functionEditor} />
          </InspectorDrawer>
        ) : (
          <div className="proto-two proto-pad proto-fill">
            <section className="proto-column proto-gap proto-fill" aria-labelledby="a-in">
              <Title headingLevel="h2" size="lg" id="a-in">
                Input message
              </Title>
              <TestInput wb={wb} />
            </section>
            <section className="proto-column proto-gap proto-fill" aria-labelledby="a-out">
              <Title headingLevel="h2" size="lg" id="a-out">
                Result
              </Title>
              <div className="proto-fill proto-scroll">
                <TestResult wb={wb} />
              </div>
              <Title headingLevel="h2" size="lg">
                Diagnostics
              </Title>
              <div className="proto-scroll proto-a-diag">
                <DiagnosticsTable wb={wb} />
              </div>
            </section>
          </div>
        )}
      </PageSection>
    </>
  );
}
