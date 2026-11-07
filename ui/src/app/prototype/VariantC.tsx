/*
 * PROTOTYPE (spec #145) — throwaway. Variant C, the main one: SAP PO ESR's layout and interaction model in PF.
 * Left, the object browser (PageSidebar): software component › namespace (package) › message mappings, a search and
 * New mapping. Right, the open mapping: a title bar, Tabs Editor | Test. Editor: source tree left, target tree right,
 * mapping lines between them; below, the graphical function editor of the selected target field with its palette
 * and display queue, the inspector as a Drawer beside the function editor only. Test: the source message and the
 * target message side by side, the diagnostics and the run log in a bottom area.
 */
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
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
  TreeView,
  type TreeViewDataItem,
} from '@patternfly/react-core';
import CubesIcon from '@patternfly/react-icons/dist/esm/icons/cubes-icon';
import FolderIcon from '@patternfly/react-icons/dist/esm/icons/folder-icon';
import FolderOpenIcon from '@patternfly/react-icons/dist/esm/icons/folder-open-icon';
import PlusIcon from '@patternfly/react-icons/dist/esm/icons/plus-icon';
import ProjectDiagramIcon from '@patternfly/react-icons/dist/esm/icons/project-diagram-icon';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState } from 'react';
import { describeError, type MappingSummary } from '../../api/client';
import { DiagnosticsTable, InspectorDrawer, NewMappingModal, SplitHalves, StatusLabels, StubMapping, TestInput, TestResult, EditorActions, splitId } from './parts';
import type { VariantProps } from './PrototypeHost';
import { OpenWorkbench, type PageTab, type Workbench } from './workbench';

const SWC = 'corpus · workspace';

export function VariantC(props: VariantProps) {
  const { mappings, open, onOpen, created, onCreate } = props;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [pkg, setPkg] = useState<string | undefined>(undefined);
  const packages = useMemo(() => groupByPackage(mappings ?? []), [mappings]);
  const openPkg = open ? splitId(open).pkg : (pkg ?? packages[0]?.pkg);

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton isHamburgerButton isSidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} aria-label="Object browser" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component="a" href="?variant=C" onClick={(e: React.MouseEvent) => (e.preventDefault(), onOpen(undefined))}>
            <span className="pf-v6-u-font-size-lg pf-v6-u-font-weight-bold">Flottila Mapping</span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarItem>
              <Content component="small">Repository: {SWC}</Content>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  const term = search.trim().toLowerCase();
  const tree: TreeViewDataItem[] = [
    {
      id: 'swc',
      name: SWC,
      title: 'Software component',
      icon: <CubesIcon />,
      defaultExpanded: true,
      children: packages.map(({ pkg: p, items }) => {
        const shown = items.filter((m) => term === '' || m.name.toLowerCase().includes(term));
        return {
          id: `ns:${p}`,
          name: p,
          title: 'Namespace',
          icon: <FolderIcon />,
          expandedIcon: <FolderOpenIcon />,
          defaultExpanded: term !== '' || p === openPkg,
          hasBadge: true,
          customBadgeContent: shown.length,
          children: [
            {
              id: `mm:${p}`,
              name: 'Message mappings',
              icon: <FolderIcon />,
              expandedIcon: <FolderOpenIcon />,
              defaultExpanded: true,
              hasBadge: true,
              customBadgeContent: shown.length,
              children: shown.map((m) => ({ id: m.id, name: m.name, icon: <ProjectDiagramIcon /> })),
            },
          ],
        };
      }),
    },
  ];
  const active = open ? [{ id: open, name: splitId(open).name }] : openPkg ? [{ id: `ns:${openPkg}`, name: openPkg }] : [];

  const sidebar = (
    <PageSidebar isSidebarOpen={sidebarOpen} className="proto-c-browser">
      <PageSidebarBody isFilled={false}>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
            <Title headingLevel="h2" size="md">
              Objects
            </Title>
            <Button variant="secondary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
              New mapping
            </Button>
          </Flex>
          <SearchInput aria-label="Search mappings" placeholder="Search mappings" value={search} onChange={(_e, v) => setSearch(v)} onClear={() => setSearch('')} />
        </Flex>
      </PageSidebarBody>
      <PageSidebarBody isFilled className="proto-scroll">
        {mappings === undefined ? (
          <Spinner size="lg" aria-label="Loading the mappings" />
        ) : (
          <TreeView
            // remount on search so that defaultExpanded applies to what the search shows
            key={`${term}|${openPkg}`}
            aria-label="Object browser"
            data={tree}
            activeItems={active}
            hasGuides
            onSelect={(_e, item) => {
              const id = String(item.id);
              if (id.startsWith('ns:')) {
                setPkg(id.slice(3));
                onOpen(undefined);
              } else if (id !== 'swc' && !id.startsWith('mm:')) onOpen(id);
            }}
          />
        )}
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page masthead={masthead} sidebar={sidebar} isContentFilled className="proto-pf proto-c">
      {props.loadError ? (
        <PageSection>
          <Alert variant="danger" isInline title={describeError(props.loadError).title} />
        </PageSection>
      ) : open === undefined ? (
        <NamespaceOverview pkg={openPkg} items={packages.find((p) => p.pkg === openPkg)?.items} onOpen={onOpen} onNew={() => setCreating(true)} />
      ) : created.has(open) ? (
        <>
          <MappingHeader id={open} />
          <PageSection isFilled>
            <StubMapping id={open} />
          </PageSection>
        </>
      ) : (
        <OpenWorkbench key={open} mappingId={open} api={props.api} browserState={props.browserState} tab={props.tab} onTab={props.onTab}>
          {(wb) => <OpenMappingC wb={wb} tab={props.tab} onTab={props.onTab} />}
        </OpenWorkbench>
      )}
      <NewMappingModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreate={onCreate}
        defaultPackage={openPkg ?? 'mappings'}
        taken={(id) => (mappings ?? []).some((m) => m.id === id)}
      />
    </Page>
  );
}

function groupByPackage(mappings: MappingSummary[]) {
  const by = new Map<string, MappingSummary[]>();
  for (const m of mappings) {
    const { pkg } = splitId(m.id);
    by.set(pkg, [...(by.get(pkg) ?? []), { id: m.id, name: splitId(m.id).name }]);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pkg, items]) => ({ pkg, items }));
}

/** No mapping open: the selected namespace's objects, as ESR shows a namespace. */
function NamespaceOverview({ pkg, items, onOpen, onNew }: { pkg: string | undefined; items: MappingSummary[] | undefined; onOpen: (id: string) => void; onNew: () => void }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  if (pkg === undefined || items === undefined) {
    return (
      <PageSection isFilled>
        <EmptyState titleText="Select an object" headingLevel="h2">
          <EmptyStateBody>Pick a namespace or a message mapping in the object browser.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }
  const shown = items.slice((page - 1) * perPage, page * perPage);
  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>{SWC}</BreadcrumbItem>
          <BreadcrumbItem isActive>{pkg}</BreadcrumbItem>
        </Breadcrumb>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsFlexEnd' }} className="pf-v6-u-mt-md">
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              {pkg}
            </Title>
            <Content component="p">Namespace</Content>
          </FlexItem>
          <FlexItem>
            <Button onClick={onNew}>New mapping</Button>
          </FlexItem>
        </Flex>
        <DescriptionList isHorizontal isCompact className="pf-v6-u-mt-md" columnModifier={{ default: '3Col' }}>
          <DescriptionListGroup>
            <DescriptionListTerm>Software component</DescriptionListTerm>
            <DescriptionListDescription>{SWC}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Message mappings</DescriptionListTerm>
            <DescriptionListDescription>{items.length}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Folder</DescriptionListTerm>
            <DescriptionListDescription>
              <code>{pkg}/</code>
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </PageSection>
      <PageSection isFilled>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Title headingLevel="h2" size="lg">
                Message mappings <Badge isRead>{items.length}</Badge>
              </Title>
            </ToolbarItem>
            <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
              <Pagination
                itemCount={items.length}
                perPage={perPage}
                page={page}
                onSetPage={(_e, p) => setPage(p)}
                onPerPageSelect={(_e, n) => (setPerPage(n), setPage(1))}
                isCompact
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        <Table aria-label="Message mappings" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Mapping id</Th>
            </Tr>
          </Thead>
          <Tbody>
            {shown.map((m) => (
              <Tr key={m.id} isClickable onRowClick={() => onOpen(m.id)}>
                <Td dataLabel="Name">
                  <Button variant="link" isInline onClick={() => onOpen(m.id)}>
                    {m.name}
                  </Button>
                </Td>
                <Td dataLabel="Mapping id">
                  <code>{m.id}</code>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
}

function MappingHeader({ id, wb, onErrors }: { id: string; wb?: Workbench; onErrors?: () => void }) {
  const { pkg, name } = splitId(id);
  return (
    <PageSection className="proto-c-head">
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'nowrap' }}>
        <FlexItem>
          <Breadcrumb>
            <BreadcrumbItem>{SWC}</BreadcrumbItem>
            <BreadcrumbItem>{pkg}</BreadcrumbItem>
            <BreadcrumbItem isActive>Message mapping</BreadcrumbItem>
          </Breadcrumb>
          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }} className="pf-v6-u-mt-sm">
            <Title headingLevel="h1" size="xl">
              {name}
            </Title>
            {wb && <StatusLabels wb={wb} onErrors={onErrors} />}
          </Flex>
          {wb && (
            <Content component="small">
              {wb.sourceRoot} → {wb.targetRoot} · {wb.mappingCount} target field mappings
            </Content>
          )}
        </FlexItem>
        {wb && (
          <FlexItem>
            <EditorActions wb={wb} />
          </FlexItem>
        )}
      </Flex>
    </PageSection>
  );
}

function OpenMappingC({ wb, tab, onTab }: { wb: Workbench; tab: PageTab; onTab: (t: PageTab) => void }) {
  const [inspector, setInspector] = useState(true);
  return (
    <>
      <MappingHeader id={wb.mappingId} wb={wb} onErrors={() => onTab('test')} />
      <PageSection type="tabs" className="proto-c-tabs">
        <Tabs activeKey={tab} onSelect={(_e, k) => onTab(k as PageTab)} aria-label="Mapping" usePageInsets>
          <Tab eventKey="editor" title={<TabTitleText>Editor</TabTitleText>} />
          <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>} />
        </Tabs>
      </PageSection>
      {wb.alerts}
      {/* only the active tab is mounted: the hidden Editor's canvas can no longer leak onto Test */}
      <PageSection isFilled padding={{ default: 'noPadding' }} className="proto-fill proto-column" aria-label={tab === 'editor' ? 'Editor' : 'Test'}>
        {tab === 'editor' ? (
          <SplitHalves
            initial={0.45}
            top={<div className="proto-fill proto-column proto-pad">{wb.structures}</div>}
            bottom={
              <InspectorDrawer wb={wb} open={inspector} onClose={() => setInspector(false)} defaultSize="320px">
                {!inspector && (
                  <Toolbar className="proto-mini-bar">
                    <ToolbarContent>
                      <ToolbarItem align={{ default: 'alignEnd' }}>
                        <Button variant="link" onClick={() => setInspector(true)}>
                          Show inspector
                        </Button>
                      </ToolbarItem>
                    </ToolbarContent>
                  </Toolbar>
                )}
                {wb.functionEditor}
              </InspectorDrawer>
            }
          />
        ) : (
          <TestC wb={wb} />
        )}
      </PageSection>
    </>
  );
}

function TestC({ wb }: { wb: Workbench }) {
  return (
    <SplitHalves
      initial={0.6}
      top={
        <div className="proto-two proto-pad proto-fill">
          <section className="proto-column proto-gap proto-fill" aria-labelledby="c-src">
            <Title headingLevel="h2" size="lg" id="c-src">
              Source message <Content component="small">({wb.sourceRoot})</Content>
            </Title>
            <TestInput wb={wb} />
          </section>
          <section className="proto-column proto-gap proto-fill" aria-labelledby="c-tgt">
            <Title headingLevel="h2" size="lg" id="c-tgt">
              Target message <Content component="small">({wb.targetRoot})</Content>
            </Title>
            <div className="proto-scroll proto-fill">
              <TestResult wb={wb} />
            </div>
          </section>
        </div>
      }
      bottom={
        <section className="proto-column proto-fill proto-pad proto-gap" aria-labelledby="c-diag">
          <Title headingLevel="h2" size="lg" id="c-diag">
            Diagnostics and log
          </Title>
          <Divider />
          <div className="proto-scroll proto-fill">
            <DiagnosticsTable wb={wb} />
          </div>
        </section>
      }
    />
  );
}
