import { useEffect } from "react";
import { SiteFooter } from "../components/account/PageShell";
import { Brand } from "../components/Brand";
import { CreateRoom } from "../components/CreateRoom";
import { PeopleCards } from "../components/PeopleCards";
import { texts } from "../texts";

/**
 * Photos that open the page, above the title, in the order they appear (three fit one row): file
 * names inside `apps/web/public/images`.
 */
export const MANIFESTO_PHOTOS = ["manifesto-1.jpg", "manifesto-2.jpg", "manifesto-3.jpg"] as const;

/** The manifesto: no name at the top; the photos, a reading column, the "create room" button, the age line and the footer (home and legal links); no back arrow. */
export function ManifestoPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = texts.manifesto.pageTitle;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col gap-18 pt-14">
        {/* The page opens with them: nothing above but this breathing room. */}
        <PeopleCards photos={MANIFESTO_PHOTOS} />

        <article className="mx-auto w-full max-w-2xl px-5">
          <h1 className="text-center font-display text-heading font-semibold text-balance sm:text-display-sm">
            {texts.manifesto.title}
          </h1>

          <div className="mt-14 flex flex-col gap-7">
            {texts.manifesto.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-kicker leading-[1.45] text-pretty md:text-justify">
                <Brand>{paragraph}</Brand>
              </p>
            ))}
          </div>

          <div className="mt-16 flex flex-col items-center gap-7 text-center">
            {/* Small enough to stay on one line on a phone. */}
            <p className="font-display text-body font-semibold sm:text-[24px] sm:leading-tight sm:tracking-normal">
              {texts.manifesto.closing}
            </p>
            <CreateRoom />
          </div>
        </article>
      </main>

      <p className="px-5 pt-18 pb-2 text-center text-compact text-muted">
        <Brand>{texts.manifesto.ageNotice}</Brand>
      </p>
      <SiteFooter home />
    </div>
  );
}
