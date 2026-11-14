import { CreateRoom } from "../components/CreateRoom";
import { ManifestoCard } from "../components/ManifestoCard";
import { texts } from "../texts";

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-5 py-16">
      <div className="grid items-center gap-10 perspective-[1000px] md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-center gap-gap text-center">
          <h1 className="font-display text-heading font-semibold sm:text-display-sm lg:text-display">
            {texts.home.title}
          </h1>
          <p className="max-w-xl">
            {texts.home.tagline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>

          <CreateRoom hint={texts.home.hint} className="mt-2" />
        </div>

        <ManifestoCard />
      </div>
    </main>
  );
}
