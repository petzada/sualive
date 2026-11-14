import { ROOM_MAX_PEOPLE, VIDEOS_PER_PERSON, WATCHED_VIDEOS_PER_PERSON } from "@sualive/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, createRoom, join, mockOutboundFetch, type Guest, type TestClient } from "./helpers";

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Person = { guest: Guest; client: TestClient; id: string };

async function roomWith(count: number) {
  const { code, ownerToken } = await createRoom();
  const people: Person[] = [];
  for (let i = 0; i < count; i++) {
    const guest = await join(code, `Pessoa ${i + 1}`);
    const { client } = await connect(code, guest, i === 0 ? ownerToken : undefined);
    people.push({ guest, client, id: guest.participantId });
  }
  return { code, people };
}

async function startVideo(person: Person, requestId = "v") {
  person.client.send({ type: "video.request", requestId, kind: "camera" });
  return (await person.client.next("video.granted")).video.id;
}

describe("vídeo sob demanda", () => {
  it("o welcome traz o limite de assistidos e, sem Plus, sem vídeo em retransmissão", async () => {
    const { code } = await createRoom();
    const { welcome } = await connect(code, await join(code, "Ana"));
    expect(welcome.limits).toMatchObject({ watchedVideos: WATCHED_VIDEOS_PER_PERSON, relayVideo: false });
    expect(welcome.room).toMatchObject({ protected: false, capacity: ROOM_MAX_PEOPLE, maxVideos: null });
  });

  it("vídeo autorizado é só anúncio: ninguém recebe até pedir; video.viewers acompanha cada mudança", async () => {
    const { people } = await roomWith(3);
    const [a, b, c] = people as [Person, Person, Person];
    const videoId = await startVideo(a);
    // Anunciado na lista de pessoas, sem ninguém assistindo.
    expect((await b.client.next("participant.updated")).participant.videos.map((v) => v.id)).toEqual([
      videoId,
    ]);
    await a.client.expectNone("video.viewers");

    b.client.send({ type: "video.watch", videoId });
    expect(await b.client.next("video.watch.state")).toEqual({
      type: "video.watch.state",
      videoId,
      state: "watching",
    });
    expect(await a.client.next("video.viewers")).toEqual({
      type: "video.viewers",
      videoId,
      viewers: [b.id],
      blocked: [],
    });

    c.client.send({ type: "video.watch", videoId });
    expect((await c.client.next("video.watch.state")).state).toBe("watching");
    expect((await a.client.next("video.viewers")).viewers.sort()).toEqual([b.id, c.id].sort());

    // Pedir de novo só repete a situação.
    b.client.send({ type: "video.watch", videoId });
    expect((await b.client.next("video.watch.state")).state).toBe("watching");
    await a.client.expectNone("video.viewers");

    b.client.send({ type: "video.unwatch", videoId });
    expect(await b.client.next("video.watch.state")).toEqual({
      type: "video.watch.state",
      videoId,
      state: "stopped",
    });
    expect((await a.client.next("video.viewers")).viewers).toEqual([c.id]);
  });

  it("ninguém assiste o próprio vídeo nem vídeo inexistente", async () => {
    const { people } = await roomWith(2);
    const [a] = people as [Person];
    const videoId = await startVideo(a);
    a.client.send({ type: "video.watch", videoId });
    expect(await a.client.next("video.watch.state")).toMatchObject({ state: "denied", reason: "not_found" });
    a.client.send({ type: "video.watch", videoId: "nao-existe" });
    expect(await a.client.next("video.watch.state")).toMatchObject({ state: "denied", reason: "not_found" });
  });

  it(`o ${WATCHED_VIDEOS_PER_PERSON + 1}º vídeo assistido pela mesma pessoa é recusado; parar libera`, async () => {
    const { people } = await roomWith(4);
    const [viewer, ...streamers] = people as [Person, Person, Person, Person];
    const videos: string[] = [];
    for (const streamer of streamers) {
      for (let i = 0; i < VIDEOS_PER_PERSON && videos.length < WATCHED_VIDEOS_PER_PERSON + 1; i++) {
        videos.push(await startVideo(streamer, `v${i}`));
      }
    }
    expect(videos).toHaveLength(WATCHED_VIDEOS_PER_PERSON + 1);
    for (const videoId of videos.slice(0, WATCHED_VIDEOS_PER_PERSON)) {
      viewer.client.send({ type: "video.watch", videoId });
      expect((await viewer.client.next("video.watch.state")).state).toBe("watching");
    }
    const extra = videos.at(-1)!;
    viewer.client.send({ type: "video.watch", videoId: extra });
    expect(await viewer.client.next("video.watch.state")).toEqual({
      type: "video.watch.state",
      videoId: extra,
      state: "denied",
      reason: "watch_limit",
    });

    viewer.client.send({ type: "video.unwatch", videoId: videos[0]! });
    expect((await viewer.client.next("video.watch.state")).state).toBe("stopped");
    viewer.client.send({ type: "video.watch", videoId: extra });
    expect(await viewer.client.next("video.watch.state")).toMatchObject({
      videoId: extra,
      state: "watching",
    });
  });

  it("o vídeo que acaba para quem assistia; quem transmite sai e quem assistia para", async () => {
    const { people } = await roomWith(3);
    const [a, b, c] = people as [Person, Person, Person];
    const first = await startVideo(a, "v1");
    const second = await startVideo(c, "v2");
    b.client.send({ type: "video.watch", videoId: first });
    await b.client.next("video.watch.state");
    b.client.send({ type: "video.watch", videoId: second });
    await b.client.next("video.watch.state");
    await a.client.next("video.viewers");
    await c.client.next("video.viewers");

    a.client.send({ type: "video.stop", videoId: first });
    expect(await b.client.next("video.watch.state")).toEqual({
      type: "video.watch.state",
      videoId: first,
      state: "stopped",
    });

    c.client.close();
    expect(await b.client.next("video.watch.state")).toMatchObject({ videoId: second, state: "stopped" });

    // A vaga voltou: assiste outro vídeo.
    const third = await startVideo(a, "v3");
    b.client.send({ type: "video.watch", videoId: third });
    expect((await b.client.next("video.watch.state")).state).toBe("watching");
  });

  it("quem assiste sai: quem transmite recebe a lista nova", async () => {
    const { people } = await roomWith(3);
    const [a, b, c] = people as [Person, Person, Person];
    const videoId = await startVideo(a);
    for (const viewer of [b, c]) {
      viewer.client.send({ type: "video.watch", videoId });
      await viewer.client.next("video.watch.state");
      await a.client.next("video.viewers");
    }
    b.client.close();
    expect(await a.client.next("video.viewers")).toEqual({
      type: "video.viewers",
      videoId,
      viewers: [c.id],
      blocked: [],
    });
  });

  it("o que a pessoa assiste zera quando a conexão cai; ela pede de novo depois do welcome", async () => {
    const { code, people } = await roomWith(2);
    const [a, b] = people as [Person, Person];
    const videoId = await startVideo(a);
    b.client.send({ type: "video.watch", videoId });
    await b.client.next("video.watch.state");
    await a.client.next("video.viewers");

    // Outra aba: a conexão antiga sai e a lista de quem transmite esvazia.
    const { client: again } = await connect(code, b.guest);
    expect((await a.client.next("video.viewers")).viewers).toEqual([]);
    again.send({ type: "video.watch", videoId });
    expect((await again.next("video.watch.state")).state).toBe("watching");
    expect((await a.client.next("video.viewers")).viewers).toEqual([b.id]);
  });
});
