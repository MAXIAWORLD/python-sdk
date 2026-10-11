import { Check, ChevronDown, KeyRound, Minus, MoreHorizontal, Pencil, RefreshCw, ShieldCheck, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FilterChip } from "@/components/data/blocks";
import { DataTable, type Column } from "@/components/data/DataTable";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { Field, Input, SearchInput } from "@/components/ui/fields";
import { Dialog, Menu, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { ROLES } from "@/lib/constants";
import { relative } from "@/lib/format";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { ChoiceCards, CopyButton, PasswordStrength, ReadOnlyNotice, SettingsCard, SWATCHES, TabHeader } from "./shared";
import { generatePassword, isEmail, passwordValid } from "./validators";

type Role = User["role"];

const ROLE_INFO: Record<Role, string> = {
  admin: "Accès complet : paramètres, équipe, intégrations, sauvegardes.",
  manager: "Pipelines, catalogue, automatisations, exports comptables et RGPD.",
  member: "Travaille au quotidien : contacts, affaires, devis, factures, support.",
  viewer: "Consultation seule, sans modification.",
};

const PERMISSIONS: { label: string; min: Role }[] = [
  { label: "Consulter les contacts, affaires, devis et factures", min: "viewer" },
  { label: "Créer et modifier, émettre devis et factures, utiliser Iris", min: "member" },
  { label: "Pipelines, catalogue, automatisations, envoi de campagnes", min: "manager" },
  { label: "Export FEC, droits RGPD (export, anonymisation)", min: "manager" },
  { label: "Paramètres, équipe, intégrations, sauvegarde complète", min: "admin" },
];

const LEVEL: Record<Role, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };

interface Credentials {
  name: string;
  email: string;
  password: string;
  created: boolean;
}

function credentialsText(c: Credentials, appName: string) {
  const first = c.name.split(" ")[0];
  return [
    `Bonjour ${first},`,
    "",
    `Votre accès à ${appName} est prêt :`,
    `• Adresse : ${window.location.origin}/login`,
    `• Email : ${c.email}`,
    `• Mot de passe temporaire : ${c.password}`,
    "",
    "Pensez à le changer dès votre première connexion (Paramètres › Mon profil).",
  ].join("\n");
}

function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  const appName = useAuth((s) => s.branding.app_name) || "Prisme";
  const text = credentialsText(credentials, appName);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <div>
          <div className="text-[15px] font-semibold">{credentials.created ? `Compte créé pour ${credentials.name}` : `Mot de passe réinitialisé pour ${credentials.name}`}</div>
          <div className="text-[12.5px] text-fg-2">Transmettez ces identifiants par un canal sûr. Le mot de passe ne sera plus affiché.</div>
        </div>
      </div>
      <pre className="glass-inset whitespace-pre-wrap break-words rounded-[16px] p-4 font-sans text-[13px] leading-relaxed">{text}</pre>
      <div className="flex flex-wrap justify-end gap-2">
        <CopyButton value={credentials.password} label="Copier le mot de passe" />
        <CopyButton value={text} label="Copier le message" variant="primary" />
      </div>
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState(() => ({ name: "", email: "", title: "", role: "member" as Role, password: generatePassword() }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Credentials | null>(null);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm({ name: "", email: "", title: "", role: "member", password: generatePassword() });
      setDone(null);
    }
  }
  const emailError = form.email && !isEmail(form.email) ? "Adresse email invalide." : null;
  const valid = form.name.trim().length > 1 && isEmail(form.email) && passwordValid(form.password);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await api.post<User>("/users", { name: form.name.trim(), email: form.email.trim(), title: form.title.trim() || null, role: form.role, password: form.password, is_active: true, color: SWATCHES[Math.floor(Math.random() * SWATCHES.length)] });
      invalidate("users");
      setDone({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password, created: true });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<UserPlus className="size-5" />}
      title={done ? "Identifiants à transmettre" : "Ajouter un membre"}
      description={done ? undefined : "Le compte est actif immédiatement avec un mot de passe temporaire."}
      footer={
        done ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Terminé
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button variant="primary" loading={busy} disabled={!valid} onClick={() => submit()} icon={<UserPlus className="size-4" />}>
              Créer le compte
            </Button>
          </>
        )
      }
    >
      {done ? (
        <CredentialsPanel credentials={done} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom complet" required>
              <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Email professionnel" required error={emailError}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="prenom@entreprise.fr" />
            </Field>
            <Field label="Fonction" className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. : Account Executive" />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Rôle</div>
            <ChoiceCards
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              className="grid-cols-1 sm:grid-cols-2"
              options={ROLES.map((r) => ({ value: r.value as Role, label: r.label, description: ROLE_INFO[r.value as Role] }))}
            />
          </div>
          <Field
            label="Mot de passe temporaire"
            action={
              <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                <RefreshCw className="size-3" /> Régénérer
              </button>
            }
          >
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="font-mono" spellCheck={false} autoComplete="off" />
          </Field>
          <PasswordStrength password={form.password} />
          <button type="submit" className="hidden" />
        </form>
      )}
    </Dialog>
  );
}

function RoleMenu({ user, disabled, onChange }: { user: User; disabled: boolean; onChange: (role: Role) => void }) {
  const badge = <StatusBadge options={ROLES} value={user.role} size="xs" />;
  if (disabled) return badge;
  return (
    <Menu
      align="start"
      width={300}
      trigger={
        <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-full pr-1 transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={`Changer le rôle de ${user.name}`}>
          {badge}
          <ChevronDown className="size-3.5 text-fg-3" />
        </button>
      }
      items={ROLES.map((r) => ({
        label: (
          <span className="block">
            <span className="flex items-center gap-2 font-medium">
              {r.label}
              {r.value === user.role && <Check className="size-3.5 text-accent" />}
            </span>
            <span className="block text-[11.5px] leading-snug text-fg-3">{ROLE_INFO[r.value as Role]}</span>
          </span>
        ),
        onSelect: () => r.value !== user.role && onChange(r.value as Role),
      }))}
    />
  );
}

function PermissionsCard() {
  return (
    <SettingsCard title="Rôles et permissions" description="Ce que chaque rôle peut faire dans Prisme." icon={<ShieldCheck className="size-4" />} bodyClassName="px-0 py-0 sm:px-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-[11.5px] uppercase tracking-[0.06em] text-fg-3">
              <th className="px-5 py-2.5 font-semibold sm:px-6">Permission</th>
              {ROLES.map((r) => (
                <th key={r.value} className="px-3 py-2.5 text-center font-semibold">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.label} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-5 py-2.5 text-fg-2 sm:px-6">{p.label}</td>
                {ROLES.map((r) => (
                  <td key={r.value} className="px-3 py-2.5 text-center">
                    {LEVEL[r.value as Role] >= LEVEL[p.min] ? <Check className="mx-auto size-4 text-emerald-500" strokeWidth={2.5} /> : <Minus className="mx-auto size-4 text-fg-3 opacity-50" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsCard>
  );
}

export default function TeamTab() {
  const me = useAuth((s) => s.user);
  const isAdmin = can(me, "admin");
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const { data, isLoading } = useList<User>("users", { sort: "name", limit: 500 });
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const users = useMemo(() => data?.items ?? [], [data]);
  const active = users.filter((u) => u.is_active);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => (showInactive || u.is_active) && (!roleFilter || u.role === roleFilter) && (!term || `${u.name} ${u.email} ${u.title ?? ""}`.toLowerCase().includes(term)));
  }, [users, q, roleFilter, showInactive]);

  const patch = async (user: User, data: Record<string, unknown>, message: string) => {
    try {
      await api.patch(`/users/${user.id}`, data);
      invalidate("users");
      toast.success(message);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const changeRole = async (user: User, role: Role) => {
    const label = ROLES.find((r) => r.value === role)?.label ?? role;
    if (user.role === "admin" && !(await confirm({ title: `Retirer les droits d'administration de ${user.name} ?`, description: `Son rôle deviendra « ${label} ». Il doit toujours rester au moins un administrateur actif.`, confirmLabel: "Changer le rôle" }))) return;
    patch(user, { role }, `${user.name} est maintenant ${label.toLowerCase()}`);
  };

  const toggleActive = async (user: User) => {
    if (user.is_active) {
      const ok = await confirm({ title: `Désactiver ${user.name} ?`, description: "Le compte ne pourra plus se connecter ni utiliser ses jetons API. Son historique (activités, affaires, factures) est conservé.", confirmLabel: "Désactiver", danger: true });
      if (ok) patch(user, { is_active: false }, `${user.name} a été désactivé`);
    } else patch(user, { is_active: true }, `${user.name} a été réactivé`);
  };

  const resetPassword = async (user: User) => {
    const ok = await confirm({ title: `Réinitialiser le mot de passe de ${user.name} ?`, description: "Un nouveau mot de passe temporaire est généré ; l'ancien ne fonctionnera plus.", confirmLabel: "Réinitialiser" });
    if (!ok) return;
    const password = generatePassword();
    if (await patch(user, { password }, "Mot de passe réinitialisé")) setCredentials({ name: user.name, email: user.email, password, created: false });
  };

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Membre",
      cell: (u) => (
        <div className={cn("flex min-w-0 items-center gap-3", !u.is_active && "opacity-55")}>
          <Avatar name={u.name} color={u.color} src={u.avatar_url} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate font-medium">
              {u.name}
              {u.id === me?.id && <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold text-accent">Vous</span>}
            </div>
            <div className="truncate text-[12px] text-fg-3">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Rôle", cell: (u) => <RoleMenu user={u} disabled={!isAdmin || u.id === me?.id || !u.is_active} onChange={(r) => changeRole(u, r)} /> },
    { key: "title", header: "Fonction", hideOnMobile: true, cell: (u) => <span className="line-clamp-1 text-fg-2">{u.title || "—"}</span> },
    {
      key: "status",
      header: "Statut",
      hideOnMobile: true,
      cell: (u) =>
        u.is_active ? (
          <Badge tone="green" dot size="xs">
            Actif
          </Badge>
        ) : (
          <Badge tone="gray" dot size="xs">
            Désactivé
          </Badge>
        ),
    },
    { key: "login", header: "Dernière connexion", hideOnMobile: true, align: "right", cell: (u) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{u.last_login_at ? relative(u.last_login_at) : "Jamais connecté"}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "52px",
      cell: (u) =>
        isAdmin ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Menu
              trigger={
                <IconButton label={`Actions pour ${u.name}`} size="sm">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              }
              items={[
                { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setEditing(u) },
                { label: "Réinitialiser le mot de passe", icon: <KeyRound className="size-4" />, onSelect: () => resetPassword(u), disabled: u.id === me?.id || !u.is_active },
                { separator: true, label: "" },
                u.is_active
                  ? { label: "Désactiver le compte", icon: <UserX className="size-4" />, danger: true, onSelect: () => toggleActive(u), disabled: u.id === me?.id }
                  : { label: "Réactiver le compte", icon: <UserCheck className="size-4" />, onSelect: () => toggleActive(u) },
              ]}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <TabHeader
        title="Équipe"
        description={`${active.length} membre${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""}${users.length > active.length ? ` · ${users.length - active.length} désactivé${users.length - active.length > 1 ? "s" : ""}` : ""}. Les comptes ne sont jamais supprimés afin de préserver l'historique.`}
        actions={
          isAdmin && (
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>
              Ajouter un membre
            </Button>
          )
        }
      />
      {!isAdmin && <ReadOnlyNotice>Seuls les administrateurs peuvent ajouter des membres ou modifier leurs rôles.</ReadOnlyNotice>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, email, fonction…" className="lg:w-[280px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!roleFilter} onClick={() => setRoleFilter(null)} count={active.length}>
            Tous
          </FilterChip>
          {ROLES.map((r) => (
            <FilterChip key={r.value} active={roleFilter === r.value} onClick={() => setRoleFilter(roleFilter === r.value ? null : (r.value as Role))} count={active.filter((u) => u.role === r.value).length}>
              {r.label}
            </FilterChip>
          ))}
          {users.length > active.length && (
            <FilterChip active={showInactive} onClick={() => setShowInactive((v) => !v)}>
              Afficher les désactivés
            </FilterChip>
          )}
        </div>
      </div>

      <Glass className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          onRowClick={isAdmin ? (u) => setEditing(u) : undefined}
          empty={<EmptyState icon={<Users className="size-6" />} title="Aucun membre trouvé" description="Modifiez votre recherche ou vos filtres." />}
        />
      </Glass>

      <PermissionsCard />

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <RecordDialog
        resource="users"
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        recordId={editing?.id}
        initial={editing ? { name: editing.name, email: editing.email, role: editing.role, title: editing.title, phone: editing.phone, hourly_cost: editing.hourly_cost, color: editing.color, is_active: editing.is_active } : undefined}
        title={editing ? `Modifier ${editing.name}` : undefined}
        onSaved={() => invalidate("users")}
      />
      <Dialog
        open={!!credentials}
        onOpenChange={(o) => !o && setCredentials(null)}
        size="md"
        icon={<KeyRound className="size-5" />}
        title="Identifiants à transmettre"
        footer={
          <Button variant="primary" onClick={() => setCredentials(null)}>
            Terminé
          </Button>
        }
      >
        {credentials && <CredentialsPanel credentials={credentials} />}
      </Dialog>
    </div>
  );
}
