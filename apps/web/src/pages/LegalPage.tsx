import { TERMS_DATE } from "@sualive/config";
import { Brand } from "../components/Brand";
import { PageShell } from "../components/account/PageShell";
import { formatIsoDate } from "../components/format";
import { texts } from "../texts";

/** Terms of use and privacy policy: plain, readable text with its version. */
export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const copy = texts.legal[kind];

  return (
    <PageShell top="back">
      <article className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-heading font-semibold">{copy.title}</h1>
          <p className="text-body-sm text-muted" data-testid="legal-version">
            {texts.legal.version(formatIsoDate(TERMS_DATE))}
          </p>
        </header>

        {copy.sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-3">
            <h2 className="font-display text-kicker leading-tight font-semibold">{section.title}</h2>
            {section.blocks.map((block) =>
              typeof block === "string" ? (
                <p key={block}>
                  <Brand>{block}</Brand>
                </p>
              ) : (
                // Not law yet: the operator still has to fill this in. Kept loud on purpose.
                <p
                  key={block.pending}
                  data-testid="legal-pending"
                  className="rounded-nav bg-mist px-5 py-4 text-body-sm shadow-outline"
                >
                  <strong className="font-semibold text-notice">{texts.legal.pendingLabel}</strong>{" "}
                  {block.pending}.
                </p>
              ),
            )}
          </section>
        ))}
      </article>
    </PageShell>
  );
}
