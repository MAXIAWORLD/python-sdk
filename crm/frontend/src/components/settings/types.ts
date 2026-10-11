/** Shapes of the `/settings` sections (see backend `services/settings.py` DEFAULTS). */

export interface CompanySettings {
  name: string;
  legal_name: string;
  legal_form: string;
  capital: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  country_code: string;
  siren: string;
  siret: string;
  rcs_city: string;
  rm: string;
  ape: string;
  vat_number: string;
  email: string;
  phone: string;
  website: string;
  logo_url: string;
  iban: string;
  bic: string;
  bank_name: string;
  vat_regime: string;
  vat_on_debits: boolean;
  mediator: string;
  insurance: string;
  einvoicing_address: string;
}

export interface BillingSettings {
  quote_prefix: string;
  invoice_prefix: string;
  credit_prefix: string;
  default_vat: number;
  payment_days: number;
  quote_validity_days: number;
  default_nature: string;
  late_penalty_rate: string;
  early_payment_discount: string;
  recovery_fee: number;
  payment_methods: string;
  quote_terms: string;
  invoice_terms: string;
  footer: string;
  auto_overdue: boolean;
  reminder_days: number[];
}

export interface BrandingSettings {
  app_name: string;
  accent: string;
  logo_url: string;
}

export interface GeneralSettings {
  public_url: string;
  timezone: string;
  locale: string;
  currency: string;
  week_start: number;
}

export interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string | null;
  smtp_password_set?: boolean;
  smtp_security: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  imap_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string | null;
  imap_password_set?: boolean;
  imap_folder: string;
  track_opens: boolean;
  bcc_self: boolean;
}

export interface AiSettings {
  require_approval: boolean;
  assistant_name: string;
  custom_instructions: string;
  effort: string;
  mask_personal_data: boolean;
  daily_briefing: boolean;
}

export interface McpSettings {
  enabled: boolean;
}

export interface RegisterEntry {
  name: string;
  purpose: string;
  legal_basis: string;
  data: string;
  people: string;
  recipients: string;
  retention: string;
  security: string;
}

export interface RgpdSettings {
  controller_name: string;
  dpo_name: string;
  dpo_email: string;
  privacy_url: string;
  prospect_retention_years: number;
  customer_retention_years: number;
  auto_anonymize: boolean;
  require_explicit_consent: boolean;
  form_notice: string;
  register: RegisterEntry[];
}

export interface EinvoicingSettings {
  enabled: boolean;
  format: string;
  profile: string;
  platform_name: string;
  platform_api_url: string;
  platform_api_key: string | null;
  platform_api_key_set?: boolean;
  auto_transmit: boolean;
}

export interface AccountingSettings {
  journal_sales: string;
  journal_bank: string;
  account_customers: string;
  account_services: string;
  account_goods: string;
  account_vat: string;
  account_bank: string;
  customer_aux_prefix: string;
}

/** Admins receive every section; other roles only the public ones (company, billing, branding, general, ai, rgpd). */
export interface AllSettings {
  company: CompanySettings;
  billing: BillingSettings;
  branding: BrandingSettings;
  general: GeneralSettings;
  ai: AiSettings;
  rgpd: RgpdSettings;
  email?: EmailSettings;
  mcp?: McpSettings;
  einvoicing?: EinvoicingSettings;
  accounting?: AccountingSettings;
}

export type SectionName = keyof AllSettings;
export type SectionValues<S extends SectionName> = NonNullable<AllSettings[S]>;

/** Keys of T whose values are of type V (used to type form helpers). */
export type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];
