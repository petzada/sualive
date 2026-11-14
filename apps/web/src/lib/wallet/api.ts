/**
 * Cliente HTTP da carteira, da loja e dos presentes. Toda resposta passa pelos esquemas de
 * `@sualive/protocol`; nada chega ao resto do código sem validação.
 */
import {
  goldCheckoutResponseSchema,
  goldPaymentResponseSchema,
  ledgerResponseSchema,
  shopPurchaseResponseSchema,
  shopResponseSchema,
  walletResponseSchema,
  type BuyItemRequest,
  type EquipItemRequest,
  type GiftGoldRequest,
  type GiftPlusRequest,
  type GoldCheckoutRequest,
  type GoldCheckoutResponse,
  type GoldPaymentResponse,
  type LedgerResponse,
  type ShopPurchaseResponse,
  type ShopResponse,
  type WalletResponse,
} from "@sualive/protocol";
import { createJsonRequest, type AccountApiResult, type FetchLike } from "../account/api";

export type {
  AccountApiFailure as WalletApiFailure,
  AccountApiResult as WalletApiResult,
} from "../account/api";

export interface WalletApi {
  getWallet(): Promise<AccountApiResult<WalletResponse>>;
  /** `before` = `nextCursor` da página anterior; sem ele, a primeira página. */
  getLedger(before?: string): Promise<AccountApiResult<LedgerResponse>>;
  startGoldCheckout(body: GoldCheckoutRequest): Promise<AccountApiResult<GoldCheckoutResponse>>;
  getGoldPayment(paymentId: string, signal?: AbortSignal): Promise<AccountApiResult<GoldPaymentResponse>>;
  giftGold(body: GiftGoldRequest): Promise<AccountApiResult<WalletResponse>>;
  giftPlus(body: GiftPlusRequest): Promise<AccountApiResult<WalletResponse>>;
  getShop(): Promise<AccountApiResult<ShopResponse>>;
  buyItem(itemId: string, body: BuyItemRequest): Promise<AccountApiResult<ShopPurchaseResponse>>;
  equipItem(itemId: string, body: EquipItemRequest): Promise<AccountApiResult<ShopResponse>>;
}

export function createWalletApi(fetchImpl: FetchLike): WalletApi {
  const request = createJsonRequest(fetchImpl);
  const item = (itemId: string, action: "buy" | "equip") =>
    `/api/shop/items/${encodeURIComponent(itemId)}/${action}`;

  return {
    getWallet: () => request("/api/wallet", walletResponseSchema, { method: "GET" }),
    getLedger: (before) =>
      request(
        before === undefined
          ? "/api/wallet/ledger"
          : `/api/wallet/ledger?before=${encodeURIComponent(before)}`,
        ledgerResponseSchema,
        { method: "GET" },
      ),
    startGoldCheckout: (body) =>
      request("/api/wallet/gold/checkout", goldCheckoutResponseSchema, { method: "POST", body }),
    getGoldPayment: (paymentId, signal) =>
      request(`/api/wallet/gold/payments/${encodeURIComponent(paymentId)}`, goldPaymentResponseSchema, {
        method: "GET",
        signal,
      }),
    giftGold: (body) => request("/api/wallet/gifts/gold", walletResponseSchema, { method: "POST", body }),
    giftPlus: (body) => request("/api/wallet/gifts/plus", walletResponseSchema, { method: "POST", body }),
    getShop: () => request("/api/shop", shopResponseSchema, { method: "GET" }),
    buyItem: (itemId, body) =>
      request(item(itemId, "buy"), shopPurchaseResponseSchema, { method: "POST", body }),
    equipItem: (itemId, body) => request(item(itemId, "equip"), shopResponseSchema, { method: "POST", body }),
  };
}
