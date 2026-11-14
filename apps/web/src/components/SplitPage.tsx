import type { ReactNode } from "react";
import { SiteFooter } from "./account/PageShell";

interface SplitPageProps {
  /** Left column: centered text and actions, one under the other, in the rhythm of the theme. */
  children: ReactNode;
  /** Right column: the picture card(s). Under the left column on a phone. */
  aside: ReactNode;
  /** The legal links at the foot of the page. Off when the left column already carries them. */
  footer?: boolean;
}

/**
 * Two columns shared by the home page and the login: what the person does on the left, pictures on
 * the right, both centered in the height of the window. Sets the `perspective` of the cards.
 * The footer sits over the bottom padding instead of taking height, so the centering is the same
 * with or without it.
 */
export function SplitPage({ children, aside, footer = true }: SplitPageProps) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-16">
        <div className="grid items-center gap-10 perspective-[1000px] md:grid-cols-2 md:gap-12">
          <div className="flex flex-col items-center gap-gap text-center">{children}</div>
          {aside}
        </div>
      </main>
      {footer && (
        <div className="absolute inset-x-0 bottom-0">
          <SiteFooter />
        </div>
      )}
    </div>
  );
}
