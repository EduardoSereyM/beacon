/**
 * BEACON PROTOCOL — usePermissions Hook (Control de Acceso Frontend)
 * ====================================================================
 * Lee el rol del usuario desde localStorage y resuelve permisos
 * según la Matriz de Control de Acceso (ACM).
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
type Role = "ANONYMOUS" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

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
    BRONZE: {
        evaluate: true,
        view_own_impact: true,
        edit_own_verdict: true,
    },
    SILVER: {
        verified_badge: true,
        view_advanced_metrics: true,
        view_integrity_stats: true,
    },
    GOLD: {
        propose_dynamic_sliders: true,
        priority_audit: true,
    },
    DIAMOND: {},
};

const ACM_VOTING: Record<Role, VotingConfig> = {
    ANONYMOUS: { base_weight: 0.0, territorial_bonus_eligible: false },
    BRONZE: { base_weight: 1.0, territorial_bonus_eligible: true },
    SILVER: { base_weight: 1.5, territorial_bonus_eligible: true },
    GOLD: { base_weight: 2.5, territorial_bonus_eligible: true },
    DIAMOND: { base_weight: 5.0, territorial_bonus_eligible: true },
};

const INHERITANCE_CHAIN: Record<Role, Role | null> = {
    ANONYMOUS: null,
    BRONZE: "ANONYMOUS",
    SILVER: "BRONZE",
    GOLD: "SILVER",
    DIAMOND: "GOLD",
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

    // Construir cadena de herencia
    const chain: Role[] = [];
    let current: Role | null = role;
    while (current) {
        chain.unshift(current);
        current = INHERITANCE_CHAIN[current];
    }

    // Aplicar permisos en orden (ANONYMOUS → BRONZE → ... → role)
    for (const r of chain) {
        const overrides = ACM_PERMISSIONS[r];
        Object.assign(base, overrides);
    }

    return base;
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
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setUser({
                    id: parsed.id || null,
                    email: parsed.email || null,
                    full_name: parsed.full_name || null,
                    rank: (parsed.rank as Role) || "BRONZE",
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
                        rank: parsed.rank || "BRONZE",
                        role: parsed.role || "user",
                        is_verified: parsed.is_verified || false,
                        integrity_score: parsed.integrity_score || 0.5,
                    });
                } else {
                    // Logout en otra pestaña
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
    const isVerified = user.is_verified;
    const isAdmin = user.role === "admin";

    const openAuthModal = useCallback(() => {
        setAuthModalRequested(true);
        // Disparar evento custom para que NavbarClient abra el modal
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
        isAdmin,
        shouldTriggerAuthModal: !isAuthenticated,
        openAuthModal,
        logout,
    };
}
