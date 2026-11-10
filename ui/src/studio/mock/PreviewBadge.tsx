import { Label, Tooltip } from '@patternfly/react-core';
import { useRef } from 'react';

/**
 * The "Preview" badge of a mocked control (spec #152, ADR-0028): its tooltip says what the preview does not do and names
 * the follow-up issue that makes it real. It takes the keyboard focus, so that the tooltip opens without a mouse.
 */
export function PreviewBadge({ issue, about }: { issue: number; about: string }) {
  const badge = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={badge} tabIndex={0} className="preview-badge">
        <Label isCompact color="purple">
          Preview
        </Label>
      </span>
      <Tooltip triggerRef={badge} content={`${about} Follow-up: #${issue}.`} />
    </>
  );
}
