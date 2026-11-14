import { useState } from "react";

/** Folder, inside the front's public files, where the photos live. */
const PHOTO_PATH = "/images/";

/**
 * Photo cards, with no text. Whichever card is under the pointer stands out while the others
 * step back. A photo that is not there yet is left out; with none to show, renders nothing.
 */
export function PeopleCards({ photos }: { photos: readonly string[] }) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const shown = photos.filter((photo) => !missing.includes(photo));

  if (shown.length === 0) return null;

  return (
    // Decorative: the photos carry no information, so the whole strip stays out of the reading order.
    <div
      aria-hidden="true"
      className="group mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-5 md:grid-cols-3"
    >
      {shown.map((photo) => (
        <div
          key={photo}
          className="relative h-80 overflow-hidden rounded-card bg-stage transition duration-500 ease-in-out group-hover:scale-[0.97] group-hover:opacity-60 group-hover:blur-[2px] hover:z-10 hover:scale-105! hover:opacity-100! hover:blur-none! motion-reduce:scale-100! motion-reduce:blur-none! motion-reduce:transition-none"
        >
          <img
            src={PHOTO_PATH + photo}
            alt=""
            className="absolute inset-0 size-full object-cover object-[center_30%]"
            onError={() => setMissing((current) => [...current, photo])}
          />
        </div>
      ))}
    </div>
  );
}
