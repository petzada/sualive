import { Chip } from "@heroui/react";
import { texts } from "../texts";

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-gap px-6 py-section text-center">
      <Chip className="rounded-button px-3 text-compact font-normal">{texts.home.notice}</Chip>
      <h1 className="font-display text-heading font-semibold sm:text-display-sm lg:text-display">
        {texts.home.title}
      </h1>
      <p className="max-w-xl">{texts.home.tagline}</p>
      <p className="text-body-sm text-muted">{texts.home.noticeDetail}</p>
    </main>
  );
}
