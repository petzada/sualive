import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { texts } from "../texts";

/** Where "saber mais" leads. */
export const MANIFESTO_PATH = "/manifesto";

/** How far the card leans toward the pointer, in degrees, at its edge. */
const MAX_TILT_DEG = 10;
/** Share of the remaining distance covered per frame: the lean eases in and out. */
const EASING = 0.12;

/** Leans the element toward the pointer while it hovers; still for people who ask for less motion. */
function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const step = () => {
    const now = current.current;
    const goal = target.current;
    now.x += (goal.x - now.x) * EASING;
    now.y += (goal.y - now.y) * EASING;
    const settled = Math.abs(goal.x - now.x) + Math.abs(goal.y - now.y) < 0.001;
    if (settled) current.current = { ...goal };
    const { x, y } = current.current;
    if (ref.current) {
      ref.current.style.transform =
        x === 0 && y === 0
          ? ""
          : `rotateX(${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg)`;
    }
    frame.current = settled ? 0 : requestAnimationFrame(step);
  };

  const moveTo = (x: number, y: number) => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    target.current = { x, y };
    if (!frame.current) frame.current = requestAnimationFrame(step);
  };

  return {
    ref,
    onMouseMove: (event: MouseEvent<T>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      moveTo((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5);
    },
    onMouseLeave: () => moveTo(0, 0),
  };
}

/** Photo card on the home page that leads to the manifesto. Its parent sets the `perspective`. */
export function ManifestoCard() {
  const tilt = useTilt<HTMLElement>();

  return (
    <aside
      {...tilt}
      className="relative flex aspect-[4/5] w-full max-w-md flex-col justify-end justify-self-center overflow-hidden rounded-card bg-stage text-on-stage will-change-transform"
    >
      <img
        src="/images/manifesto.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_22%]"
      />
      {/* Darkens the foot of the photo so the text stays readable over it. */}
      <div className="absolute inset-0 bg-linear-to-t from-stage/80 via-stage/25 via-45% to-transparent to-70%" />
      <div className="relative flex items-end justify-between gap-4 p-6">
        <div>
          <h2 className="font-display text-kicker leading-tight font-semibold">
            {texts.home.manifesto.title}
          </h2>
          <p className="mt-1 text-body-sm text-on-stage/80">{texts.home.manifesto.description}</p>
        </div>
        <Link
          to={MANIFESTO_PATH}
          className="inline-flex min-h-11 shrink-0 items-center rounded-button bg-on-stage px-5 text-body-sm font-medium whitespace-nowrap text-stage outline-offset-2"
        >
          {texts.home.manifesto.action}
        </Link>
      </div>
    </aside>
  );
}
