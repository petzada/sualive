import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@sualive/config";

const encoder = new TextEncoder();

/** Bytes em base64url, sem preenchimento. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `size` bytes aleatórios fortes em base64url. */
export function randomToken(size: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

/**
 * Código da sala: ROOM_CODE_LENGTH caracteres de ROOM_CODE_ALPHABET, sem viés de módulo (descarta
 * os bytes acima do maior múltiplo do tamanho do alfabeto).
 */
export function generateRoomCode(): string {
  const size = ROOM_CODE_ALPHABET.length;
  const ceiling = 256 - (256 % size);
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))) {
      if (byte >= ceiling) continue;
      code += ROOM_CODE_ALPHABET[byte % size];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

/** SHA-256 do texto, em base64url. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toBase64Url(new Uint8Array(digest));
}

/** Comparação em tempo constante de dois textos. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}
