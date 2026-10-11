import { Accessibility, Check, Gauge, Leaf, Monitor, Moon, Palette, Sparkles, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { useUI, type Effects, type ThemeMode } from "@/stores/ui";
import { Callout, ChoiceCards, SettingsCard, TabHeader } from "./shared";

const PALETTES = {
  light: { bg: "#e9ecf6", blobs: ["#8ea2ff", "#f0abfc", "#67e8f9"], glass: "rgba(255,255,255,.62)", edge: "rgba(255,255,255,.95)", line: "rgba(11,16,32,.42)", soft: "rgba(11,16,32,.13)" },
  dark: { bg: "#070914", blobs: ["#3b4cff", "#a21caf", "#0891b2"], glass: "rgba(255,255,255,.07)", edge: "rgba(255,255,255,.16)", line: "rgba(243,245,255,.5)", soft: "rgba(243,245,255,.16)" },
};

/** Miniature of the app in a given palette (sidebar, top bar, cards). */
function MiniApp({ dark }: { dark: boolean }) {
  const p = dark ? PALETTES.dark : PALETTES.light;
  const surface = { background: p.glass, boxShadow: `inset 0 0 0 1px ${p.edge}` };
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: p.bg }}>
      <span className="absolute -left-6 -top-10 size-28 rounded-full blur-2xl" style={{ background: p.blobs[0], opacity: 0.75 }} />
      <span className="absolute -right-6 -top-4 size-20 rounded-full blur-2xl" style={{ background: p.blobs[1], opacity: 0.6 }} />
      <span className="absolute -bottom-10 right-8 size-24 rounded-full blur-2xl" style={{ background: p.blobs[2], opacity: 0.55 }} />
      <div className="absolute bottom-2.5 left-2.5 top-2.5 w-[24%] rounded-[10px] p-1.5" style={surface}>
        <span className="block h-2 w-2/3 rounded-full" style={{ background: "var(--accent)" }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="mt-1.5 block h-1.5 rounded-full" style={{ background: p.soft, width: `${80 - i * 8}%` }} />
        ))}
      </div>
      <div className="absolute left-[30%] right-2.5 top-2.5 h-4 rounded-[7px]" style={surface} />
      <div className="absolute bottom-2.5 left-[30%] right-2.5 top-8 grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[8px] p-1.5" style={surface}>
            <span className="block h-1 w-1/2 rounded-full" style={{ background: p.line }} />
            <span className="mt-1 block h-2 w-3/4 rounded-full" style={{ background: i === 0 ? "var(--accent)" : p.soft }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeThumb({ mode }: { mode: ThemeMode }) {
  if (mode !== "system") return <MiniApp dark={mode === "dark"} />;
  return (
    <>
      <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}>
        <MiniApp dark={false} />
      </div>
      <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
        <MiniApp dark />
      </div>
    </>
  );
}

const THEMES: { value: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", description: "Verre lumineux sur fonds pastel.", icon: Sun },
  { value: "dark", label: "Sombre", description: "Profondeur et contrastes doux, idéal le soir.", icon: Moon },
  { value: "system", label: "Système", description: "Suit automatiquement le réglage de votre appareil.", icon: Monitor },
];

const EFFECTS: { value: Effects; label: string; description: string; icon: typeof Sparkles }[] = [
  {
    value: "max",
    label: "Maximal",
    description: "Verre liquide avec réfraction, reflets qui suivent le pointeur, cartes inclinables en 3D, scène 3D et fond animé. Pour les ordinateurs récents.",
    icon: Sparkles,
  },
  {
    value: "balanced",
    label: "Équilibré",
    description: "Verre dépoli, reflets et fond animé conservés, sans inclinaison 3D des cartes : plus calme et un peu plus léger.",
    icon: Gauge,
  },
  {
    value: "low",
    label: "Sobre",
    description: "Surfaces opaques, ni flou ni scène 3D, fond immobile : économise la batterie et reste fluide sur les machines modestes.",
    icon: Leaf,
  },
];

export default function AppearanceTab() {
  const { theme, setTheme, effects, setEffects } = useUI();
  const branding = useAuth((s) => s.branding);
  const isAdmin = useAuth((s) => can(s.user, "admin"));
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <TabHeader title="Apparence" description="Personnalisez l'affichage de Prisme sur cet appareil. Ces réglages n'affectent pas les autres membres de l'équipe." />

      <SettingsCard title="Thème" description="Choisissez l'ambiance de l'interface." icon={<Palette className="size-4" />}>
        <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.value)}
                className={cn("group flex flex-col justify-start rounded-[20px] p-2 text-left ring-1 ring-inset transition", active ? "bg-accent-soft ring-2 ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]" : "ring-[var(--hairline-strong)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]")}
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1px_var(--hairline)]">
                  <ThemeThumb mode={t.value} />
                  {active && (
                    <motion.span layoutId="theme-check" className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-lg">
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </div>
                <div className="flex items-center gap-2 px-1.5 pb-1 pt-2.5">
                  <t.icon className={cn("size-4", active ? "text-accent" : "text-fg-3")} />
                  <span className="text-[13.5px] font-semibold">{t.label}</span>
                </div>
                <p className="px-1.5 pb-1 text-[12px] leading-snug text-fg-2">{t.description}</p>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Effets visuels" description="Ajustez l'intensité du Liquid Glass selon votre machine et vos préférences." icon={<Sparkles className="size-4" />}>
        <ChoiceCards options={EFFECTS.map((e) => ({ value: e.value, label: e.label, description: e.description, icon: <e.icon className="size-4" /> }))} value={effects} onChange={setEffects} className="grid-cols-1 md:grid-cols-3" />
        <Callout tone="neutral" icon={<Accessibility className="size-4" />} className="mt-4">
          Si l'option « Réduire les animations » est activée dans votre système, Prisme coupe automatiquement les animations, quel que soit ce réglage.
        </Callout>
      </SettingsCard>

      <SettingsCard
        title="Couleur d'accent"
        description="Couleur des boutons, liens et sélections, définie pour toute l'organisation."
        icon={<Palette className="size-4" />}
        actions={
          isAdmin ? (
            <Button size="sm" variant="glass" onClick={() => navigate("/settings?tab=company#branding")}>
              Personnaliser
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="size-12 rounded-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_10px_24px_-10px_var(--accent)]" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }} />
          <div className="min-w-0">
            <div className="font-mono text-[13.5px] font-semibold uppercase">{branding.accent ?? "#5b6cff"}</div>
            <div className="text-[12.5px] text-fg-3">{isAdmin ? "Modifiable dans Entreprise › Image de marque." : "Définie par un administrateur de votre organisation."}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="btn-primary inline-flex h-8 items-center rounded-[11px] px-3 text-[13px] font-medium">Bouton</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent">Sélection</span>
            <span className="text-[13px] font-medium text-accent underline decoration-[color-mix(in_oklab,var(--accent)_40%,transparent)] underline-offset-[3px]">Lien</span>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
