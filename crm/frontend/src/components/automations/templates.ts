import type { AutomationAction, SegmentRule } from "@/lib/types";

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: SegmentRule[];
  actions: AutomationAction[];
}

export const TEMPLATE_CATEGORIES = ["Facturation", "Ventes", "Delivery", "Support", "Marketing", "IA"];

/** Ready-to-use scenarios, all built on the real trigger/action catalog of the engine. */
export const TEMPLATES: AutomationTemplate[] = [
  {
    id: "invoice-overdue-reminder",
    name: "Relance automatique des factures en retard",
    description: "Envoie un rappel courtois au client dès l'échéance dépassée et planifie un suivi pour le responsable du compte.",
    category: "Facturation",
    trigger: { type: "invoice.overdue", config: {} },
    conditions: [],
    actions: [
      {
        type: "send_email",
        config: {
          to: "contact",
          subject: "Rappel : facture {{entity.number}} en attente de règlement",
          body:
            "Bonjour {{contact.first_name}},\n\nSauf erreur de notre part, la facture {{entity.number}} (reste dû : {{entity.balance_due}} €) est arrivée à échéance le {{entity.due_date}}.\n\nPourriez-vous nous indiquer la date de règlement prévue ? Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nPour rappel, tout retard de paiement entraîne l'application de pénalités ainsi que d'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).\n\nBien cordialement,\n{{owner.name}}",
        },
      },
      { type: "create_task", config: { title: "Relancer {{company.name}} — facture {{entity.number}}", due_in_days: 7, priority: "high", assignee: "owner" } },
    ],
  },
  {
    id: "quote-viewed-follow-up",
    name: "Devis consulté → tâche de suivi",
    description: "Le client ouvre votre devis : une tâche de rappel est créée et le commercial est prévenu en temps réel.",
    category: "Ventes",
    trigger: { type: "quote.viewed", config: {} },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Rappeler {{contact.full_name}} — devis {{entity.number}} consulté", due_in_days: 1, priority: "high", assignee: "owner" } },
      { type: "notify", config: { target: "owner", title: "👀 {{company.name}} consulte le devis {{entity.number}}", body: "C'est le bon moment pour appeler.", link: "/quotes/{{entity.id}}" } },
    ],
  },
  {
    id: "deal-negotiation-alert",
    name: "Affaire en négociation → alerte",
    description: "Prévient le responsable dès qu'une opportunité entre en négociation et prépare la proposition finale.",
    category: "Ventes",
    trigger: { type: "deal.stage_changed", config: { to_stage: "Négociation" } },
    conditions: [],
    actions: [
      { type: "notify", config: { target: "owner", title: "🔥 {{entity.title}} passe en négociation", body: "Montant : {{entity.amount}} € · {{company.name}}", link: "/deals/{{entity.id}}" } },
      { type: "create_task", config: { title: "Préparer la proposition finale — {{entity.title}}", due_in_days: 2, priority: "high", assignee: "owner" } },
    ],
  },
  {
    id: "new-customer-welcome",
    name: "Bienvenue aux nouveaux clients",
    description: "À la signature, un email de bienvenue part au client et le kick-off est planifié pour l'équipe.",
    category: "Ventes",
    trigger: { type: "deal.won", config: {} },
    conditions: [],
    actions: [
      {
        type: "send_email",
        config: {
          to: "contact",
          subject: "Bienvenue à bord, {{contact.first_name}} !",
          body:
            "Bonjour {{contact.first_name}},\n\nMerci pour votre confiance ! Toute l'équipe est ravie de démarrer ce projet avec {{company.name}}.\n\nJe reviens vers vous très vite pour organiser notre réunion de lancement.\n\nÀ très bientôt,\n{{owner.name}}",
        },
      },
      { type: "create_task", config: { title: "Planifier le kick-off avec {{company.name}}", due_in_days: 2, priority: "high", assignee: "owner" } },
    ],
  },
  {
    id: "won-deal-project",
    name: "Affaire gagnée → projet de delivery",
    description: "Crée automatiquement le projet de réalisation et planifie le kick-off dès la signature.",
    category: "Delivery",
    trigger: { type: "deal.won", config: {} },
    conditions: [],
    actions: [
      { type: "create_project", config: { name: "Projet — {{entity.title}}", billing_mode: "fixed" } },
      { type: "create_task", config: { title: "Organiser le kick-off avec {{company.name}}", due_in_days: 3, priority: "high", assignee: "owner" } },
    ],
  },
  {
    id: "subscription-onboarding",
    name: "Nouvel abonnement → parcours d'onboarding",
    description: "Chaque nouvel abonné reçoit un accompagnement : tâche d'onboarding et alerte pour le responsable du compte.",
    category: "Delivery",
    trigger: { type: "subscription.created", config: {} },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Onboarding {{company.name}} — formule {{entity.plan}}", due_in_days: 2, priority: "medium", assignee: "owner" } },
      { type: "notify", config: { target: "owner", title: "🎉 Nouvel abonnement : {{company.name}}", body: "Formule {{entity.plan}} · MRR {{entity.mrr}} €", link: "/subscriptions" } },
    ],
  },
  {
    id: "urgent-ticket-alert",
    name: "Ticket urgent → notification de l'équipe",
    description: "Chaque ticket urgent déclenche une alerte pour toute l'équipe afin de tenir le SLA de 4 heures.",
    category: "Support",
    trigger: { type: "ticket.created", config: {} },
    conditions: [{ field: "entity.priority", op: "eq", value: "urgent" }],
    actions: [{ type: "notify", config: { target: "all", title: "🚨 Ticket urgent : {{entity.subject}}", body: "{{entity.number}} · {{company.name}} — SLA de 4 h", link: "/tickets/{{entity.id}}" } }],
  },
  {
    id: "inbound-lead-call",
    name: "Nouveau lead entrant → appel sous 24 h",
    description: "Chaque demande reçue via un formulaire est confirmée au prospect et rappelée dans la journée.",
    category: "Marketing",
    trigger: { type: "form.submitted", config: {} },
    conditions: [],
    actions: [
      {
        type: "send_email",
        config: {
          to: "contact",
          subject: "Nous avons bien reçu votre demande",
          body: "Bonjour {{contact.first_name}},\n\nMerci pour votre message ! Un membre de notre équipe vous rappelle sous 24 heures ouvrées.\n\nBien cordialement,\n{{owner.name}}",
        },
      },
      { type: "create_task", config: { title: "Appeler {{contact.full_name}} (lead entrant)", due_in_days: 1, priority: "high", assignee: "owner" } },
    ],
  },
  {
    id: "lost-deal-nurturing",
    name: "Affaire perdue → reprise de contact à 90 jours",
    description: "Ne laissez filer aucune opportunité : une relance est planifiée trois mois après la perte.",
    category: "Ventes",
    trigger: { type: "deal.lost", config: {} },
    conditions: [],
    actions: [{ type: "create_task", config: { title: "Reprendre contact avec {{company.name}} ({{entity.title}})", description: "Motif de perte : {{entity.lost_reason}}", due_in_days: 90, priority: "low", assignee: "owner" } }],
  },
  {
    id: "invoice-paid-thanks",
    name: "Facture payée → remerciement",
    description: "Remercie le client à réception du paiement et informe le responsable du compte.",
    category: "Facturation",
    trigger: { type: "invoice.paid", config: {} },
    conditions: [],
    actions: [
      { type: "send_email", config: { to: "contact", subject: "Merci pour votre règlement", body: "Bonjour {{contact.first_name}},\n\nNous avons bien reçu le règlement de la facture {{entity.number}}. Merci pour votre confiance !\n\nBien cordialement,\n{{owner.name}}" } },
      { type: "notify", config: { target: "owner", title: "💶 Paiement reçu : facture {{entity.number}}", body: "{{company.name}} a réglé sa facture.", link: "/invoices/{{entity.id}}" } },
    ],
  },
  {
    id: "ai-lead-qualification",
    name: "Qualification IA des nouveaux contacts",
    description: "Iris analyse chaque nouveau contact, attribue un score BANT et crée une tâche si le lead est chaud.",
    category: "IA",
    trigger: { type: "contact.created", config: {} },
    conditions: [],
    actions: [
      {
        type: "ai_agent",
        config: {
          instructions:
            "Un nouveau contact vient d'être créé : {{contact.full_name}} ({{company.name}}). Évalue-le selon les critères BANT, mets à jour son score (lead_score sur 100) et, si le score dépasse 70, crée une tâche d'appel prioritaire pour son responsable.",
        },
      },
    ],
  },
  {
    id: "weekly-ai-brief",
    name: "Brief commercial hebdomadaire par Iris",
    description: "Chaque lundi, Iris passe en revue le pipeline et les retards, puis crée une tâche de synthèse.",
    category: "IA",
    trigger: { type: "schedule.weekly", config: {} },
    conditions: [],
    actions: [
      {
        type: "ai_agent",
        config: {
          instructions:
            "Prépare le brief commercial de la semaine : affaires chaudes, opportunités sans activité depuis 3 semaines, factures en retard et tickets hors SLA. Crée une tâche « Brief de la semaine » contenant ta synthèse et tes 3 priorités.",
        },
      },
    ],
  },
];
