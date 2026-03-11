/**
 * BEACON PROTOCOL — usePermissions Hook (Control de Acceso Frontend)
 * ====================================================================
 * Lee el rol del usuario desde localStorage y resuelve permisos
 * según la Matriz de Control de Acceso (ACM).
 *
 * Sistema de rangos v1: BASIC (0.5x) / VERIFIED (1.0x)
 *
 * La Matriz espejo (frontend) replica la lógica del backend para
 * que la UI se adapte ANTES de hacer llamadas al servidor.
 * El backend SIEMPRE valida de nuevo (defensa en profundidad).
 *
 * "El frontend sugiere. El backend decide."
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Tipos ───
type Role = "ANONYMOUS" | "BASIC" | "VERIFIED";

interface UserState {
    id: string | null;
    email: string | null;
    full_name: string | null;
    rank: Role;
    role: string;
    is_verified: boolean;
    integrity_score: number;
}

interface Permissions {
    browse_entities: boolean;
    view_rankings: boolean;
    view_objective_data: boolean;
    evaluate: boolean;
    view_integrity_stats: boolean;
    view_own_impact: boolean;
    edit_own_verdict: boolean;
    verified_badge: boolean;
    view_advanced_metrics: boolean;
    propose_dynamic_sliders: boolean;
    priority_audit: boolean;
}

interface VotingConfig {
    base_weight: number;
    territorial_bonus_eligible: boolean;
}

interface PermissionsResult {
    user: UserState;
    permissions: Permissions;
    voting: VotingConfig;
    isAuthenticated: boolean;
    isVerified: boolean;
    isBasic: boolean;
    isAdmin: boolean;
    shouldTriggerAuthModal: boolean;
    openAuthModal: () => void;
    logout: () => void;
}

// ─── ACM Espejo (Réplica de la Matriz del backend) ───
const ACM_PERMISSIONS: Record<Role, Partial<Permissions>> = {
    ANONYMOUS: {
        browse_entities: true,
        view_rankings: true,
        view_objective_data: true,
        evaluate: false,
        view_integrity_stats: false,
        view_own_impact: false,
        edit_own_verdict: false,
        verified_badge: false,
        view_advanced_metrics: false,
        propose_dynamic_sliders: false,
        priority_audit: false,
    },
    BASIC: {
        evaluate: true,
        view_own_impact: true,
        edit_own_verdict: true,
    },
    VERIFIED: {
        verified_badge: true,
        view_advanced_metrics: true,
        view_integrity_stats: true,
        propose_dynamic_sliders: true,
        priority_audit: true,
    },
};

// Pesos reflejan config_params del backend (VOTE_WEIGHT_BASIC=0.5, VOTE_WEIGHT_VERIFIED=1.0)
const ACM_VOTING: Record<Role, VotingConfig> = {
    ANONYMOUS: { base_weight: 0.0, territorial_bonus_eligible: false },
    BASIC:     { base_weight: 0.5, territorial_bonus_eligible: true },
    VERIFIED:  { base_weight: 1.0, territorial_bonus_eligible: true },
};

const INHERITANCE_CHAIN: Record<Role, Role | null> = {
    ANONYMOUS: null,
    BASIC:     "ANONYMOUS",
    VERIFIED:  "BASIC",
};

/** Resuelve permisos con herencia */
function resolvePermissions(role: Role): Permissions {
    const base: Permissions = {
        browse_entities: false,
        view_rankings: false,
        view_objective_data: false,
        evaluate: false,
        view_integrity_stats: false,
        view_own_impact: false,
        edit_own_verdict: false,
        verified_badge: false,
        view_advanced_metrics: false,
        propose_dynamic_sliders: false,
        priority_audit: false,
    };

    // Construir cadena de herencia ANONYMOUS → BASIC → VERIFIED
    const chain: Role[] = [];
    let current: Role | null = role;
    while (current) {
        chain.unshift(current);
        current = INHERITANCE_CHAIN[current];
    }

    // Aplicar permisos en orden
    for (const r of chain) {
        const overrides = ACM_PERMISSIONS[r];
        Object.assign(base, overrides);
    }

    return base;
}

// ─── Helper: normalizar rank legacy → v1 ──────────────────────────────
// Protección de compatibilidad: si el backend devuelve un rank del sistema
// de 4 rangos (BRONZE/SILVER/GOLD/DIAMOND), lo mapea al sistema v1.
function normalizeRank(raw: string | null | undefined): Role {
    if (!raw) return "ANONYMOUS";
    const upper = raw.toUpperCase();
    if (upper === "VERIFIED") return "VERIFIED";
    if (upper === "BASIC")    return "BASIC";
    // Legacy mapping (en transición)
    if (upper === "SILVER" || upper === "GOLD" || upper === "DIAMOND") return "VERIFIED";
    if (upper === "BRONZE") return "BASIC";
    return "ANONYMOUS";
}

// ─── Hook principal ───

export default function usePermissions(): PermissionsResult {
    const [user, setUser] = useState<UserState>({
        id: null,
        email: null,
        full_name: null,
        rank: "ANONYMOUS",
        role: "user",
        is_verified: false,
        integrity_score: 0,
    });

    const [authModalRequested, setAuthModalRequested] = useState(false);

    // Leer usuario de localStorage al montar
    useEffect(() => {
        try {
            const stored = localStorage.getItem("beacon_user");
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser({
                    id: parsed.id || null,
                    email: parsed.email || null,
                    full_name: parsed.full_name || null,
                    rank: normalizeRank(parsed.rank),
                    role: parsed.role || "user",
                    is_verified: parsed.is_verified || false,
                    integrity_score: parsed.integrity_score || 0.5,
                });
            }
        } catch {
            // Si localStorage falla, queda como ANONYMOUS
        }
    }, []);

    // Escuchar cambios en localStorage (multi-tab sync)
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === "beacon_user") {
                if (e.newValue) {
                    const parsed = JSON.parse(e.newValue);
                    setUser({
                        id: parsed.id,
                        email: parsed.email,
                        full_name: parsed.full_name,
                        rank: normalizeRank(parsed.rank),
                        role: parsed.role || "user",
                        is_verified: parsed.is_verified || false,
                        integrity_score: parsed.integrity_score || 0.5,
                    });
                } else {
                    setUser({
                        id: null, email: null, full_name: null,
                        rank: "ANONYMOUS", role: "user", is_verified: false, integrity_score: 0,
                    });
                }
            }
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, []);

    const permissions = useMemo(() => resolvePermissions(user.rank), [user.rank]);
    const voting = useMemo(() => ACM_VOTING[user.rank], [user.rank]);

    const isAuthenticated = user.id !== null;
    const isVerified = user.rank === "VERIFIED";
    const isBasic = user.rank === "BASIC";
    const isAdmin = user.role === "admin";

    const openAuthModal = useCallback(() => {
        setAuthModalRequested(true);
        window.dispatchEvent(new CustomEvent("beacon:open-auth-modal"));
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("beacon_token");
        localStorage.removeItem("beacon_user");
        setUser({
            id: null, email: null, full_name: null,
            rank: "ANONYMOUS", role: "user", is_verified: false, integrity_score: 0,
        });
    }, []);

    return {
        user,
        permissions,
        voting,
        isAuthenticated,
        isVerified,
        isBasic,
        isAdmin,
        shouldTriggerAuthModal: !isAuthenticated,
        openAuthModal,
        logout,
    };
}
