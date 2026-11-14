/** Dublês do navegador para os testes do cliente da sala. */
import type {
  DevicePreview,
  LocalVideo,
  MediaSession,
  MediaSessionEvents,
  MediaSessionOptions,
  VideoKind,
} from "@sualive/media";
import type { ClientMessage, MeUser, Participant, ServerMessage } from "@sualive/protocol";
import { vi, type Mock } from "vitest";
import type { AccountSource, RoomDeps, SocketHandlers, SocketLike, StorageLike } from "../deps";

export const CODE = "abcdefghij";
export const ORIGIN = "https://sualive.test";
export const OWNER_TOKEN = "t".repeat(40);

// ---------- WebSocket ----------

export class FakeSocket implements SocketLike {
  readonly sent: ClientMessage[] = [];
  readonly raw: string[] = [];
  open = false;
  closedByClient = false;

  constructor(
    readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  isOpen(): boolean {
    return this.open && !this.closedByClient;
  }

  send(data: string): void {
    this.raw.push(data);
    const parsed = JSON.parse(data) as ClientMessage;
    this.sent.push(parsed);
  }

  close(): void {
    this.closedByClient = true;
    this.open = false;
  }

  // Lado do servidor
  accept(): void {
    this.open = true;
    this.handlers.onOpen();
  }

  receive(message: ServerMessage): void {
    this.handlers.onMessage(JSON.stringify(message));
  }

  receiveRaw(data: unknown): void {
    this.handlers.onMessage(data);
  }

  serverClose(code: number): void {
    this.open = false;
    this.handlers.onClose(code);
  }

  sentOfType<T extends ClientMessage["type"]>(type: T): Extract<ClientMessage, { type: T }>[] {
    return this.sent.filter((m): m is Extract<ClientMessage, { type: T }> => m.type === type);
  }
}

// ---------- Mídia ----------

export function fakeStream(id = "stream"): MediaStream {
  return { id } as unknown as MediaStream;
}

export class FakeMedia implements MediaSession {
  readonly handlers = new Map<keyof MediaSessionEvents, Set<(...args: never[]) => void>>();
  peers: string[] = [];
  micMuted = true;
  micOn = false;
  closed = false;
  readonly published = new Map<string, VideoKind>();

  setPeers = vi.fn((ids: string[]) => {
    this.peers = ids;
  });
  enableMicrophone = vi.fn(async () => {
    this.micOn = true;
  });
  setMicrophoneMuted = vi.fn((muted: boolean) => {
    this.micMuted = muted;
  });
  publishVideo = vi.fn(async (videoId: string, kind: VideoKind): Promise<LocalVideo> => {
    this.published.set(videoId, kind);
    return { videoId, kind, stream: fakeStream(`local-${videoId}`) };
  });
  unpublishVideo = vi.fn((videoId: string) => {
    this.published.delete(videoId);
  });
  reconnect = vi.fn();
  close = vi.fn(() => {
    this.closed = true;
  });

  constructor(readonly options: MediaSessionOptions) {}

  isMicrophoneMuted(): boolean {
    return !this.micOn || this.micMuted;
  }
  getPeers() {
    return [];
  }
  getRemoteVideos() {
    return [];
  }
  getLocalVideos() {
    return [];
  }

  on<E extends keyof MediaSessionEvents>(event: E, handler: MediaSessionEvents[E]): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const fn = handler as unknown as (...args: never[]) => void;
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<E extends keyof MediaSessionEvents>(event: E, ...args: Parameters<MediaSessionEvents[E]>): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as unknown as (...a: Parameters<MediaSessionEvents[E]>) => void)(...args);
    }
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }
}

export type FakePreview = DevicePreview & { stop: Mock<() => void> };

export function fakePreview(hasMicrophone = true): FakePreview {
  return {
    cameraStream: null,
    hasMicrophone,
    onMicrophoneLevel: () => () => undefined,
    stop: vi.fn<() => void>(),
  };
}

// ---------- HTTP ----------

export interface FakeReply {
  status: number;
  body: unknown;
}

type Route = (init: RequestInit | undefined) => FakeReply | Promise<FakeReply>;

export class FakeServer {
  readonly calls: Array<{ method: string; path: string; body: unknown; init?: RequestInit }> = [];
  readonly routes = new Map<string, Route>();

  constructor() {
    this.room({ status: "open", participants: 1, capacity: 6, fixed: false });
    this.joinOk("me");
    this.on("GET", `/api/rooms/${CODE}/ice`, () => ({
      status: 200,
      body: { iceServers: [{ urls: "stun:stun.test" }], ttlSeconds: 60 },
    }));
  }

  on(method: string, path: string, route: Route): void {
    this.routes.set(`${method} ${path}`, route);
  }

  room(body: unknown): void {
    this.on("GET", `/api/rooms/${CODE}`, () => ({ status: 200, body }));
  }

  joinOk(participantId: string): void {
    this.on("POST", `/api/rooms/${CODE}/join`, () => ({
      status: 200,
      body: { participantId, nickname: "Ana" },
    }));
  }

  joinError(status: number, error: string): void {
    this.on("POST", `/api/rooms/${CODE}/join`, () => ({ status, body: { error } }));
  }

  callsTo(method: string, path: string) {
    return this.calls.filter((c) => c.method === method && c.path === path);
  }

  readonly fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    this.calls.push({ method, path: input, body, init });
    const route = this.routes.get(`${method} ${input}`);
    const reply = route ? await route(init) : { status: 404, body: { error: "not_found" } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  };
}

// ---------- Armazenamento ----------

export class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// ---------- Conta ----------

/** Conta logada, com primeiro acesso concluído e sem Plus, salvo o que `overrides` trocar. */
export function meUser(overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: "u1",
    handle: "ana",
    nickname: "Ana Perfil",
    avatarUrl: "https://cdn.test/ana.png",
    onboarded: true,
    badges: [],
    plan: { status: "none", plus: false, cycle: null, periodEnd: null, renews: false },
    roomTheme: "default",
    handleChangeAvailableAt: null,
    ...overrides,
  };
}

export const PLUS_PLAN: MeUser["plan"] = {
  status: "active",
  plus: true,
  cycle: "monthly",
  periodEnd: 2_000_000_000_000,
  renews: true,
};

/** Fonte da conta: começa anônima; `set` troca a conta e avisa quem assina. */
export class FakeAccount implements AccountSource {
  user: MeUser | null = null;
  readonly listeners = new Set<() => void>();
  readonly current = vi.fn(async () => this.user);
  readonly refresh = vi.fn(async () => undefined);

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(user: MeUser | null): void {
    this.user = user;
    for (const listener of [...this.listeners]) listener();
  }
}

// ---------- Conjunto ----------

export interface Harness {
  deps: RoomDeps;
  account: FakeAccount;
  server: FakeServer;
  sockets: FakeSocket[];
  medias: FakeMedia[];
  previews: FakePreview[];
  storage: MemoryStorage;
  reports: Array<{ message: string; extra?: Record<string, string | number> }>;
  resumeHandlers: Set<() => void>;
  clipboard: string[];
  readonly socket: FakeSocket;
  readonly media: FakeMedia;
}

export function createHarness(): Harness {
  const server = new FakeServer();
  const sockets: FakeSocket[] = [];
  const medias: FakeMedia[] = [];
  const previews: FakePreview[] = [];
  const storage = new MemoryStorage();
  const reports: Harness["reports"] = [];
  const resumeHandlers = new Set<() => void>();
  const clipboard: string[] = [];
  const account = new FakeAccount();
  let ids = 0;

  const deps: RoomDeps = {
    fetch: server.fetch,
    account,
    createSocket: (url, handlers) => {
      const socket = new FakeSocket(url, handlers);
      sockets.push(socket);
      return socket;
    },
    createMediaSession: (options) => {
      const media = new FakeMedia(options);
      medias.push(media);
      return media;
    },
    createDevicePreview: async () => {
      const preview = fakePreview();
      previews.push(preview);
      return preview;
    },
    getMediaCapabilities: () => ({ canShareScreen: true, canUseCamera: true }),
    storage,
    writeClipboard: async (text) => {
      clipboard.push(text);
    },
    origin: ORIGIN,
    onResume: (handler) => {
      resumeHandlers.add(handler);
      return () => resumeHandlers.delete(handler);
    },
    randomId: () => `id-${++ids}`,
    report: (message, extra) => reports.push({ message, extra }),
  };

  return {
    deps,
    account,
    server,
    sockets,
    medias,
    previews,
    storage,
    reports,
    resumeHandlers,
    clipboard,
    get socket() {
      const socket = sockets.at(-1);
      if (!socket) throw new Error("no socket");
      return socket;
    },
    get media() {
      const media = medias.at(-1);
      if (!media) throw new Error("no media");
      return media;
    },
  };
}

export function participant(id: string, overrides: Partial<Participant> = {}): Participant {
  return {
    id,
    nickname: `Pessoa ${id}`,
    isOwner: false,
    micMuted: true,
    handRaised: false,
    videos: [],
    joinedAt: 1,
    handle: null,
    avatarUrl: null,
    badges: [],
    ...overrides,
  };
}

/** Campos do `welcome` que valem para a sala e para a própria pessoa, com os valores padrão. */
export const welcomeDefaults = {
  room: { theme: "default", fixed: false, ownerHandle: null },
  limits: { videosPerPerson: 1 },
} as const;
