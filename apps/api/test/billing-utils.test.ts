import { describe, expect, it } from "vitest";
import { isValidCpf } from "../src/billing/cpf";
import { encodeQr, qrCodeDataUrl } from "../src/billing/qr";
import { parseWebhookEvent } from "../src/billing/woovi";
import { FAKE_EMV, payloads } from "./billing-helpers";

describe("CPF", () => {
  it("aceita CPF com dígitos verificadores corretos", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
  });

  it("recusa dígito verificador errado, repetidos e formato errado", () => {
    for (const value of [
      "52998224724",
      "52998224715",
      "00000000000",
      "99999999999",
      "5299822472",
      "529.982.247-25",
    ]) {
      expect(isValidCpf(value)).toBe(false);
    }
  });
});

describe("QR Code", () => {
  /** Lê os 15 bits de formato da cópia junto ao canto superior esquerdo. */
  function formatBits(grid: boolean[][]): number {
    const at = (x: number, y: number): number => (grid[y]![x] ? 1 : 0);
    const bits = [0, 1, 2, 3, 4, 5].map((i) => at(8, i));
    bits.push(at(8, 7), at(8, 8), at(7, 8));
    for (let i = 9; i < 15; i++) bits.push(at(14 - i, 8));
    return bits.reduce((acc, bit, i) => acc | (bit << i), 0);
  }

  it("tem tamanho de versão válida, padrões de localização e formato do nível M", () => {
    for (const text of ["a", FAKE_EMV, "x".repeat(400)]) {
      const grid = encodeQr(text);
      const size = grid.length;
      expect((size - 17) % 4).toBe(0);
      for (const [cx, cy] of [
        [3, 3],
        [size - 4, 3],
        [3, size - 4],
      ] as const) {
        expect(grid[cy]![cx]).toBe(true); // centro escuro
        expect(grid[cy]![cx + 2]).toBe(false); // anel claro
        expect(grid[cy]![cx + 3]).toBe(true); // borda escura
      }
      for (let i = 8; i < size - 8; i++) expect(grid[6]![i]).toBe(i % 2 === 0);

      const raw = formatBits(grid) ^ 0x5412;
      let rem = raw >>> 10;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      expect(rem & 0x3ff).toBe(raw & 0x3ff); // código BCH confere
      expect(raw >>> 13).toBe(0); // nível M
    }
  });

  it("vira SVG em data: URL", () => {
    const url = qrCodeDataUrl(FAKE_EMV);
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(url.split(",")[1]!)).toContain("<svg");
  });
});

describe("tradução dos eventos da Woovi", () => {
  it("lê os eventos tratados com chaves estáveis", async () => {
    expect(await parseWebhookEvent(JSON.stringify(payloads.chargeCompleted("c1")))).toEqual({
      kind: "charge_paid",
      key: "charge_paid:c1",
      correlationId: "c1",
    });
    expect(await parseWebhookEvent(JSON.stringify(payloads.installmentCompleted("r1", 2)))).toEqual({
      kind: "installment_paid",
      key: "installment_paid:installment-r1-2",
      recurrenceId: "r1",
      installmentId: "installment-r1-2",
      installmentNumber: 2,
    });
    const first = await parseWebhookEvent(JSON.stringify(payloads.installmentTryRejected("r1", 2, 1)));
    const second = await parseWebhookEvent(JSON.stringify(payloads.installmentTryRejected("r1", 2, 2)));
    expect(first.kind).toBe("installment_failed");
    expect(second.kind).toBe("installment_failed");
    expect((first as { key: string }).key).not.toBe((second as { key: string }).key);
  });

  it("formato desconhecido ou incompleto é ignorado", async () => {
    expect(await parseWebhookEvent("não é json")).toEqual({ kind: "ignored", event: null });
    expect(await parseWebhookEvent(JSON.stringify({ event: "OPENPIX:CHARGE_COMPLETED" }))).toEqual({
      kind: "ignored",
      event: "OPENPIX:CHARGE_COMPLETED",
    });
    expect((await parseWebhookEvent(JSON.stringify({ event: "PIX_AUTOMATIC_COBR_CREATED" }))).kind).toBe(
      "ignored",
    );
  });
});
