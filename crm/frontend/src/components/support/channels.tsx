import { AtSign, ClipboardList, Globe, Mail, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { labelOf, TICKET_CHANNELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  email: Mail,
  chat: MessageCircle,
  phone: Phone,
  portal: Globe,
  form: ClipboardList,
  social: AtSign,
};

export function channelIcon(channel?: string | null): LucideIcon {
  return (channel && CHANNEL_ICONS[channel]) || MessageSquare;
}

export function ChannelLabel({ channel, className, iconOnly, labelClassName }: { channel?: string | null; className?: string; iconOnly?: boolean; labelClassName?: string }) {
  const Icon = channelIcon(channel);
  const label = labelOf(TICKET_CHANNELS, channel);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-fg-2", className)} title={label}>
      <Icon className="size-3.5 shrink-0 text-fg-3" />
      {!iconOnly && <span className={labelClassName}>{label}</span>}
    </span>
  );
}

/** Accent gradient per ticket priority (visual tiles, kanban dots). */
export const PRIORITY_GRADIENT: Record<string, string> = {
  urgent: "linear-gradient(135deg,#ff453a,#ff375f)",
  high: "linear-gradient(135deg,#ff9f0a,#f97316)",
  normal: "linear-gradient(135deg,#5b6cff,#22d3ee)",
  low: "linear-gradient(135deg,#a1a1aa,#71717a)",
};

export const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500 shadow-[0_0_8px_#ef4444]",
  high: "bg-orange-500 shadow-[0_0_8px_#f97316]",
  normal: "bg-sky-500",
  low: "bg-zinc-400",
};
