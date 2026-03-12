/**
 * BEACON PROTOCOL — Perfil del Ciudadano
 * =======================================
 * Página de gestión de datos personales y verificación de identidad.
 *
 * Secciones:
 *   1. Datos Básicos (read-only): email, rango, fecha de registro
 *   2. Datos Demográficos (editable): país → región → comuna, rango etario
 *      → PUT /api/v1/user/auth/profile
 *   3. Verificación de Identidad (opcional): año de nacimiento + RUT
 *      → PUT /api/v1/user/auth/profile (birth_year)
 *      → POST /api/v1/user/auth/verify-identity (rut)
 *
 * Completar sección 3 + datos demográficos → ascenso automático a VERIFIED.
 *
 * "La integridad no se declara. Se demuestra, campo por campo."
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════
//  DATOS GEOGRÁFICOS (País → Región → Comuna)
// ═══════════════════════════════════════════

const GEOGRAPHY: Record<string, Record<string, string[]>> = {
    Chile: {
        "Arica y Parinacota": ["Arica", "Camarones", "Putre", "General Lagos"],
        "Tarapacá": ["Iquique", "Alto Hospicio", "Pozo Almonte", "Pica", "Huara"],
        "Antofagasta": ["Antofagasta", "Calama", "Mejillones", "Tocopilla", "San Pedro de Atacama"],
        "Atacama": ["Copiapó", "Vallenar", "Caldera", "Chañaral", "Tierra Amarilla"],
        "Coquimbo": ["La Serena", "Coquimbo", "Ovalle", "Illapel", "Vicuña"],
        "Valparaíso": ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio", "Quillota", "La Calera"],
        "Metropolitana": [
            "Santiago", "Providencia", "Las Condes", "Ñuñoa", "La Florida",
            "Maipú", "Puente Alto", "Vitacura", "Lo Barnechea", "Peñalolén",
            "La Reina", "Macul", "San Miguel", "San Bernardo", "Recoleta",
            "Independencia", "Estación Central", "Cerrillos", "Quilicura",
        ],
        "O'Higgins": ["Rancagua", "San Fernando", "Rengo", "Machalí", "Graneros"],
        "Maule": ["Talca", "Curicó", "Linares", "Constitución", "Cauquenes"],
        "Ñuble": ["Chillán", "San Carlos", "Bulnes", "Quirihue"],
        "Biobío": ["Concepción", "Los Ángeles", "Chiguayante", "Talcahuano", "Coronel", "Hualpén"],
        "La Araucanía": ["Temuco", "Padre Las Casas", "Villarrica", "Angol", "Pucón"],
        "Los Ríos": ["Valdivia", "La Unión", "Panguipulli", "Río Bueno"],
        "Los Lagos": ["Puerto Montt", "Osorno", "Castro", "Puerto Varas", "Ancud"],
        "Aysén": ["Coyhaique", "Puerto Aysén", "Chile Chico"],
        "Magallanes": ["Punta Arenas", "Puerto Natales", "Porvenir"],
    },
};

const COUNTRIES = Object.keys(GEOGRAPHY);

// ═══════════════════════════════════════════
//  VALIDACIÓN RUT MÓDULO 11
// ═══════════════════════════════════════════

function cleanRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatRutMask(raw: string): string {
    const clean = cleanRut(raw);
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const reversed = body.split("").reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
    }
    return `${groups.reverse().join(".")}-${dv}`;
}

function validateRutMod11(rut: string): boolean {
    const clean = cleanRut(rut);
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = 11 - (sum % 11);
    let expectedDV: string;
    if (remainder === 11) expectedDV = "0";
    else if (remainder === 10) expectedDV = "K";
    else expectedDV = remainder.toString();
    return dv === expectedDV;
}

// ═══════════════════════════════════════════
//  TIPOS
// ═══════════════════════════════════════════

interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    rank: string;
    integrity_score: number;
    is_verified: boolean;
    country?: string;
    region?: string;
    commune?: string;
    age_range?: string;
}

// ═══════════════════════════════════════════
//  BADGE DE RANGO
// ═══════════════════════════════════════════

function RankBadge({ rank }: { rank: string }) {
    const GOLD = "#D4AF37";
    const CYAN = "#00E5FF";
    const color = rank === "VERIFIED" ? GOLD : CYAN;
    const label = rank === "VERIFIED" ? "✓ VERIFIED" : "BASIC";
    return (
        <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase"
            style={{
                border: `1px solid ${color}40`,
                color,
                backgroundColor: `${color}10`,
            }}
        >
            {label}
        </span>
    );
}

// ═══════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ═══════════════════════════════════════════

export default function ProfilePage() {
    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    const CYAN = "#00E5FF";
    const GOLD = "#D4AF37";
    const RED = "#FF073A";
    const GREEN = "#00FF87";

    // ─── Auth ───
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // ─── Datos demográficos ───
    const [country, setCountry] = useState("");
    const [region, setRegion] = useState("");
    const [commune, setCommune] = useState("");
    const [ageRange, setAgeRange] = useState("");
    const [demoSaving, setDemoSaving] = useState(false);
    const [demoMsg, setDemoMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // ─── Verificación ───
    const [birthYear, setBirthYear] = useState("");
    const [rutRaw, setRutRaw] = useState("");
    const [rutClean, setRutClean] = useState("");
    const [rutValid, setRutValid] = useState<boolean | null>(null);
    const [verifySaving, setVerifySaving] = useState(false);
    const [verifyMsg, setVerifyMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Cascada
    const availableRegiones = useMemo(() => Object.keys(GEOGRAPHY[country] || {}), [country]);
    const availableCommunas = useMemo(() => GEOGRAPHY[country]?.[region] || [], [country, region]);

    useEffect(() => { setRegion(""); setCommune(""); }, [country]);
    useEffect(() => { setCommune(""); }, [region]);

    // ─── Máscara RUT ───
    const handleRutChange = useCallback((value: string) => {
        const clean = cleanRut(value);
        if (clean.length > 9) return;
        setRutClean(clean);
        if (clean.length >= 2) {
            setRutRaw(formatRutMask(clean));
            setRutValid(validateRutMod11(clean));
        } else {
            setRutRaw(clean);
            setRutValid(null);
        }
    }, []);

    // ─── Cargar sesión ───
    useEffect(() => {
        const storedToken = localStorage.getItem("beacon_token");
        const storedUser = localStorage.getItem("beacon_user");
        if (!storedToken || !storedUser) {
            router.replace("/");
            return;
        }
        try {
            const parsed: UserProfile = JSON.parse(storedUser);
            setToken(storedToken);
            setUser(parsed);
            // Pre-llenar campos con datos existentes
            setCountry(parsed.country || "Chile");
            setRegion(parsed.region || "");
            setCommune(parsed.commune || "");
            setAgeRange(parsed.age_range || "");
        } catch {
            router.replace("/");
        } finally {
            setLoading(false);
        }
    }, [router]);

    // Validación año de nacimiento
    const birthYearNum = parseInt(birthYear, 10);
    const birthYearValid = birthYear.length === 4 && birthYearNum >= 1920 && birthYearNum <= 2010;

    // ─── Guardar demográficos ───
    const handleSaveDemographic = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setDemoSaving(true);
        setDemoMsg(null);
        try {
            const res = await fetch(`${API_URL}/api/v1/user/auth/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    country: country || undefined,
                    region: region || undefined,
                    commune: commune || undefined,
                    age_range: ageRange || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al guardar");
            setDemoMsg({ type: "success", text: "✓ Datos demográficos actualizados correctamente." });
            // Actualizar localStorage
            const updated = { ...user, country, region, commune, age_range: ageRange };
            localStorage.setItem("beacon_user", JSON.stringify(updated));
            setUser(updated as UserProfile);
        } catch (err: unknown) {
            setDemoMsg({ type: "error", text: err instanceof Error ? err.message : "Error desconocido" });
        } finally {
            setDemoSaving(false);
        }
    };

    // ─── Guardar verificación (birth_year + RUT) ───
    const handleSaveVerification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        // Validaciones previas
        if (birthYear && !birthYearValid) {
            setVerifyMsg({ type: "error", text: "Ingresa un año de nacimiento válido (1920–2010)." });
            return;
        }
        if (rutClean.length > 0 && !rutValid) {
            setVerifyMsg({ type: "error", text: "El RUT ingresado no es válido (dígito verificador incorrecto)." });
            return;
        }

        setVerifySaving(true);
        setVerifyMsg(null);

        try {
            // 1) Guardar birth_year en el perfil (si se proporcionó)
            if (birthYear && birthYearValid) {
                const res = await fetch(`${API_URL}/api/v1/user/auth/profile`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ birth_year: birthYearNum }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error al guardar año de nacimiento");
                }
            }

            // 2) Verificar RUT (si se proporcionó y es válido)
            if (rutClean.length > 0 && rutValid) {
                const res = await fetch(`${API_URL}/api/v1/user/auth/verify-identity`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ rut: rutClean }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || "Error al verificar RUT");

                // Actualizar rango si ascendió
                if (data.new_rank) {
                    const updated = { ...user, rank: data.new_rank, is_verified: true };
                    localStorage.setItem("beacon_user", JSON.stringify(updated));
                    setUser(updated as UserProfile);
                    setVerifyMsg({
                        type: "success",
                        text: data.new_rank === "VERIFIED"
                            ? "🏆 ¡Ascendiste a VERIFIED! Tu voto ahora tiene mayor peso."
                            : "✓ RUT verificado correctamente.",
                    });
                    return;
                }
            }

            setVerifyMsg({ type: "success", text: "✓ Datos de verificación guardados." });
        } catch (err: unknown) {
            setVerifyMsg({ type: "error", text: err instanceof Error ? err.message : "Error desconocido" });
        } finally {
            setVerifySaving(false);
        }
    };

    // ─── Loading ───
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
                <p className="text-gray-500 font-mono text-sm">Cargando perfil...</p>
            </div>
        );
    }

    if (!user) return null;

    const inputClass = "w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 bg-transparent";
    const inputStyle = (active?: boolean): React.CSSProperties => ({
        border: `1px solid ${active ? `${CYAN}50` : "rgba(255,255,255,0.1)"}`,
        backgroundColor: "#0F0F0F",
        caretColor: CYAN,
    });
    const selectStyle = (hasValue?: boolean): React.CSSProperties => ({
        backgroundColor: "#0F0F0F",
        border: `1px solid ${hasValue ? `${CYAN}30` : "rgba(255,255,255,0.1)"}`,
    });
    const labelClass = "block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1";
    const sectionClass = "rounded-xl p-6 mb-6";

    return (
        <div className="min-h-screen py-12 px-4" style={{ background: "#0A0A0A" }}>
            <div className="max-w-2xl mx-auto">

                {/* ─── Header ─── */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-wide">Mi Perfil</h1>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mt-0.5">
                            Ciudadano Beacon · Gestión de Identidad
                        </p>
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="text-[10px] font-mono text-gray-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg"
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                        ← Volver
                    </button>
                </div>

                {/* ═══════════════════════════════════
                    SECCIÓN 1 — DATOS BÁSICOS (read-only)
                ═══════════════════════════════════ */}
                <div className={sectionClass} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <h2 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>
                        Datos de la Cuenta
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className={labelClass}>Email</p>
                            <p className="text-sm text-white font-mono truncate">{user.email}</p>
                        </div>
                        <div>
                            <p className={labelClass}>Nombre</p>
                            <p className="text-sm text-white font-mono">{user.full_name}</p>
                        </div>
                        <div>
                            <p className={labelClass}>Rango</p>
                            <RankBadge rank={user.rank} />
                        </div>
                        <div>
                            <p className={labelClass}>Integridad</p>
                            <p className="text-sm font-mono" style={{ color: GOLD }}>
                                {(user.integrity_score * 100).toFixed(0)}%
                            </p>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════
                    SECCIÓN 2 — DATOS DEMOGRÁFICOS
                ═══════════════════════════════════ */}
                <div className={sectionClass} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
                            Datos Demográficos
                        </h2>
                        <span className="text-[9px] font-mono text-gray-500">
                            Requeridos para verificación
                        </span>
                    </div>

                    <form onSubmit={handleSaveDemographic} className="space-y-4">

                        {/* País */}
                        <div>
                            <label className={labelClass}>País *</label>
                            <select
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                required
                                className={`${inputClass} appearance-none`}
                                style={selectStyle(!!country)}
                            >
                                <option value="">Seleccionar</option>
                                {COUNTRIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Región + Comuna en cascada */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Región *</label>
                                <select
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    required
                                    disabled={!country}
                                    className={`${inputClass} appearance-none disabled:opacity-40`}
                                    style={selectStyle(!!region)}
                                >
                                    <option value="">{country ? "Seleccionar" : "Elige país"}</option>
                                    {availableRegiones.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Comuna *</label>
                                <select
                                    value={commune}
                                    onChange={(e) => setCommune(e.target.value)}
                                    required
                                    disabled={!region}
                                    className={`${inputClass} appearance-none disabled:opacity-40`}
                                    style={selectStyle(!!commune)}
                                >
                                    <option value="">{region ? "Seleccionar" : "Elige región"}</option>
                                    {availableCommunas.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Rango Etario */}
                        <div>
                            <label className={labelClass}>Rango Etario *</label>
                            <select
                                value={ageRange}
                                onChange={(e) => setAgeRange(e.target.value)}
                                required
                                className={`${inputClass} appearance-none`}
                                style={selectStyle(!!ageRange)}
                            >
                                <option value="">Seleccionar</option>
                                <option value="18-24">18 – 24</option>
                                <option value="25-34">25 – 34</option>
                                <option value="35-44">35 – 44</option>
                                <option value="45-54">45 – 54</option>
                                <option value="55-64">55 – 64</option>
                                <option value="65+">65+</option>
                            </select>
                        </div>

                        {/* Feedback */}
                        {demoMsg && (
                            <p
                                className="text-[10px] font-mono px-3 py-2 rounded-lg"
                                style={{
                                    color: demoMsg.type === "success" ? GREEN : RED,
                                    backgroundColor: demoMsg.type === "success" ? `${GREEN}10` : `${RED}10`,
                                    border: `1px solid ${demoMsg.type === "success" ? `${GREEN}25` : `${RED}25`}`,
                                }}
                            >
                                {demoMsg.text}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={demoSaving || !country || !region || !commune || !ageRange}
                            className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                                background: `linear-gradient(135deg, ${CYAN}80, #1a6b7a)`,
                                border: `1px solid ${CYAN}30`,
                            }}
                        >
                            {demoSaving ? "Guardando..." : "Guardar Datos Demográficos"}
                        </button>
                    </form>
                </div>

                {/* ═══════════════════════════════════
                    SECCIÓN 3 — VERIFICACIÓN DE IDENTIDAD
                ═══════════════════════════════════ */}
                <div
                    className={sectionClass}
                    style={{
                        background: user.is_verified
                            ? `rgba(212,175,55,0.04)`
                            : "rgba(255,255,255,0.03)",
                        border: `1px solid ${user.is_verified ? `${GOLD}30` : "rgba(255,255,255,0.06)"}`,
                    }}
                >
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                            Verificación de Identidad
                        </h2>
                        {user.is_verified && (
                            <span className="text-[9px] font-mono" style={{ color: GOLD }}>✓ Identidad verificada</span>
                        )}
                    </div>
                    <p className="text-[9px] text-gray-500 font-mono mb-5">
                        Completa estos datos junto a los demográficos para ascender a VERIFIED y aumentar el peso de tu voto.
                    </p>

                    <form onSubmit={handleSaveVerification} className="space-y-4">

                        {/* Año de Nacimiento */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: GOLD }}>
                                Año de Nacimiento
                                <span className="ml-1 text-[9px] normal-case text-gray-500">(opcional — requerido para VERIFIED)</span>
                            </label>
                            <input
                                type="number"
                                placeholder="ej: 1990"
                                value={birthYear}
                                onChange={(e) => setBirthYear(e.target.value)}
                                min={1920}
                                max={2010}
                                className={inputClass}
                                style={{
                                    backgroundColor: "#0F0F0F",
                                    border: `1px solid ${
                                        birthYear.length === 0
                                            ? "rgba(255,255,255,0.1)"
                                            : birthYearValid
                                                ? `${GOLD}40`
                                                : "rgba(255,100,100,0.4)"
                                    }`,
                                }}
                            />
                            {birthYear.length > 0 && !birthYearValid && (
                                <p className="text-[9px] mt-1 font-mono" style={{ color: RED }}>
                                    Ingresa un año entre 1920 y 2010
                                </p>
                            )}
                        </div>

                        {/* RUT con máscara Módulo 11 */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: GOLD }}>
                                RUT
                                <span className="ml-1 text-[9px] normal-case text-gray-500">(opcional — requerido para VERIFIED)</span>
                            </label>
                            <input
                                type="text"
                                value={rutRaw}
                                onChange={(e) => handleRutChange(e.target.value)}
                                placeholder="12.345.678-5"
                                maxLength={12}
                                disabled={user.is_verified}
                                className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                                style={{
                                    backgroundColor: "#0F0F0F",
                                    caretColor: GOLD,
                                    border: `1px solid ${
                                        rutValid === null
                                            ? "rgba(255,255,255,0.1)"
                                            : rutValid
                                                ? `${GOLD}60`
                                                : `${RED}60`
                                    }`,
                                    boxShadow: rutValid === true ? `0 0 10px ${GOLD}20` : "none",
                                }}
                            />
                            {user.is_verified ? (
                                <p className="text-[9px] mt-1 font-mono" style={{ color: GOLD }}>
                                    ✓ RUT ya verificado — no se puede modificar
                                </p>
                            ) : rutClean.length >= 2 ? (
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rutValid ? GOLD : RED }} />
                                    <span className="text-[9px] font-mono" style={{ color: rutValid ? GOLD : RED }}>
                                        {rutValid
                                            ? `Módulo 11 válido — ${rutRaw}`
                                            : "RUT no válido — dígito verificador incorrecto"}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        {/* Progreso hacia VERIFIED */}
                        {!user.is_verified && (
                            <div
                                className="px-3 py-2.5 rounded-lg text-[9px] font-mono"
                                style={{
                                    backgroundColor: `${GOLD}08`,
                                    border: `1px solid ${GOLD}20`,
                                    color: "#aaa",
                                    lineHeight: "1.7",
                                }}
                            >
                                <p className="font-bold mb-1" style={{ color: GOLD }}>Requisitos para VERIFIED:</p>
                                <p>{country && region && commune ? "✓" : "○"} País + Región + Comuna</p>
                                <p>{ageRange ? "✓" : "○"} Rango etario</p>
                                <p>{birthYearValid ? "✓" : "○"} Año de nacimiento</p>
                                <p>{user.is_verified ? "✓" : rutValid ? "✓" : "○"} RUT válido</p>
                            </div>
                        )}

                        {/* Feedback */}
                        {verifyMsg && (
                            <p
                                className="text-[10px] font-mono px-3 py-2 rounded-lg"
                                style={{
                                    color: verifyMsg.type === "success" ? GREEN : RED,
                                    backgroundColor: verifyMsg.type === "success" ? `${GREEN}10` : `${RED}10`,
                                    border: `1px solid ${verifyMsg.type === "success" ? `${GREEN}25` : `${RED}25`}`,
                                }}
                            >
                                {verifyMsg.text}
                            </p>
                        )}

                        {!user.is_verified && (
                            <button
                                type="submit"
                                disabled={verifySaving || (!birthYear && !rutClean)}
                                className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`,
                                    color: "#0A0A0A",
                                    boxShadow: `0 0 20px ${GOLD}20`,
                                }}
                            >
                                {verifySaving ? "Verificando..." : "Guardar Verificación"}
                            </button>
                        )}
                    </form>
                </div>

            </div>
        </div>
    );
}
