/** Token secreto do dono, guardado no navegador por código de sala. */
import type { StorageLike } from "./deps";

const KEY_PREFIX = "sualive:owner-token:";
/** Mesmos limites do `hello` em `@sualive/protocol`. */
const TOKEN_MIN_LENGTH = 32;
const TOKEN_MAX_LENGTH = 128;

function key(code: string): string {
  return KEY_PREFIX + code;
}

export function saveOwnerToken(storage: StorageLike | null, code: string, token: string): void {
  try {
    storage?.setItem(key(code), token);
  } catch {
    // armazenamento cheio ou bloqueado: a pessoa entra sem o papel de dono
  }
}

export function readOwnerToken(storage: StorageLike | null, code: string): string | undefined {
  try {
    const token = storage?.getItem(key(code));
    if (!token || token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) return undefined;
    return token;
  } catch {
    return undefined;
  }
}

/** A sala acabou: o código nunca é reaproveitado, o token não serve mais. */
export function forgetOwnerToken(storage: StorageLike | null, code: string): void {
  try {
    storage?.removeItem(key(code));
  } catch {
    // nada a fazer
  }
}
