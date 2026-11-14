import { Link } from "@heroui/react";
import { texts } from "../texts";

interface ErrorPageProps {
  /** `notFound` for unknown routes; `crash` when rendering failed. */
  kind: "notFound" | "crash";
}

export function ErrorPage({ kind }: ErrorPageProps) {
  const copy = texts.error[kind];

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-gap px-6 py-section text-center">
      <h1 className="font-display text-heading font-semibold">{copy.title}</h1>
      <p className="max-w-xl" role={kind === "crash" ? "alert" : undefined}>
        {copy.message}
      </p>
      {/* Plain href: a full reload is the safe way out after a render failure. */}
      <Link href="/" className="rounded-link font-normal">
        {texts.error.backHome}
      </Link>
    </main>
  );
}
