/** Entity shapes returned by the API (dates are ISO strings; FK expansions are `Ref`). */

export interface Ref {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

interface Base {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface User extends Base {
  email: string;
  name: string;
  role: "admin" | "manager" | "member" | "viewer";
  title?: string | null;
  phone?: string | null;
  color: string;
  avatar_url?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  signature?: string | null;
  hourly_cost?: number | null;
  preferences: Record<string, unknown>;
}

export interface Company extends Base {
  name: string;
  type: string;
  status: string;
  industry?: string | null;
  size?: string | null;
  employees?: number | null;
  annual_revenue?: number | null;
  website?: string | null;
  domain?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  legal_form?: string | null;
  delivery_address?: string | null;
  is_public_entity?: boolean;
  linkedin?: string | null;
  twitter?: string | null;
  description?: string | null;
  logo_url?: string | null;
  source?: string | null;
  health_score: number;
  wallet_address?: string | null;
  chain?: string | null;
  owner_id?: number | null;
  owner?: Ref | null;
  tags: string[];
  custom: Record<string, unknown>;
  last_activity_at?: string | null;
}

export interface Contact extends Base {
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  job_title?: string | null;
  department?: string | null;
  company_id?: number | null;
  company?: Ref | null;
  lifecycle: string;
  lead_score: number;
  source?: string | null;
  owner_id?: number | null;
  owner?: Ref | null;
  linkedin?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  wallet_address?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  language?: string | null;
  birthday?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  tags: string[];
  custom: Record<string, unknown>;
  consent_marketing: boolean;
  consent_at?: string | null;
  consent_source?: string | null;
  unsubscribed_at?: string | null;
  do_not_contact: boolean;
  do_not_call: boolean;
  anonymized_at?: string | null;
  last_contacted_at?: string | null;
}

export interface Activity extends Base {
  type: string;
  subject?: string | null;
  body?: string | null;
  contact_id?: number | null;
  company_id?: number | null;
  deal_id?: number | null;
  ticket_id?: number | null;
  project_id?: number | null;
  user_id?: number | null;
  user?: Ref | null;
  contact?: Ref | null;
  company?: Ref | null;
  deal?: Ref | null;
  occurred_at: string;
  duration_minutes?: number | null;
  outcome?: string | null;
  direction?: string | null;
  pinned: boolean;
  meta: Record<string, unknown>;
}

export interface Pipeline extends Base {
  name: string;
  kind: string;
  position: number;
  is_default: boolean;
  color: string;
}

export interface Stage extends Base {
  pipeline_id: number;
  name: string;
  position: number;
  probability: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  rotting_days?: number | null;
}

export interface LineItem {
  id?: string;
  type?: "item" | "section" | "text";
  product_id?: number | null;
  description: string;
  details?: string | null;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  vat_rate?: number;
  discount?: number;
  total?: number;
}

export interface Deal extends Base {
  title: string;
  pipeline_id: number;
  stage_id: number;
  stage?: Ref & { color?: string; probability?: number; is_won?: boolean; is_lost?: boolean };
  pipeline?: Ref | null;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  owner_id?: number | null;
  owner?: Ref | null;
  amount: number;
  mrr: number;
  value: number;
  currency: string;
  probability?: number | null;
  status: "open" | "won" | "lost";
  expected_close_date?: string | null;
  closed_at?: string | null;
  lost_reason?: string | null;
  source?: string | null;
  priority: string;
  next_step?: string | null;
  next_step_date?: string | null;
  description?: string | null;
  position: number;
  stage_changed_at: string;
  products: LineItem[];
  tags: string[];
  ai_score?: number | null;
  ai_insight?: string | null;
  days_in_stage?: number;
}

export interface Product extends Base {
  name: string;
  sku?: string | null;
  kind: string;
  category?: string | null;
  description?: string | null;
  unit_price: number;
  unit: string;
  vat_rate: number;
  recurring_interval?: string | null;
  cost?: number | null;
  active: boolean;
}

export interface Party {
  name?: string;
  trade_name?: string;
  legal_form?: string;
  capital?: string;
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  country_code?: string;
  siren?: string;
  siret?: string;
  vat_number?: string;
  email?: string;
  phone?: string;
  iban?: string;
  bic?: string;
  rcs_city?: string;
  contact_name?: string;
  delivery_address?: string;
  [key: string]: unknown;
}

export interface Quote extends Base {
  number: string;
  title?: string | null;
  status: string;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  deal_id?: number | null;
  deal?: Ref | null;
  owner_id?: number | null;
  owner?: Ref | null;
  issue_date: string;
  valid_until?: string | null;
  currency: string;
  lines: LineItem[];
  discount: number;
  subtotal: number;
  tax_total: number;
  total: number;
  deposit_percent?: number | null;
  notes?: string | null;
  terms?: string | null;
  public_token: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  signed_by?: string | null;
  signer_email?: string | null;
  signature?: string | null;
  signature_hash?: string | null;
  nature: string;
  seller: Party;
  buyer: Party;
  invoice_id?: number | null;
}

export interface Invoice extends Base {
  number: string;
  kind: "invoice" | "credit_note" | "deposit";
  title?: string | null;
  status: string;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  deal_id?: number | null;
  quote_id?: number | null;
  quote?: Ref | null;
  project_id?: number | null;
  project?: Ref | null;
  subscription_id?: number | null;
  owner_id?: number | null;
  owner?: Ref | null;
  issue_date: string;
  due_date?: string | null;
  currency: string;
  lines: LineItem[];
  discount: number;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  credited_amount: number;
  balance_due: number;
  payment_terms?: string | null;
  notes?: string | null;
  terms?: string | null;
  public_token: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  paid_at?: string | null;
  reminders_sent: number;
  last_reminder_at?: string | null;
  sequence?: number | null;
  issued_at?: string | null;
  locked: boolean;
  nature: string;
  service_date?: string | null;
  service_period_end?: string | null;
  vat_mention?: string | null;
  vat_on_debits: boolean;
  late_penalty_rate?: string | null;
  early_payment_discount?: string | null;
  recovery_fee: number;
  seller: Party;
  buyer: Party;
  credit_for_id?: number | null;
  credit_for?: Ref | null;
  cancelled_by_id?: number | null;
  hash?: string | null;
  einvoice_format?: string | null;
  einvoice_status?: string | null;
  warnings?: string[];
}

export interface Payment extends Base {
  invoice_id: number;
  amount: number;
  date: string;
  method: string;
  reference?: string | null;
  chain?: string | null;
  tx_hash?: string | null;
  notes?: string | null;
}

export interface Subscription extends Base {
  company_id: number;
  company?: Ref | null;
  contact_id?: number | null;
  product_id?: number | null;
  product?: Ref | null;
  deal_id?: number | null;
  owner_id?: number | null;
  owner?: Ref | null;
  plan: string;
  status: string;
  amount: number;
  quantity: number;
  interval: string;
  discount: number;
  currency: string;
  start_date: string;
  trial_end?: string | null;
  current_period_end?: string | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  auto_invoice: boolean;
  vat_rate: number;
  notes?: string | null;
  mrr: number;
}

export interface Project extends Base {
  name: string;
  code?: string | null;
  status: string;
  health: string;
  company_id?: number | null;
  company?: Ref | null;
  deal_id?: number | null;
  owner_id?: number | null;
  owner?: Ref | null;
  start_date?: string | null;
  due_date?: string | null;
  billing_mode: string;
  budget_amount: number;
  budget_hours: number;
  hourly_rate: number;
  progress: number;
  color: string;
  description?: string | null;
  tags: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task extends Base {
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  type: string;
  due_date?: string | null;
  due_time?: string | null;
  assignee_id?: number | null;
  assignee?: Ref | null;
  created_by_id?: number | null;
  project_id?: number | null;
  project?: Ref | null;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  deal_id?: number | null;
  deal?: Ref | null;
  ticket_id?: number | null;
  position: number;
  completed_at?: string | null;
  estimate_hours?: number | null;
  checklist: ChecklistItem[];
  tags: string[];
}

export interface TimeEntry extends Base {
  user_id: number;
  user?: Ref | null;
  project_id?: number | null;
  project?: Ref | null;
  task_id?: number | null;
  task?: Ref | null;
  company_id?: number | null;
  date: string;
  minutes: number;
  description?: string | null;
  billable: boolean;
  hourly_rate?: number | null;
  invoice_id?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface CalendarEvent extends Base {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string | null;
  meeting_url?: string | null;
  type: string;
  status: string;
  color?: string | null;
  user_id?: number | null;
  user?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  company_id?: number | null;
  company?: Ref | null;
  deal_id?: number | null;
  project_id?: number | null;
  attendees: { name?: string; email?: string }[];
  reminder_minutes?: number | null;
}

export interface Ticket extends Base {
  number: string;
  subject: string;
  description?: string | null;
  status: string;
  priority: string;
  channel: string;
  category?: string | null;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  assignee_id?: number | null;
  assignee?: Ref | null;
  sla_due_at?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  satisfaction?: number | null;
  tags: string[];
}

export interface TicketMessage extends Base {
  ticket_id: number;
  author_type: string;
  author_name?: string | null;
  user_id?: number | null;
  body: string;
  is_internal: boolean;
}

export interface KbArticle extends Base {
  title: string;
  slug: string;
  category?: string | null;
  summary?: string | null;
  body: string;
  status: string;
  views: number;
  helpful: number;
  author?: Ref | null;
  tags: string[];
}

export interface SegmentRule {
  field: string;
  op: string;
  value?: unknown;
}

export interface Segment extends Base {
  name: string;
  description?: string | null;
  entity: string;
  rules: { match: "all" | "any"; conditions: SegmentRule[] };
  color: string;
}

export interface Campaign extends Base {
  name: string;
  channel: string;
  status: string;
  segment_id?: number | null;
  segment?: Ref | null;
  subject?: string | null;
  preheader?: string | null;
  body?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  budget?: number | null;
  owner?: Ref | null;
  stats: Record<string, number>;
  tags: string[];
}

export interface FormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  map_to?: string;
  placeholder?: string;
}

export interface LeadForm extends Base {
  name: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  redirect_url?: string | null;
  active: boolean;
  lifecycle: string;
  tags_to_add: string[];
  owner_id?: number | null;
  create_deal: boolean;
  pipeline_id?: number | null;
  stage_id?: number | null;
  notify: boolean;
  submissions: number;
  theme: Record<string, unknown>;
}

export interface EmailTemplate extends Base {
  name: string;
  category?: string | null;
  subject: string;
  body: string;
}

export interface EmailMessage extends Base {
  direction: "in" | "out";
  status: string;
  folder: string;
  from_email?: string | null;
  from_name?: string | null;
  to: string[];
  cc: string[];
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  contact_id?: number | null;
  contact?: Ref | null;
  company_id?: number | null;
  company?: Ref | null;
  deal_id?: number | null;
  ticket_id?: number | null;
  user?: Ref | null;
  sent_at?: string | null;
  read: boolean;
  starred: boolean;
  error?: string | null;
  attachments: { name: string; size: number }[];
}

export interface DocumentFile extends Base {
  name: string;
  filename: string;
  mime?: string | null;
  size: number;
  folder?: string | null;
  description?: string | null;
  company_id?: number | null;
  company?: Ref | null;
  contact_id?: number | null;
  contact?: Ref | null;
  deal_id?: number | null;
  deal?: Ref | null;
  project_id?: number | null;
  project?: Ref | null;
  uploaded_by?: Ref | null;
  tags: string[];
}

export interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

export interface Automation extends Base {
  name: string;
  description?: string | null;
  active: boolean;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: SegmentRule[];
  actions: AutomationAction[];
  run_count: number;
  last_run_at?: string | null;
  last_status?: string | null;
}

export interface Notification extends Base {
  user_id?: number | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read_at?: string | null;
}

export interface AIProvider extends Base {
  name: string;
  kind: string;
  base_url?: string | null;
  default_model: string;
  models: string[];
  enabled: boolean;
  is_default: boolean;
  options: Record<string, unknown>;
  api_key_set?: boolean;
  api_key_preview?: string | null;
}

export interface Webhook extends Base {
  name: string;
  url: string;
  events: string[];
  secret?: string | null;
  active: boolean;
  last_status?: number | null;
  last_called_at?: string | null;
  failures: number;
}

export interface ApiToken extends Base {
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at?: string | null;
  expires_at?: string | null;
}

export type AnyRecord = Record<string, unknown> & { id: number };
