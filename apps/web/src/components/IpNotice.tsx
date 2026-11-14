import { texts } from "../texts";
import { InfoIcon } from "./icons";

/** Visible warning shown when creating and when joining a direct room. */
export function IpNotice() {
  return (
    <aside role="note" className="flex w-full gap-3 rounded-nav bg-mist p-4 text-left text-body-sm">
      <span className="mt-0.5 shrink-0 text-muted">
        <InfoIcon />
      </span>
      <p>
        <strong className="font-semibold">{texts.ipNotice.title}.</strong> {texts.ipNotice.message}
      </p>
    </aside>
  );
}
