import type { CosmeticPaint } from "@sualive/protocol";
import type { CSSProperties, ReactNode } from "react";

/**
 * Cosmetics of the shop, as everyone sees them: the color or gradient of a name and the frame
 * around an avatar. The values come from the catalog (never from a token, see DESIGN.md,
 * "Cosméticos da loja"); the component only hands the light and the dark value to the stylesheet,
 * which picks one by `data-theme`. With no paint, both render the children untouched.
 */
function paintVars(paint: CosmeticPaint): CSSProperties {
  const [lightA, lightB = lightA] = paint.light;
  const [darkA, darkB = darkA] = paint.dark;
  return {
    "--cosmetic-light-a": lightA,
    "--cosmetic-light-b": lightB,
    "--cosmetic-dark-a": darkA,
    "--cosmetic-dark-b": darkB,
  } as CSSProperties;
}

/** A name in the color or gradient the person equipped. */
export function CosmeticName({
  paint,
  className,
  children,
}: {
  paint: CosmeticPaint | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  if (!paint) return <span className={className}>{children}</span>;
  return (
    <span
      className={["cosmetic cosmetic-name", className].filter(Boolean).join(" ")}
      style={paintVars(paint)}
      data-cosmetic="name"
    >
      {children}
    </span>
  );
}

/** An avatar (or its placeholder) inside the frame the person equipped. Keeps the round shape. */
export function CosmeticFrame({
  paint,
  className,
  children,
}: {
  paint: CosmeticPaint | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  if (!paint) return <span className={["inline-flex", className].filter(Boolean).join(" ")}>{children}</span>;
  return (
    <span
      className={["cosmetic cosmetic-frame", className].filter(Boolean).join(" ")}
      style={paintVars(paint)}
      data-cosmetic="frame"
    >
      {children}
    </span>
  );
}
