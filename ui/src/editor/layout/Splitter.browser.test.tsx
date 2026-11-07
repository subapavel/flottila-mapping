import '@patternfly/react-core/dist/styles/base.css';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { Splitter } from './Splitter';
import type { Split, SplitRules } from './split';

// The look and the gestures of a splitter (spec #145, "Splitters"): an 8 px handle, a grip, two collapse buttons.
const BOTH: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
const END_ONLY: SplitRules = { initial: 0.7, collapsible: ['end'] };

let root: Root | undefined;
let host: HTMLElement | undefined;

function Harness({ orientation, rules }: { orientation: 'horizontal' | 'vertical'; rules: SplitRules }) {
  const [split, setSplit] = useState<Split>({ ratio: rules.initial, collapsed: null });
  const share = split.collapsed === 'start' ? 0 : split.collapsed === 'end' ? 1 : split.ratio;
  const pane = (grow: number, id: string) => (
    <div id={id} data-testid={id} style={{ flex: `${grow} 1 0`, minWidth: 0, minHeight: 0, display: grow === 0 ? 'none' : undefined }} />
  );
  return (
    <div style={{ display: 'flex', flexDirection: orientation === 'horizontal' ? 'column' : 'row', width: 400, height: 300 }}>
      {pane(share, 'first')}
      <Splitter orientation={orientation} label="Resize" controls="first" split={split} rules={rules} onChange={setSplit} />
      {pane(1 - share, 'second')}
    </div>
  );
}

async function render(orientation: 'horizontal' | 'vertical', rules: SplitRules = BOTH) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<Harness orientation={orientation} rules={rules} />);
  await expect.element(separator()).toBeVisible();
}

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
});

const separator = () => page.getByRole('separator', { name: 'Resize' });
const first = () => page.getByTestId('first');
// the buttons are presentational children of the separator: the ARIA tree does not list them, the DOM does
const buttonOf = (pane: 'start' | 'end') => page.elementLocator(separator().element().querySelector(`button[data-pane="${pane}"]`)!);
const startButton = () => buttonOf('start');
const endButton = () => buttonOf('end');

describe('a splitter handle', () => {
  test('is 8 px thick across its axis, horizontal and vertical', async () => {
    await render('horizontal');
    await expect.element(separator()).toBeVisible();
    expect((separator().element() as HTMLElement).getBoundingClientRect().height).toBe(8);
    root!.unmount();
    host!.remove();

    await render('vertical');
    await expect.element(separator()).toBeVisible();
    expect((separator().element() as HTMLElement).getBoundingClientRect().width).toBe(8);
  });

  test('the start button collapses its pane, and pressing it again restores the pane; the title says which', async () => {
    await render('horizontal');
    await expect.element(first()).toBeVisible();
    await expect.element(startButton()).toHaveAttribute('title', 'collapse');
    await expect.element(endButton()).toHaveAttribute('title', 'collapse');

    await startButton().click();
    await expect.element(first()).not.toBeVisible();
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '0');
    await expect.element(startButton()).toHaveAttribute('title', 'restore');
    // the other pane's button still collapses, it does not restore
    await expect.element(endButton()).toHaveAttribute('title', 'collapse');

    await startButton().click();
    await expect.element(first()).toBeVisible();
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '50');
    await expect.element(startButton()).toHaveAttribute('title', 'collapse');
  });

  test('the end button collapses the end pane, and restores it', async () => {
    await render('vertical');
    await endButton().click();
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '100');
    await expect.element(endButton()).toHaveAttribute('title', 'restore');
    await endButton().click();
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '50');
  });

  test('a splitter whose start pane cannot collapse has the end button only', async () => {
    await render('vertical', END_ONLY);
    await expect.element(endButton()).toHaveAttribute('title', 'collapse');
    expect(separator().element().querySelectorAll('button')).toHaveLength(1);
    await endButton().click();
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '100');
  });

  test('a double-click on the grip restores the initial ratio after a drag', async () => {
    await render('horizontal');
    await expect.element(separator()).toBeVisible();
    const handle = separator().element() as HTMLElement;
    const area = handle.parentElement!.getBoundingClientRect();
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: area.top + 0.3 * area.height }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '30');

    await userEvent.dblClick(separator());
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '50');
  });

  test('a press on a button does not start a drag', async () => {
    await render('horizontal');
    await expect.element(separator()).toBeVisible();
    const area = (separator().element() as HTMLElement).parentElement!.getBoundingClientRect();
    startButton().element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: area.top + 0.3 * area.height }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await expect.element(separator()).toHaveAttribute('aria-valuenow', '50');
  });

  test('the buttons stay out of the tab order: the splitter is the one stop, its keys collapse', async () => {
    await render('horizontal');
    await expect.element(startButton()).toHaveAttribute('tabindex', '-1');
    await expect.element(endButton()).toHaveAttribute('tabindex', '-1');
  });
});
