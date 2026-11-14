import { useEffect } from "react";
import { Link } from "react-router";
import { CreateRoom } from "../components/CreateRoom";
import { PeopleCards } from "../components/PeopleCards";
import { texts } from "../texts";

/** The manifesto: a reading column, the "create room" button, the people and the legal footer. */
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
      <header className="px-5 py-6 text-center">
        <Link to="/" className="rounded-link font-display text-title font-semibold outline-offset-4">
          {texts.home.title}
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-18 pt-14">
        <article className="mx-auto w-full max-w-2xl px-5">
          <h1 className="text-center font-display text-heading font-semibold text-balance sm:text-display-sm">
            {texts.manifesto.title}
          </h1>

          <div className="mt-14 flex flex-col gap-7">
            {texts.manifesto.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-kicker leading-[1.45] text-pretty">
                {paragraph}
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

        <PeopleCards people={texts.manifesto.people} />
      </main>

      <footer className="px-5 pt-18 pb-14 text-center text-compact text-muted">
        <p>{texts.manifesto.ageNotice}</p>
      </footer>
    </div>
  );
}
