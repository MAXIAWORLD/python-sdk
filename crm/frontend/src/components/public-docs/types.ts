import type { PublicBranding } from "@/components/layout/PublicLayout";
import type { Invoice, LineItem, Party, Quote } from "@/lib/types";

/** Issuer identity frozen on the document (services/invoicing.py › seller_snapshot). */
export type SellerParty = Party & {
  rm?: string;
  ape?: string;
  website?: string;
  bank_name?: string;
  vat_regime?: string;
  mediator?: string;
  insurance?: string;
  logo_url?: string;
};

/** Client identity frozen on the document (services/invoicing.py › buyer_snapshot). */
export type BuyerParty = Party & { type?: "company" | "person"; is_public_entity?: boolean };

export interface VatRow {
  rate: number;
  base: number;
  amount: number;
}

/** Fields added by `api/public.py › _doc_payload` on top of the stored document. */
interface PublicExtras {
  seller: SellerParty;
  buyer: BuyerParty;
  lines: LineItem[];
  vat_breakdown: VatRow[];
  lines_total: number;
  discount_amount: number;
  branding: PublicBranding;
  vat_mention?: string | null;
}

export type PublicQuoteDoc = Omit<Quote, "public_token" | "seller" | "buyer" | "lines"> & PublicExtras;
export type PublicInvoiceDoc = Omit<Invoice, "public_token" | "seller" | "buyer" | "lines" | "hash"> & PublicExtras;

export interface AcceptResult {
  ok: boolean;
  accepted_at: string;
  signature_hash: string;
}
