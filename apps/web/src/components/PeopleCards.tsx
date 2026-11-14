import { useState } from "react";
import type { ManifestoPerson } from "../texts";

/** Folder, inside the front's public files, where the photos of the people live. */
const PEOPLE_IMAGE_PATH = "/images/";

/**
 * Photo cards of people, name above the city. Whichever card is under the pointer (or has the
 * keyboard focus) stands out while the others step back. A person whose photo is not there yet
 * is left out; with nobody to show, renders nothing.
 */
export function PeopleCards({ people }: { people: readonly ManifestoPerson[] }) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const shown = people.filter((person) => !missing.includes(person.image));

  if (shown.length === 0) return null;

  return (
    <ul className="group mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-5 md:grid-cols-3">
      {shown.map((person) => (
        <li
          key={person.image}
          tabIndex={0}
          className="relative h-80 overflow-hidden rounded-card bg-stage text-on-stage outline-offset-4 transition duration-500 ease-in-out group-focus-within:scale-[0.97] group-focus-within:opacity-60 group-focus-within:blur-[2px] group-hover:scale-[0.97] group-hover:opacity-60 group-hover:blur-[2px] hover:z-10 hover:scale-105! hover:opacity-100! hover:blur-none! focus-visible:z-10 focus-visible:scale-105! focus-visible:opacity-100! focus-visible:blur-none! motion-reduce:scale-100! motion-reduce:blur-none! motion-reduce:transition-none"
        >
          <img
            src={PEOPLE_IMAGE_PATH + person.image}
            alt=""
            className="absolute inset-0 size-full object-cover object-[center_30%]"
            onError={() => setMissing((current) => [...current, person.image])}
          />
          {/* Darkens the foot of the photo so the name stays readable over it. */}
          <div className="absolute inset-0 bg-linear-to-t from-stage/80 via-stage/30 via-45% to-transparent to-75%" />
          <div className="absolute bottom-0 left-0 p-6">
            <p className="font-display text-kicker leading-tight font-semibold">{person.name}</p>
            <p className="mt-1.5 text-body-sm text-on-stage/80">{person.city}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
