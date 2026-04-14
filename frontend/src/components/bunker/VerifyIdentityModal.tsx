/**
 * BEACON PROTOCOL — VerifyIdentityModal (P5 v2)
 * ===============================================
 * Modal de verificación completa de identidad.
 * Recolecta RUT + birth_year + region + commune en un solo paso.
 * Flujo: PUT /profile → POST /verify-identity → rank VERIFIED
 */

"use client";

import { useState, useMemo } from "react";
import { useAuthStore } from "@/store";

// ─── Geografía Chile ─────────────────────────────────────────────────────────

const CHILE_REGIONS: Record<string, string[]> = {
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
};

const CURRENT_YEAR = new Date().getFullYear();

// ─── Utilidades RUT Módulo 11 ─────────────────────────────────────────────────

function cleanRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatRut(raw: string): string {
    const clean = cleanRut(raw);
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const reversed = body.split("").reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
    }
    return `${groups.reverse().join(".")}-${dv}`;
}

function validateRut(rut: string): boolean {
    const clean = cleanRut(rut);
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dvInput = clean.slice(-1).toUpperCase();
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = sum % 11;
    const dvExpected = remainder === 0 ? "0" : remainder === 1 ? "K" : String(11 - remainder);
    return dvInput === dvExpected;
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const INPUT_STYLE = {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
};

const INPUT_ERROR_STYLE = {
    border: "1px solid rgba(255,80,80,0.6)",
    background: "rgba(255,255,255,0.04)",
};

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function VerifyIdentityModal({ isOpen, onClose }: Props) {
    const { token, user, setAuth } = useAuthStore();

    const [rut, setRut] = useState("");
    const [birthYear, setBirthYear] = useState("");
    const [gender, setGender] = useState("");
    const [region, setRegion] = useState(user?.region ?? "");
    const [commune, setCommune] = useState(user?.commune ?? "");

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<{ new_rank: string; message: string } | null>(null);
    const [serverError, setServerError] = useState("");

    const communes = useMemo(() => CHILE_REGIONS[region] ?? [], [region]);

    if (!isOpen) return null;

    const handleRegionChange = (val: string) => {
        setRegion(val);
        setCommune("");
        setErrors((e) => ({ ...e, region: "", commune: "" }));
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!validateRut(rut)) newErrors.rut = "RUT inválido. Verifica el dígito verificador.";

        const year = parseInt(birthYear);
        if (!birthYear || isNaN(year) || year < 1920 || year > CURRENT_YEAR - 14) {
            newErrors.birthYear = `Ingresa un año válido (1920–${CURRENT_YEAR - 14}).`;
        }

        if (!gender) newErrors.gender = "Selecciona tu género.";
        if (!region) newErrors.region = "Selecciona tu región.";
        if (!commune) newErrors.commune = "Selecciona tu comuna.";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError("");
        if (!validate()) return;
        if (!token) {
            setServerError("Sesión expirada. Vuelve a iniciar sesión.");
            return;
        }

        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };

        try {
            // Paso 1 — actualizar perfil demográfico
            const profileRes = await fetch(`${apiUrl}/api/v1/user/auth/profile`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    birth_year: parseInt(birthYear),
                    gender,
                    country: "Chile",
                    region,
                    commune,
                }),
            });
            if (!profileRes.ok) {
                const d = await profileRes.json();
                setServerError(d.detail ?? "Error al guardar perfil.");
                return;
            }

            // Paso 2 — verificar RUT
            const rutRes = await fetch(`${apiUrl}/api/v1/user/auth/verify-identity`, {
                method: "POST",
                headers,
                body: JSON.stringify({ rut }),
            });
            const rutData = await rutRes.json();
            if (!rutRes.ok) {
                setServerError(rutData.detail ?? "Error al verificar RUT.");
                return;
            }

            // Actualizar store
            if (user) {
                const updatedUser = {
                    ...user,
                    rank: rutData.new_rank as typeof user.rank,
                    region,
                    commune,
                };
                setAuth(token, updatedUser);
                try { localStorage.setItem("beacon_user", JSON.stringify(updatedUser)); } catch { /* SSR */ }
            }

            setSuccess({ new_rank: rutData.new_rank, message: rutData.message });
            setTimeout(() => {
                setSuccess(null);
                setRut("");
                setBirthYear("");
                onClose();
            }, 3500);

        } catch {
            setServerError("Error de conexión. Intenta más tarde.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRut(""); setBirthYear(""); setGender(""); setErrors({}); setServerError(""); setSuccess(null);
        onClose();
    };

    const inputClass = "w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-all";
    const labelClass = "block text-xs font-medium text-foreground-muted mb-1 uppercase tracking-wider";

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}
            onClick={handleClose}
        >
            <div
                className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
                style={{
                    background: "rgba(10,10,10,0.97)",
                    border: "1px solid rgba(212,175,55,0.25)",
                    boxShadow: "0 0 40px rgba(212,175,55,0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cerrar */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-5 text-foreground-muted hover:text-foreground text-xl transition-colors"
                    aria-label="Cerrar"
                >
                    ×
                </button>

                {/* ── Estado: éxito ── */}
                {success ? (
                    <div className="text-center py-6">
                        <div className="text-5xl mb-4">✅</div>
                        <h2 className="text-xl font-bold text-white mb-2">
                            {success.new_rank === "VERIFIED" ? "¡Identidad Verificada!" : "RUT registrado"}
                        </h2>
                        <p className="text-sm text-foreground-muted mb-2">{success.message}</p>
                        {success.new_rank === "VERIFIED" && (
                            <p className="text-sm font-semibold" style={{ color: "#4dff83" }}>
                                Tu voto ahora vale <strong>1.0x</strong> 🎉
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="text-center mb-6">
                            <div className="text-4xl mb-3">🔏</div>
                            <h2 className="text-xl font-bold text-white">Verificar Identidad</h2>
                            <p className="text-xs text-foreground-muted mt-1">
                                Completa tus datos para obtener rango <span style={{ color: "#4dff83" }}>VERIFIED</span> y voto con peso <strong>1.0x</strong>.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">

                            {/* RUT */}
                            <div>
                                <label className={labelClass}>RUT chileno *</label>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => { setRut(formatRut(e.target.value)); setErrors((err) => ({ ...err, rut: "" })); }}
                                    placeholder="12.345.678-9"
                                    maxLength={12}
                                    className={`${inputClass} font-mono`}
                                    style={errors.rut ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                    autoComplete="off"
                                    autoFocus
                                />
                                {/* Validación en tiempo real */}
                                {rut.length >= 3 && (
                                    <p className="text-xs mt-1 font-semibold" style={{ color: validateRut(rut) ? "#4dff83" : "#ff5050" }}>
                                        {validateRut(rut) ? "✓ RUT válido" : "✗ RUT inválido — verifica el dígito verificador"}
                                    </p>
                                )}
                                {!rut && <p className="text-[10px] text-foreground-muted mt-1">
                                    Almacenado como hash SHA-256 irreversible. Nunca lo vemos en texto plano.
                                </p>}
                            </div>

                            {/* Año de nacimiento */}
                            <div>
                                <label className={labelClass}>Año de nacimiento *</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={birthYear}
                                    onChange={(e) => { setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4)); setErrors((err) => ({ ...err, birthYear: "" })); }}
                                    placeholder="1990"
                                    maxLength={4}
                                    className={inputClass}
                                    style={errors.birthYear ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                />
                                {errors.birthYear && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.birthYear}</p>}
                            </div>

                            {/* Género */}
                            <div>
                                <label className={labelClass}>Género *</label>
                                <select
                                    value={gender}
                                    onChange={(e) => { setGender(e.target.value); setErrors((err) => ({ ...err, gender: "" })); }}
                                    className={inputClass}
                                    style={errors.gender ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>Selecciona género</option>
                                    <option value="Masculino" style={{ background: "#0a0a0a", color: "white" }}>Masculino</option>
                                    <option value="Femenino" style={{ background: "#0a0a0a", color: "white" }}>Femenino</option>
                                    <option value="No binario" style={{ background: "#0a0a0a", color: "white" }}>No binario</option>
                                    <option value="Prefiero no decir" style={{ background: "#0a0a0a", color: "white" }}>Prefiero no decir</option>
                                </select>
                                {errors.gender && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.gender}</p>}
                            </div>

                            {/* País */}
                            <div>
                                <label className={labelClass}>País *</label>
                                <input
                                    type="text"
                                    value="Chile"
                                    readOnly
                                    className={inputClass}
                                    style={{ ...INPUT_STYLE, opacity: 0.5, cursor: "default" }}
                                />
                            </div>

                            {/* Región */}
                            <div>
                                <label className={labelClass}>Región *</label>
                                <select
                                    value={region}
                                    onChange={(e) => handleRegionChange(e.target.value)}
                                    className={inputClass}
                                    style={errors.region ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>Selecciona región</option>
                                    {Object.keys(CHILE_REGIONS).map((r) => (
                                        <option key={r} value={r} style={{ background: "#0a0a0a", color: "white" }}>{r}</option>
                                    ))}
                                </select>
                                {errors.region && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.region}</p>}
                            </div>

                            {/* Comuna */}
                            <div>
                                <label className={labelClass}>Comuna *</label>
                                <select
                                    value={commune}
                                    onChange={(e) => { setCommune(e.target.value); setErrors((err) => ({ ...err, commune: "" })); }}
                                    disabled={!region}
                                    className={inputClass}
                                    style={errors.commune ? INPUT_ERROR_STYLE : { ...INPUT_STYLE, opacity: !region ? 0.4 : 1 }}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>{region ? "Selecciona comuna" : "Primero elige región"}</option>
                                    {communes.map((c) => (
                                        <option key={c} value={c} style={{ background: "#0a0a0a", color: "white" }}>{c}</option>
                                    ))}
                                </select>
                                {errors.commune && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.commune}</p>}
                            </div>

                            {serverError && (
                                <p className="text-xs text-center py-2 px-3 rounded-lg" style={{ color: "#ff5050", background: "rgba(255,80,80,0.08)" }}>
                                    {serverError}
                                </p>
                            )}

                            <p className="text-[10px] text-foreground-muted text-center">
                                Al verificar aceptas que BEACON almacene tu hash de identidad para prevenir votos duplicados.
                            </p>

                            <button
                                type="submit"
                                disabled={loading || !rut || !birthYear || !region || !commune}
                                className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                style={{
                                    background: "linear-gradient(135deg, #D4AF37, #B8860B)",
                                    color: "#0a0a0a",
                                }}
                            >
                                {loading ? "Verificando..." : "Verificar Identidad"}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
