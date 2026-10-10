import { Compass } from "lucide-react";
import { Link } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

export default function NotFound() {
  return (
    <Glass className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page introuvable"
        description="Cette page n'existe pas ou a été déplacée."
        action={
          <Button variant="primary" asChild>
            <Link to="/">Retour au tableau de bord</Link>
          </Button>
        }
      />
    </Glass>
  );
}
