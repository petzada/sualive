import type { Badge } from "@sualive/protocol";
import { texts } from "../../texts";
import { PlusBadgeIcon, SupporterBadgeIcon } from "../icons";

const ICONS: Record<Badge, () => React.JSX.Element> = {
  plus: PlusBadgeIcon,
  early_supporter: SupporterBadgeIcon,
};

/** Token color of each badge on a regular surface. The shape differs too: color is never the only sign. */
const TONES: Record<Badge, string> = {
  plus: "text-accent",
  early_supporter: "text-notice",
};

interface BadgesProps {
  badges: readonly Badge[];
  /** `inherit`: over the video stage, where the badge follows the label color. */
  tone?: "color" | "inherit";
  /** Shows the name beside the glyph (profile). */
  withNames?: boolean;
}

/** Account badges beside a name. Each one has an accessible name and a native hint. */
export function Badges({ badges, tone = "color", withNames = false }: BadgesProps) {
  if (badges.length === 0) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 self-center" data-testid="badges">
      {badges.map((badge) => {
        const Glyph = ICONS[badge];
        const copy = texts.badges[badge];
        const color = tone === "color" ? TONES[badge] : "";
        return withNames ? (
          <span
            key={badge}
            title={copy.hint}
            className="inline-flex items-center gap-1.5 rounded-button bg-mist px-2.5 py-1 text-compact font-medium"
          >
            <span className={`inline-flex ${color}`}>
              <Glyph />
            </span>
            {copy.name}
          </span>
        ) : (
          <span
            key={badge}
            role="img"
            aria-label={copy.name}
            title={copy.hint}
            className={`inline-flex ${color}`}
          >
            <Glyph />
          </span>
        );
      })}
    </span>
  );
}
