import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { sessions, users } from "../src/db/schema";
import { useD1 } from "./d1";

useD1();

describe("D1 nos testes", () => {
  it("tem as migrations aplicadas e apaga sessões em cascata com a conta", async () => {
    const db = createDb((env as unknown as { DB: D1Database }).DB);
    await db.insert(users).values({ id: "u1", nickname: "Ana", createdAt: 1 });
    await db.insert(sessions).values({ id: "s1", userId: "u1", createdAt: 1, expiresAt: 2 });
    expect((await db.select().from(users)).map((user) => user.roomTheme)).toEqual(["default"]);
    await db.delete(users);
    expect(await db.select().from(sessions)).toEqual([]);
  });
});
