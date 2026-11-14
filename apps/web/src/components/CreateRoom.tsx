import { Button } from "@heroui/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { CreateRoomResult } from "../lib/room";
import { texts } from "../texts";
import { useAccountClient } from "./account/AccountClient";
import { PATHS } from "./account/paths";
import { CARD, OUTLINE_PILL, PRIMARY_PILL, TEXT_LINK } from "./account/styles";
import { formatProtectedRoomTime, protectedRoomMinutes } from "./format";
import { CoinIcon, Spinner } from "./icons";
import { useRoomClient } from "./room/RoomClient";
import { TurnstileField } from "./TurnstileField";
import { useTurnstileAction } from "./useTurnstileAction";
import { useLoadOnMount } from "./wallet/shared";
import { useWalletClient } from "./wallet/WalletClient";

type CreateFailure = Extract<CreateRoomResult, { ok: false }>["reason"];

const INLINE_LINK = `inline-flex min-h-11 items-center ${TEXT_LINK}`;

/** Where a failure sends the person, when there is a place that solves it. */
const FAILURE_LINKS: Partial<Record<CreateFailure, { to: string; label: string }>> = {
  insufficientFunds: { to: PATHS.wallet, label: texts.home.protectedRoom.walletLink },
};

/**
 * The gold balance as time of protected room, asked from the wallet when the panel opens. Says so
 * when the balance pays for no minute, with the way to the wallet; the server still decides.
 */
function ProtectedBalance() {
  const { state, actions } = useWalletClient().useWallet();
  useLoadOnMount(() => void actions.load());
  const copy = texts.home.protectedRoom;

  if (!state.wallet) {
    return state.status === "error" ? (
      <p role="alert" className="text-body-sm font-medium text-notice" data-testid="protected-room-balance">
        {copy.balanceFailed}
      </p>
    ) : (
      <p role="status" className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner />
        {copy.balanceLoading}
      </p>
    );
  }

  const { gold } = state.wallet;
  const covered = protectedRoomMinutes(gold) > 0;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-body-sm" data-testid="protected-room-balance">
      <span className="shrink-0 text-muted">
        <CoinIcon filled />
      </span>
      <span className={covered ? "font-medium" : "font-medium text-notice"}>
        {covered
          ? copy.balance(texts.wallet.amount(gold, "gold"), formatProtectedRoomTime(gold))
          : copy.balanceEmpty}
      </span>
      {!covered && (
        <Link to={PATHS.wallet} className={INLINE_LINK}>
          {copy.walletLink}
        </Link>
      )}
    </p>
  );
}

interface ProtectedPanelProps {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** What the protected room is, its price and the time the balance pays for, before confirming. */
function ProtectedPanel({ busy, onConfirm, onCancel }: ProtectedPanelProps) {
  const titleId = useId();
  const copy = texts.home.protectedRoom;
  return (
    <section
      aria-labelledby={titleId}
      className={`flex w-full max-w-md flex-col gap-3 text-left ${CARD}`}
      data-testid="protected-room-panel"
    >
      <h2 id={titleId} className="font-display text-title font-semibold">
        {copy.title}
      </h2>
      <p className="text-body-sm">{copy.about}</p>
      <p className="text-body-sm font-medium" data-testid="protected-room-price">
        {copy.price}
      </p>
      <ProtectedBalance />
      <p className="text-body-sm text-muted">{copy.rule}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          className={PRIMARY_PILL}
          isDisabled={busy}
          onPress={onConfirm}
          data-testid="protected-room-confirm"
        >
          {busy && <Spinner />}
          {busy ? texts.home.creating : copy.confirm}
        </Button>
        <Button variant="outline" className={OUTLINE_PILL} isDisabled={busy} onPress={onCancel}>
          {texts.common.cancel}
        </Button>
      </div>
    </section>
  );
}

interface ProtectedOptionProps {
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The way to a protected room, under the create button. Only an account with the Plus can use it;
 * an account without it sees one plain line with the way to the plan, and a visitor sees nothing.
 */
function ProtectedOption({ open, busy, onOpen, onConfirm, onCancel }: ProtectedOptionProps) {
  const { state } = useAccountClient().useAccount();
  const user = state.user;
  if (state.status === "loading" || !user?.onboarded) return null;

  if (!user.plan.plus) {
    return (
      <p
        className="flex flex-wrap items-center justify-center gap-x-1.5 text-body-sm text-muted"
        data-testid="protected-room-plus-only"
      >
        {texts.home.protectedRoom.plusOnly.text}
        <Link to={PATHS.plus} className={INLINE_LINK}>
          {texts.home.protectedRoom.plusOnly.link}
        </Link>
      </p>
    );
  }

  if (open) return <ProtectedPanel busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
  return (
    <Button
      variant="outline"
      className={OUTLINE_PILL}
      isDisabled={busy}
      onPress={onOpen}
      data-testid="protected-room-open"
    >
      {texts.home.protectedRoom.open}
    </Button>
  );
}

interface CreateRoomProps {
  /** Extra classes for the block of the button, e.g. spacing. */
  className?: string;
  /** Rendered close under the button, in the same block (the login line of the home page). */
  afterButton?: ReactNode;
  /** Rendered after the block of the button, as the next block of the caller's column. */
  below?: ReactNode;
  /** Also offers the protected room, to who can open one (the home page). */
  withProtected?: boolean;
}

/**
 * The "create room" button: passes the Turnstile check, creates the room and goes to its link.
 * Renders its pieces side by side with the caller's own, so the parent decides the spacing.
 * The common room is one click, with or without an account; the protected one is asked for apart,
 * and only created after the person sees the price and confirms.
 */
export function CreateRoom({ className = "", afterButton, below, withProtected = false }: CreateRoomProps) {
  const { createRoom } = useRoomClient();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const [protectedOpen, setProtectedOpen] = useState(false);
  /** Which room the running check was asked for. The ref is what the action reads when the token arrives. */
  const [creatingProtected, setCreatingProtected] = useState(false);
  const protectedRef = useRef(false);

  const turnstile = useTurnstileAction(async (token) => {
    let result: CreateRoomResult;
    try {
      result = protectedRef.current ? await createRoom(token, { protected: true }) : await createRoom(token);
    } catch {
      result = { ok: false, reason: "error" };
    }
    if (result.ok) {
      await navigate(ROOM_PATH_PREFIX + result.code);
    } else {
      setFailure(result.reason);
    }
  });

  const busy = turnstile.status !== "idle";
  /** The main button only tells the progress of the common room; the panel tells its own. */
  const creatingCommon = busy && !creatingProtected;
  const start = (asProtected: boolean) => {
    protectedRef.current = asProtected;
    setCreatingProtected(asProtected);
    setFailure(null);
    turnstile.trigger();
  };
  const failureLink = failure ? FAILURE_LINKS[failure] : undefined;

  return (
    <>
      {/* No gap inside: what comes after the button stays close to it. */}
      <div className={`flex flex-col items-center ${className}`}>
        <Button
          variant="primary"
          className="min-h-12 rounded-button px-7 text-body font-medium"
          isDisabled={busy}
          onPress={() => start(false)}
        >
          {creatingCommon && <Spinner />}
          {creatingCommon
            ? turnstile.status === "running"
              ? texts.home.creating
              : texts.turnstile.checking
            : texts.home.create}
        </Button>
        {afterButton}
      </div>
      {below}

      {withProtected && (
        <ProtectedOption
          open={protectedOpen}
          busy={busy}
          onOpen={() => {
            setFailure(null);
            setProtectedOpen(true);
          }}
          onConfirm={() => start(true)}
          onCancel={() => {
            setFailure(null);
            setProtectedOpen(false);
          }}
        />
      )}

      {failure && (
        <p role="alert" className="max-w-md text-body-sm font-medium text-notice">
          {texts.home.errors[failure]}
          {failureLink && (
            <>
              {" "}
              <Link to={failureLink.to} className={TEXT_LINK}>
                {failureLink.label}
              </Link>
            </>
          )}
        </p>
      )}

      <TurnstileField {...turnstile} />
    </>
  );
}
