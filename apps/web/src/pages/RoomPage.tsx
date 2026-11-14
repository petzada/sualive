import { Button, Link } from "@heroui/react";
import { FIXED_ROOM_PATH_PREFIX } from "@sualive/config";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { isHandleValid } from "../components/account/HandleField";
import { onboardingPath } from "../components/account/paths";
import { Lobby } from "../components/room/Lobby";
import { useRoomClient } from "../components/room/RoomClient";
import { RoomView } from "../components/room/RoomView";
import type { RoomPhase } from "../lib/room";
import { Spinner } from "../components/icons";
import { texts } from "../texts";
import { ErrorPage } from "./ErrorPage";

type EndPhase = Extract<RoomPhase, "ended" | "full" | "banned" | "kicked" | "error">;

/**
 * Final states. "Try again" reloads the page: the contract has no action to go back to the lobby,
 * and a fresh load asks the server for the room again.
 */
function RoomEnd({ phase }: { phase: EndPhase }) {
  const copy = texts.roomEnd[phase];
  const linkClass = "rounded-link font-normal";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-gap px-5 py-16 text-center">
      <h1 className="font-display text-heading font-semibold">{copy.title}</h1>
      <p role={phase === "error" ? "alert" : undefined}>{copy.message}</p>
      {phase === "ended" ? (
        <Link href="/" className={linkClass}>
          {texts.roomEnd.ended.action}
        </Link>
      ) : (
        <>
          {"action" in copy && (
            <Button
              variant="primary"
              className="min-h-12 rounded-button px-7 text-body font-medium"
              onPress={() => window.location.reload()}
            >
              {copy.action}
            </Button>
          )}
          <Link href="/" className={linkClass}>
            {texts.common.backHome}
          </Link>
        </>
      )}
    </main>
  );
}

function RoomSession({ code }: { code: string }) {
  const { useRoom } = useRoomClient();
  const { state, actions } = useRoom(code);
  const navigate = useNavigate();

  switch (state.phase) {
    case "loading":
      return (
        <main className="flex min-h-dvh items-center justify-center gap-3 text-muted" role="status">
          <Spinner />
          <p className="text-body-sm">{texts.room.loading}</p>
        </main>
      );
    case "lobby":
    case "joining":
      return <Lobby state={state} actions={actions} />;
    case "connected":
    case "reconnecting":
      return (
        <RoomView
          state={state}
          actions={actions}
          onLeave={() => {
            actions.leave();
            void navigate("/");
          }}
        />
      );
    default:
      return <RoomEnd phase={state.phase} />;
  }
}

/**
 * One room, whatever the phase. `code` comes from the route (or from the dev-only demo): the code
 * of a common room, or `@nome` for a fixed-link room. A logged person who has not finished the
 * first access is sent there before entering any room, with the way back.
 */
export function RoomScreen({ code }: { code: string }) {
  const { state: account } = useAccountClient().useAccount();
  const location = useLocation();

  if (account.user && !account.user.onboarded) {
    return <Navigate to={onboardingPath(location.pathname + location.search)} replace />;
  }
  return <RoomSession code={code} />;
}

/** The "@" that opens the segment of a fixed-link room. */
const FIXED_ROOM_MARK = FIXED_ROOM_PATH_PREFIX.slice(1);

/** `/@nome`: the same room page, opened by the handle of its owner. Anything else is not a page. */
export function FixedRoomPage() {
  const { slug = "" } = useParams();
  const handle = slug.startsWith(FIXED_ROOM_MARK) ? slug.slice(FIXED_ROOM_MARK.length).toLowerCase() : "";
  if (!isHandleValid(handle)) return <ErrorPage kind="notFound" />;

  const code = FIXED_ROOM_MARK + handle;
  return <RoomScreen key={code} code={code} />;
}

export function RoomPage() {
  const { code = "" } = useParams();
  // The key gives each room its own state when the code in the address changes.
  return <RoomScreen key={code} code={code} />;
}
