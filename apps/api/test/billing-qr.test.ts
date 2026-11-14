import { describe, expect, it } from "vitest";
import { encodeQr, QR_LEVEL_M_TABLES } from "../src/billing/qr";

/**
 * Leitor de QR Code escrito à parte do gerador (só as tabelas de blocos são compartilhadas): acha o
 * formato, desfaz a máscara, lê os módulos em zigue-zague, separa os blocos, confere o Reed-Solomon
 * (síndromes zeradas) e decodifica o modo byte. Se o gerador errar posição, máscara, intercalação
 * ou correção de erro, a leitura falha.
 */

// Campo de Galois GF(256) com o polinômio da norma (0x11D).
const EXP: number[] = [];
const LOG: number[] = new Array<number>(256).fill(0);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[(LOG[a]! + LOG[b]!) % 255]!);

/** Centros dos padrões de alinhamento (tabela do anexo E da norma), para as versões testadas. */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  12: [6, 32, 58],
  21: [6, 28, 50, 72, 94],
  39: [6, 26, 54, 82, 110, 138, 166],
};

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function decode(grid: boolean[][]): string {
  const size = grid.length;
  const version = (size - 17) / 4;

  // Formato: 15 bits na cópia do canto superior esquerdo (bit 14 primeiro).
  const formatPositions: [number, number][] = [
    [0, 8],
    [1, 8],
    [2, 8],
    [3, 8],
    [4, 8],
    [5, 8],
    [7, 8],
    [8, 8],
    [8, 7],
    [8, 5],
    [8, 4],
    [8, 3],
    [8, 2],
    [8, 1],
    [8, 0],
  ];
  let format = 0;
  for (const [x, y] of formatPositions) format = (format << 1) | (grid[y]![x] ? 1 : 0);
  format ^= 0x5412;
  expect(format >>> 13, "nível de correção").toBe(0); // M
  const mask = (format >>> 10) & 7;

  // Mapa de módulos de função, montado de forma independente.
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserve = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) reserved[y]![x] = true;
  };
  reserve(0, 0, 9, 9);
  reserve(size - 8, 0, 8, 9);
  reserve(0, size - 8, 9, 8);
  reserve(6, 0, 1, size);
  reserve(0, 6, size, 1);
  const centers = ALIGNMENT[version]!;
  const last = centers.length - 1;
  centers.forEach((cx, i) =>
    centers.forEach((cy, j) => {
      // Os três cantos coincidem com os padrões de localização.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      reserve(cx - 2, cy - 2, 5, 5);
    }),
  );
  if (version >= 7) {
    reserve(size - 11, 0, 3, 6);
    reserve(0, size - 11, 6, 3);
  }

  // Leitura em zigue-zague, de baixo para cima a partir da coluna da direita.
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (reserved[y]![x]) continue;
        bits.push(grid[y]![x] !== MASKS[mask]!(x, y) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }

  // Separa os blocos (os curtos primeiro) e confere cada um pelo Reed-Solomon.
  const numBlocks = QR_LEVEL_M_TABLES.ERROR_CORRECTION_BLOCKS[version]!;
  const eccLength = QR_LEVEL_M_TABLES.ECC_CODEWORDS_PER_BLOCK[version]!;
  const total = codewords.length;
  const shortData = Math.floor(total / numBlocks) - eccLength;
  const longBlocks = total % numBlocks;
  const dataLengths = Array.from(
    { length: numBlocks },
    (_, i) => shortData + (i >= numBlocks - longBlocks ? 1 : 0),
  );
  const blocks = dataLengths.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < shortData + 1; i++) {
    for (let b = 0; b < numBlocks; b++) if (i < dataLengths[b]!) blocks[b]!.push(codewords[k++]!);
  }
  for (let i = 0; i < eccLength; i++) for (let b = 0; b < numBlocks; b++) blocks[b]!.push(codewords[k++]!);
  expect(k).toBe(total);
  for (const block of blocks) {
    for (let root = 0; root < eccLength; root++) {
      let value = 0;
      for (const coef of block) value = gfMul(value, EXP[root]!) ^ coef;
      expect(value, "síndrome do Reed-Solomon").toBe(0);
    }
  }

  // Dados: modo byte, contador e bytes.
  const data = blocks.flatMap((block, b) => block.slice(0, dataLengths[b]));
  const stream = data.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (byte >>> i) & 1));
  let pos = 0;
  const read = (length: number) => {
    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 1) | stream[pos++]!;
    return value;
  };
  expect(read(4), "modo byte").toBe(0b0100);
  const count = read(version <= 9 ? 8 : 16);
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) bytes[i] = read(8);
  return new TextDecoder().decode(bytes);
}

const EMV =
  "00020101021226870014br.gov.bcb.pix2565qr-h.woovi.digital/qr/v2/cob/464bf2d4-3b4b-4633-a9fc-c4b492f76e03" +
  "5204000053039865802BR5911Pedro Woovi6007VITORIA62070503***80870014br.gov.bcb.pix2565qr-h.woovi.digital" +
  "/qr/v2/rec/a8493991-b364-4821-acea-f548ee239f416304E887";

describe("QR Code: leitura independente", () => {
  it.each([
    ["versão 1", "a", 1],
    ["versão 2", "https://sualive.test/plus", 2],
    ["Pix copia e cola do Pix Automático", EMV, 12],
    ["texto longo (vários blocos)", `${"x".repeat(700)}fim`, 21],
    ["UTF-8 perto do limite", "ação ".repeat(300), 39],
  ])("%s", (_name, text, version) => {
    const grid = encodeQr(text);
    expect((grid.length - 17) / 4).toBe(version);
    expect(decode(grid)).toBe(text);
  });
});
