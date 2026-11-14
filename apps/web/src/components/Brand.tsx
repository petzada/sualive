import { APP_NAME } from "@sualive/config";
import { Fragment } from "react";

/**
 * A piece of copy with the name of the product in bold wherever it shows up. The name keeps the
 * size and the place it has in the sentence; only the weight changes.
 */
export function Brand({ children }: { children: string }) {
  const parts = children.split(APP_NAME);
  return (
    <>
      {parts.map((part, index) => (
        // The pieces never change order: the index is a stable key.
        <Fragment key={index}>
          {index > 0 && <strong className="font-bold">{APP_NAME}</strong>}
          {part}
        </Fragment>
      ))}
    </>
  );
}
