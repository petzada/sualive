import { Tooltip } from "@heroui/react";
import type { ReactNode } from "react";

/** Wait before the hint shows on hover (keyboard focus shows it at once). */
const HINT_DELAY_MS = 300;

interface HintProps {
  /** What the control does now. */
  text: string;
  placement?: "top" | "bottom";
  /** One focusable control (a HeroUI button). */
  children: ReactNode;
}

/**
 * Small hint that says what a control does: appears on mouse hover or keyboard focus and goes
 * away when the mouse or the focus leaves. Touch never opens it, so it does not get in the way of
 * a tap.
 */
export function Hint({ text, placement = "top", children }: HintProps) {
  return (
    <Tooltip delay={HINT_DELAY_MS} closeDelay={0}>
      {children}
      <Tooltip.Content
        placement={placement}
        offset={8}
        className="rounded-link px-3 py-1.5 text-compact font-normal break-normal whitespace-nowrap text-ink"
      >
        {text}
      </Tooltip.Content>
    </Tooltip>
  );
}
