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
import { useAuthStore } from "@/store";

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
    region: string | null;
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

const ANON_STATE: UserState = {
    id: null, email: null, full_name: null,
    rank: "ANONYMOUS", role: "user", is_verified: false, integrity_score: 0, region: null,
};

export default function usePermissions(): PermissionsResult {
    const authUser = useAuthStore((state) => state.user);
    const clearAuth = useAuthStore((state) => state.clearAuth);

    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        setHydrated(true);
        // Verificar expiración del JWT al montar
        const token = localStorage.getItem("beacon_token");
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split(".")[1]));
                if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
                    localStorage.removeItem("beacon_token");
                    localStorage.removeItem("beacon_user");
                    clearAuth();
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent("beacon:session-expired"));
                    }, 300);
                }
            } catch { /* token malformado — ignorar */ }
        }
    }, [clearAuth]);

    const user: UserState = (hydrated && authUser) ? {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.full_name,
        rank: normalizeRank(authUser.rank),
        role: authUser.role || "user",
        is_verified: authUser.is_verified || false,
        integrity_score: authUser.integrity_score || 0.5,
        region: authUser.region ?? null,
    } : ANON_STATE;

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
        clearAuth();
        window.location.href = "/";
    }, [clearAuth]);

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
