/**
 * The three people of the manifesto, smiling (the sad takes stay on the manifesto), one face per
 * card. Each photo is a portrait with the face in its upper third, so each one says where its face
 * is: the crop goes from the top of the hair to under the chin, centered in the card.
 */
const FACES = [
  { photo: "feliz-1.jpg", crop: "object-[51%_31%]" },
  { photo: "feliz-2.jpg", crop: "object-[51%_29%]" },
  { photo: "feliz-3.jpg", crop: "object-[51%_30%]" },
] as const;

/**
 * The picture column of the login: the big card of the home page cut in three slices (same width,
 * same total height, same corners), with nothing to read or press.
 */
export function FaceCards() {
  return (
    <div
      aria-hidden="true"
      className="grid aspect-[4/5] w-full max-w-md grid-rows-3 gap-3 justify-self-center"
    >
      {FACES.map(({ photo, crop }) => (
        <div key={photo} className="relative overflow-hidden rounded-card bg-stage">
          <img
            src={`/images/${photo}`}
            alt=""
            className={`absolute inset-0 size-full object-cover ${crop}`}
          />
        </div>
      ))}
    </div>
  );
}
