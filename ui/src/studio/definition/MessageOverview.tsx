import type { ReactNode } from 'react';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { SideBySide } from './SplitLayout';

/**
 * The source and target message panes side by side (the prototype's MessageOverview), the width between them resizable
 * and kept per user. The prototype's field connections between the panes come with the Dependencies tool (#157).
 */
export function MessageOverview({ browserState, children }: { browserState: BrowserStateStore; children: [ReactNode, ReactNode] }) {
  return (
    <SideBySide
      className="message-overview"
      label="Resize source and target panels"
      leftId="source-message-pane"
      browserState={browserState}
      widthKey="definition.width"
    >
      {children}
    </SideBySide>
  );
}
