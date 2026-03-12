/**
 * BEACON PROTOCOL — Store Global de Auth (Zustand)
 * ==================================================
 * Estado global del ciudadano autenticado.
 * Persiste en localStorage bajo la clave "beacon-auth".
 *
 * Uso:
 *   const { token, user, setAuth, clearAuth } = useAuthStore();
 *
 * Hydration en Next.js App Router:
 *   El store usa persist con guard SSR para evitar mismatch servidor/cliente.
 *   Los componentes que lo consuman deben ser "use client".
 *
 * "El ciudadano que entra al búnker, carga su identidad con él."
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Tipos sincronizados con el contrato de /api/v1/user/auth/me ───

export type UserRank = "BASIC" | "VERIFIED" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

export interface BeaconUser {
  id: string;
  email: string;
  full_name: string;
  rank: UserRank;
  integrity_score: number;
  reputation_score: number;
  verification_level: number;
  is_verified: boolean;
  commune: string | null;
  region: string | null;
  age_range: string | null;
  created_at: string | null;
  role: string;
}

// ─── Shape del store ───

interface AuthState {
  /** JWT emitido por Supabase Auth. Null si no hay sesión activa. */
  token: string | null;

  /** Datos del ciudadano autenticado. Null si no hay sesión activa. */
  user: BeaconUser | null;

  /**
   * Guarda token y perfil del ciudadano tras login exitoso.
   * El persist middleware los escribe en localStorage automáticamente.
   */
  setAuth: (token: string, user: BeaconUser) => void;

  /**
   * Limpia token y perfil del ciudadano (logout o sesión expirada).
   * El persist middleware borra las entradas de localStorage.
   */
  clearAuth: () => void;
}

// ─── Store con persist en localStorage ───

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      clearAuth: () => set({ token: null, user: null }),
    }),
    {
      // Clave en localStorage. Distinta de las legacy "beacon_token"/"beacon_user"
      // para coexistir durante la migración gradual de AuthModal al store.
      name: "beacon-auth",

      // Guard SSR: localStorage solo existe en el cliente.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : ({} as Storage)
      ),

      // Persiste solo token y user; las funciones no son serializables.
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);

// ─── Selector helpers (evitan re-renders innecesarios) ───

/** Devuelve true si hay sesión activa. */
export const selectIsAuthenticated = (state: AuthState) =>
  state.token !== null && state.user !== null;

/** Devuelve el rango del ciudadano, o BASIC como fallback seguro. */
export const selectRank = (state: AuthState): UserRank =>
  state.user?.rank ?? "BASIC";

/** Devuelve true si el ciudadano tiene rol admin. */
export const selectIsAdmin = (state: AuthState) =>
  state.user?.role === "admin";
