import { ClipboardList, Filter, Megaphone } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Tabs } from "@/components/ui/tabs";
import { useList } from "@/lib/hooks";

type Section = "/campaigns" | "/segments" | "/forms";

const SECTIONS: Section[] = ["/campaigns", "/segments", "/forms"];

/** Switches between the three marketing pages (campaigns, segments, lead forms). */
export function MarketingTabs({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const value = SECTIONS.find((s) => location.pathname.startsWith(s)) ?? "/campaigns";
  const campaigns = useList("campaigns", { limit: 1, expand: 0 }).data?.total;
  const segments = useList("segments", { limit: 1, expand: 0 }).data?.total;
  const forms = useList("forms", { limit: 1, expand: 0 }).data?.total;

  return (
    <Tabs<Section>
      className={className}
      value={value}
      onChange={(v) => navigate(v)}
      items={[
        { value: "/campaigns", label: "Campagnes", icon: <Megaphone className="size-4" />, count: campaigns },
        { value: "/segments", label: "Segments", icon: <Filter className="size-4" />, count: segments },
        { value: "/forms", label: "Formulaires", icon: <ClipboardList className="size-4" />, count: forms },
      ]}
    />
  );
}
