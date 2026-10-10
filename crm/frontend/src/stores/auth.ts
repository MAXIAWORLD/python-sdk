import { create } from "zustand";
import type { User } from "@/lib/types";

export interface Branding {
  app_name: string;
  accent?: string | null;
  logo_url?: string | null;
  company?: string | null;
}

interface AuthState {
  user: User | null;
  branding: Branding;
  setupRequired: boolean;
  ready: boolean;
  set: (patch: Partial<Omit<AuthState, "set">>) => void;
}

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  branding: { app_name: "Prisme" },
  setupRequired: false,
  ready: false,
  set: (patch) => set(patch),
}));

export function can(user: User | null, role: "viewer" | "member" | "manager" | "admin") {
  const level = { viewer: 0, member: 1, manager: 2, admin: 3 } as const;
  if (!user) return false;
  return level[user.role] >= level[role];
}
