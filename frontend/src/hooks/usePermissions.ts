/**
 * BEACON PROTOCOL — usePermissions Hook (Control de Acceso Frontend)
 * ====================================================================
 * Lee el rol del usuario desde localStorage y resuelve permisos
 * según la Matriz de Control de Acceso (ACM).
 *
 * Sistema de rangos v2: BASIC (0.5x) / VERIFIED (1.0x)
 * Los rangos legacy BRONZE/SILVER/GOLD/DIAMOND se normalizan automáticamente.
 *
 * "El frontend sugiere. El backend decide."
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Tipos ───

/** Rangos del sistema 2026 (v2). Legacy incluidos para migración gradual. */
type Role = "ANONYMOUS" | "BASIC" | "VERIFIED" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

/** Normaliza rangos legacy al sistema v2 */
function normalizeRank(raw: string): Role {
    if (raw === "VERIFIED") return "VERIFIED";
    if (raw === "BASIC") return "BASIC";
    if (raw === "BRONZE") return "BASIC";
    if (raw === "SILVER" || raw === "GOLD" || raw === "DIAMOND") return "VERIFIED";
    return "ANONYMOUS";
}

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
}

interface VotingConfig {
    base_weight: number;
    territorial_bonus_eligible: boolean;
}

interface PermissionsResult {
    user: UserState;
    permissions: Permissions;
    voting: VotingConfig;
    rank: Role;
    isAuthenticated: boolean;
    isVerified: boolean;
    isBasic: boolean;
    isAdmin: boolean;
    shouldTriggerAuthModal: boolean;
    openAuthModal: () => void;
    logout: () => void;
}

// ─── ACM Espejo ───

const ACM_PERMISSIONS: Record<"ANONYMOUS" | "BASIC" | "VERIFIED", Partial<Permissions>> = {
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
    },
};

const ACM_VOTING: Record<"ANONYMOUS" | "BASIC" | "VERIFIED", VotingConfig> = {
    ANONYMOUS: { base_weight: 0.0, territorial_bonus_eligible: false },
    BASIC:     { base_weight: 0.5, territorial_bonus_eligible: true },
    VERIFIED:  { base_weight: 1.0, territorial_bonus_eligible: true },
};

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
    };

    const normalized = normalizeRank(role) as "ANONYMOUS" | "BASIC" | "VERIFIED";

    // Herencia: ANONYMOUS → BASIC → VERIFIED
    Object.assign(base, ACM_PERMISSIONS["ANONYMOUS"]);
    if (normalized === "BASIC" || normalized === "VERIFIED") {
        Object.assign(base, ACM_PERMISSIONS["BASIC"]);
    }
    if (normalized === "VERIFIED") {
        Object.assign(base, ACM_PERMISSIONS["VERIFIED"]);
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
                    rank: normalizeRank(parsed.rank || "BASIC"),
                    role: parsed.role || "user",
                    is_verified: parsed.is_verified || false,
                    integrity_score: parsed.integrity_score || 0.5,
                });
            }
        } catch {
            // localStorage falla → ANONYMOUS
        }
    }, []);

    // Sync multi-tab
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === "beacon_user") {
                if (e.newValue) {
                    const parsed = JSON.parse(e.newValue);
                    setUser({
                        id: parsed.id,
                        email: parsed.email,
                        full_name: parsed.full_name,
                        rank: normalizeRank(parsed.rank || "BASIC"),
                        role: parsed.role || "user",
                        is_verified: parsed.is_verified || false,
                        integrity_score: parsed.integrity_score || 0.5,
                    });
                } else {
                    setUser({ id: null, email: null, full_name: null, rank: "ANONYMOUS", role: "user", is_verified: false, integrity_score: 0 });
                }
            }
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, []);

    const normalized = normalizeRank(user.rank) as "ANONYMOUS" | "BASIC" | "VERIFIED";
    const permissions = useMemo(() => resolvePermissions(user.rank), [user.rank]);
    const voting = useMemo(() => ACM_VOTING[normalized], [normalized]);

    const isAuthenticated = user.id !== null;
    const isVerified = normalized === "VERIFIED";
    const isBasic = normalized === "BASIC";
    const isAdmin = user.role === "admin";

    const openAuthModal = useCallback(() => {
        window.dispatchEvent(new CustomEvent("beacon:open-auth-modal"));
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("beacon_token");
        localStorage.removeItem("beacon_user");
        setUser({ id: null, email: null, full_name: null, rank: "ANONYMOUS", role: "user", is_verified: false, integrity_score: 0 });
    }, []);

    return {
        user,
        permissions,
        voting,
        rank: user.rank,
        isAuthenticated,
        isVerified,
        isBasic,
        isAdmin,
        shouldTriggerAuthModal: !isAuthenticated,
        openAuthModal,
        logout,
    };
}
