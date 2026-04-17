/**
 * BEACON PROTOCOL — /encuestas/[id]
 * ====================================
 * Detalle de encuesta con imagen, multi-pregunta, votación, QR inline y share social.
 */

"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";
import { useAuthStore } from "@/store";
import { useBeaconPulse } from "@/hooks/useBeaconPulse";
import usePermissions from "@/hooks/usePermissions";
import PollCommentsSection from "@/components/polls/PollCommentsSection";
import ImageDownloadModal from "@/components/polls/ImageDownloadModal";
import { Lock, BadgeCheck } from "lucide-react";

// ─── Logos de redes sociales ──────────────────────────────────────────────────
import logoWhatsapp from "@/asset/logos/whatsapp.png";
import logoX from "@/asset/logos/x.png";
import logoTelegram from "@/asset/logos/telegrama.png";
import logoFacebook from "@/asset/logos/facebook.png";
import logoInstagram from "@/asset/logos/instagram.png";
import logoTiktok from "@/asset/logos/tik-tok.png";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface QuestionDef {
  id: string;
  text: string;
  type: "multiple_choice" | "scale";
  allow_multiple?: boolean;   // true = checkboxes, false/undefined = radio
  options: string[] | null;
  scale_min?: number;
  scale_max?: number;
  scale_points?: number;        // 2-10: número de puntos en la escala
  scale_min_label?: string;
  scale_max_label?: string;
  scale_labels?: string[];      // etiquetas para cada punto de la escala
  order_index?: number;
}

interface PollResult {
  option?: string;
  count?: number;
  pct?: number;
  average?: number;
}

// ─── Cross-tabs ────────────────────────────────────────────────────────────────

type CrossTabDimension = "region" | "commune" | "age" | "country";

interface CrossTabBreakdown {
  option?: string;
  count: number;
  pct?: number;
  average?: number;
}

interface CrossTabGroup {
  group: string;
  n: number;
  breakdown: CrossTabBreakdown[];
  average?: number;  // solo para preguntas de escala
}

interface CrossTabData {
  poll_id: string;
  dimension: CrossTabDimension;
  question_index: number;
  total_verified_votes: number;
  suppressed_groups: number;
  min_group_size: number;
  results: CrossTabGroup[];
}

interface QuestionResults {
  question_id: string;
  question_text: string;
  question_type: "multiple_choice" | "scale";
  total_votes: number;
  results: PollResult[];
}

interface Poll {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  context: string | null;       // texto contextual visible en la página
  source_url: string | null;    // fuente de origen
  tags: string[];
  header_image: string | null;
  poll_type: "multiple_choice" | "scale";
  options: string[] | null;
  scale_min: number;
  scale_max: number;
  scale_min_label?: string;   // etiqueta semántica del extremo inferior
  scale_max_label?: string;   // etiqueta semántica del extremo superior
  starts_at: string;
  ends_at: string;
  is_open: boolean;
  status: "draft" | "active" | "paused" | "closed";
  is_featured: boolean;
  total_votes: number;
  verified_votes: number;
  basic_votes: number;
  results: PollResult[];
  results_verified: PollResult[];
  results_by_question?: QuestionResults[];
  results_verified_by_question?: QuestionResults[];
  questions: QuestionDef[] | null;
  category: string;
  requires_auth: boolean;
  is_private?: boolean;
  user_vote?: string | null;  // voto previo del usuario autenticado (desde el backend)
}

const CATEGORY_LABELS: Record<string, string> = {
  politica: "Política", economia: "Economía", salud: "Salud",
  educacion: "Educación", espectaculos: "Espectáculos", deporte: "Deporte",
  cultura: "Cultura", general: "General",
};

function getOrCreateAnonSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("beacon_anon_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("beacon_anon_id", id);
  }
  return id;
}

interface EncuestaPageProps {
  params: Promise<{ id: string }>;   // Next.js captura el segmento como "id" (folder [id])
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateHour(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Post-Vote Card (momento de orgullo) ─────────────────────────────────────

function PostVoteCard({
  isVerified,
  totalVotes,
  pollTitle,
  pageUrl,
  onReveal,
}: {
  isVerified: boolean;
  totalVotes: number;
  pollTitle: string;
  pageUrl: string;
  onReveal: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const postVoteText = `Acabo de votar en Beacon Chile: "${pollTitle}". ¡Tú también puedes hacerlo, anímate! #ChileOpina #BeaconChile`;
  // URL con ?resultado=1 para que la OG preview muestre la imagen de resultados
  const shareUrl = `${pageUrl}?resultado=1`;

  function handleShare() {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(postVoteText + " " + shareUrl)}`;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const canNativeShare = isMobile && typeof navigator !== "undefined" && typeof navigator.share === "function";
    if (canNativeShare) {
      navigator.share({ title: pollTitle, text: postVoteText, url: shareUrl }).catch(() => {
        window.open(waUrl, "_blank", "noopener");
      });
    } else {
      window.open(waUrl, "_blank", "noopener");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(`${postVoteText} ${shareUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const nLabel =
    totalVotes === 1
      ? "1 ciudadano real"
      : `${totalVotes.toLocaleString("es-CL")} ciudadanos reales`;

  return (
    <div
      style={{
        borderRadius: 18,
        padding: "28px 24px",
        marginBottom: 20,
        background: isVerified
          ? "rgba(0, 229, 255, 0.04)"
          : "rgba(212, 175, 55, 0.04)",
        border: `1px solid ${isVerified ? "rgba(0,229,255,0.2)" : "rgba(212,175,55,0.2)"}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      {/* Check animado */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(57,255,20,0.1)",
          border: "2px solid rgba(57,255,20,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
        }}
      >
        ✅
      </div>

      {/* Título */}
      <p style={{ fontSize: 16, fontWeight: 800, color: "#f5f5f5", margin: 0, lineHeight: 1.3 }}>
        Tu voto fue registrado
      </p>

      {/* Copy diferenciado por rango */}
      {isVerified ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 13, color: "#00E5FF", fontWeight: 600, margin: 0 }}>
            Eres parte de los {nLabel} que opinaron.
          </p>
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
            Tu voz cuenta al 100% en las estadísticas verificadas de Chile.{"\n"}
            Sin panel seleccionado. Sin bots. Tú mismo.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.6 }}>
            Tu opinión aparece en el conteo público.{"\n"}
            Para que cuente en los informes verificados:
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("beacon:open-verify-modal"))}
            style={{
              fontSize: 11, fontFamily: "monospace", fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#D4AF37", background: "rgba(212,175,55,0.12)",
              border: "1px solid rgba(212,175,55,0.35)",
              borderRadius: 8, padding: "7px 16px", cursor: "pointer",
              alignSelf: "center",
            }}
          >
            Verificar identidad →
          </button>
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", width: "100%", marginTop: 4 }}>
        <button
          onClick={handleShare}
          style={{
            flex: 1,
            minWidth: 130,
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            background: isVerified ? "rgba(0,229,255,0.12)" : "rgba(212,175,55,0.12)",
            border: `1px solid ${isVerified ? "rgba(0,229,255,0.35)" : "rgba(212,175,55,0.35)"}`,
            color: isVerified ? "#00E5FF" : "#D4AF37",
            cursor: "pointer",
          }}
        >
          Compartir →
        </button>

        <button
          onClick={onReveal}
          style={{
            flex: 1,
            minWidth: 130,
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
          }}
        >
          Ver resultados
        </button>
      </div>

      {/* Copy link discreto */}
      <button
        onClick={handleCopy}
        style={{
          fontSize: 10,
          fontFamily: "monospace",
          background: "none",
          border: "none",
          color: copied ? "#39FF14" : "rgba(255,255,255,0.25)",
          cursor: "pointer",
          letterSpacing: "0.06em",
        }}
      >
        {copied ? "✓ Link copiado" : "🔗 Copiar link"}
      </button>
    </div>
  );
}

// ─── Share Modal ─────────────────────────────────────────────────────────────

function SocialShareBar({
  url,
  title,
  mode = "pre-vote",
  totalVotes = 0,
}: {
  url: string;
  title: string;
  mode?: "pre-vote" | "post-vote";
  totalVotes?: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [toastNet,  setToastNet]  = useState<string | null>(null);

  const shareText =
    mode === "post-vote"
      ? `Acabo de votar en Beacon Chile: "${title}". ¡Tú también puedes hacerlo, anímate! #ChileOpina #BeaconChile`
      : totalVotes > 0
      ? `¿Qué piensas sobre "${title}"? ${totalVotes.toLocaleString("es-CL")} ciudadanos ya votaron en Beacon Chile →`
      : `¿Qué piensas sobre "${title}"? Vota en Beacon Chile →`;

  const text   = encodeURIComponent(shareText);
  const encUrl = encodeURIComponent(url);

  const networks = [
    { id: "whatsapp",  label: "WhatsApp",  logo: logoWhatsapp,  color: "#25D366", href: `https://wa.me/?text=${text}%20${encUrl}` },
    { id: "twitter",   label: "X",          logo: logoX,          color: "#ffffff", href: `https://twitter.com/intent/tweet?text=${text}&url=${encUrl}` },
    { id: "telegram",  label: "Telegram",   logo: logoTelegram,   color: "#229ED9", href: `https://t.me/share/url?url=${encUrl}&text=${text}` },
    { id: "facebook",  label: "Facebook",   logo: logoFacebook,   color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}` },
    { id: "instagram", label: "Instagram",  logo: logoInstagram,  color: "#E1306C", href: null },
    { id: "tiktok",    label: "TikTok",     logo: logoTiktok,     color: "#EE1D52", href: null },
  ];

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 768;
  const canNativeShare =
    isMobile &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  function handleMainButton() {
    if (canNativeShare) {
      navigator.share({ title, text: shareText, url }).catch(() => {
        setShowModal(true);
      });
    } else {
      setShowModal(true);
    }
  }

  function copyLink(network?: string) {
    navigator.clipboard.writeText(`${shareText} ${url}`).then(() => {
      if (network) {
        setToastNet(network);
        setTimeout(() => setToastNet(null), 3500);
      } else {
        setCopied(true);
        setTimeout(() => { setCopied(false); setShowModal(false); }, 2000);
      }
    });
  }

  return (
    <>
      {/* ── CTA principal ── */}
      <button
        onClick={handleMainButton}
        style={{
          width: "100%",
          padding: "9px 16px",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "monospace",
          letterSpacing: "0.06em",
          background: "rgba(0,229,255,0.08)",
          border: "1px solid rgba(0,229,255,0.28)",
          color: "#00E5FF",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>↗</span>
        Compartir encuesta
      </button>

      {/* ── Modal de compartir ── */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0c0c1a",
              border: "1px solid rgba(0,229,255,0.18)",
              borderRadius: 16,
              padding: "28px 24px 24px",
              width: "100%",
              maxWidth: 360,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.04em" }}>
                Compartir encuesta
              </p>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Grid de redes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {networks.map((n) =>
                n.href ? (
                  <a
                    key={n.id}
                    href={n.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowModal(false)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "14px 8px",
                      borderRadius: 12,
                      background: `${n.color}12`,
                      border: `1px solid ${n.color}30`,
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Image src={n.logo} alt={n.label} width={26} height={26} style={{ objectFit: "contain" }} />
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
                      {n.label}
                    </span>
                  </a>
                ) : (
                  /* Instagram / TikTok → copia y muestra toast */
                  <button
                    key={n.id}
                    onClick={() => copyLink(n.label)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "14px 8px",
                      borderRadius: 12,
                      background: `${n.color}12`,
                      border: `1px solid ${n.color}30`,
                      cursor: "pointer",
                    }}
                  >
                    <Image src={n.logo} alt={n.label} width={26} height={26} style={{ objectFit: "contain" }} />
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
                      {n.label}
                    </span>
                  </button>
                )
              )}
            </div>

            {/* Toast Instagram / TikTok (dentro del modal) */}
            {toastNet && (
              <div style={{ background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.35)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#39FF14" }}>Link copiado</p>
                  <p style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    Abre {toastNet} y pégalo donde quieras.
                  </p>
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

            {/* Copiar link */}
            <button
              onClick={() => copyLink()}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "monospace",
                letterSpacing: "0.06em",
                background: copied ? "rgba(57,255,20,0.12)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${copied ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.12)"}`,
                color: copied ? "#39FF14" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {copied ? "✓ Link copiado — cerrando..." : "⎘  Copiar link"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Download Result Card Button ──────────────────────────────────────────────

function DownloadResultButton({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  return (
    <div
      style={{
        marginTop: 18,
        borderRadius: 12,
        padding: "12px 16px",
        background: "rgba(212,175,55,0.04)",
        border: "1px solid rgba(212,175,55,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#D4AF37", lineHeight: 1.3 }}>
          Compartir resultados
        </p>
        <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
          Imagen lista para Instagram y TikTok
        </p>
      </div>
      <button
        onClick={onOpen}
        style={{
          flexShrink: 0,
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "monospace",
          letterSpacing: "0.06em",
          background: "rgba(212,175,55,0.12)",
          border: "1px solid rgba(212,175,55,0.3)",
          color: "#D4AF37",
          cursor: "pointer",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(212,175,55,0.18)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(212,175,55,0.12)";
        }}
      >
        ↓ Descargar imagen
      </button>
    </div>
  );
}

// ─── QR inline ────────────────────────────────────────────────────────────────

function InlineQR({ url }: { url: string }) {
  return (
    <div
      style={{
        padding: 8,
        background: "#fff",
        borderRadius: 10,
        display: "inline-flex",
        lineHeight: 0,
      }}
    >
      <QRCode value={url} size={72} level="M" />
    </div>
  );
}

// ─── Resultados con Tabs (Verificados / Totales) ─────────────────────────────

interface ResultsWithTabsProps {
  poll: Poll;
  userVote: string | null;
  hasMultiQ: boolean;
}

function ResultsWithTabs({ poll, userVote, hasMultiQ }: ResultsWithTabsProps) {
  const [activeTab, setActiveTab] = useState<"verified" | "total">("verified");

  const tabStyle = (tab: "verified" | "total") => {
    const isActive = activeTab === tab;
    const isVerified = tab === "verified";

    if (isActive && isVerified) {
      return {
        padding: "6px 16px",
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "monospace" as const,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer" as const,
        transition: "all 0.15s",
        border: "1px solid rgba(57,255,20,0.4)",
        background: "rgba(57,255,20,0.12)",
        color: "#39FF14",
      };
    }

    return {
      padding: "6px 16px",
      borderRadius: 20,
      fontSize: 11,
      fontFamily: "monospace" as const,
      fontWeight: isActive ? 700 : 400,
      letterSpacing: "0.06em",
      cursor: "pointer" as const,
      transition: "all 0.15s",
      border: `1px solid ${isActive ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.1)"}`,
      background: isActive ? "rgba(212,175,55,0.12)" : "transparent",
      color: isActive ? "#D4AF37" : "rgba(255,255,255,0.5)",
    };
  };

  return (
    <div style={{
      borderRadius: 16,
      padding: "18px 20px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Header con tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
          Resultados
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setActiveTab("verified")}
            style={tabStyle("verified")}
          >
            VERIFICADOS ✓
          </button>
          <button
            onClick={() => setActiveTab("total")}
            style={tabStyle("total")}
          >
            TOTALES
          </button>
        </div>
      </div>

      {/* Contenido del tab */}
      {activeTab === "verified" ? (
        <div>
          {/* Disclaimer destacado */}
          <div style={{
            borderRadius: 12,
            padding: "14px 16px",
            background: "rgba(57,255,20,0.08)",
            border: "1px solid rgba(57,255,20,0.3)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <BadgeCheck size={20} color="#39FF14" />
            </div>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(57,255,20,0.9)", margin: 0, lineHeight: 1.5 }}>
              Aquí se muestran solo los votos de las personas verificadas y que{" "}
              <span style={{ color: "#39FF14", fontWeight: 700 }}>cuentan para reportes oficiales</span>
            </p>
          </div>

          {poll.verified_votes > 0 ? (
            hasMultiQ ? (
              <MultiQuestionResults
                byQuestion={poll.results_verified_by_question!}
                userVoteJson={userVote}
                accent="#D4AF37"
              />
            ) : (
              <PollResults
                poll={poll}
                userVote={userVote}
                results={poll.results_verified}
                totalVotes={poll.verified_votes}
              />
            )
          ) : (
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>
              Sin votos verificados aún
            </p>
          )}
          <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(212,175,55,0.75)", textAlign: "right", marginTop: 12 }}>
            {poll.verified_votes} {poll.verified_votes === 1 ? "voto" : "votos"} verificados
          </p>
        </div>
      ) : (
        <div>
          {/* Disclaimer destacado */}
          <div style={{
            borderRadius: 12,
            padding: "14px 16px",
            background: "rgba(255,193,7,0.08)",
            border: "1px solid rgba(255,193,7,0.3)",
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255, 16, 16, 0.9)", margin: 0, lineHeight: 1.5 }}>
              Incluye votos de personas sin verificar. Estos votos sin verificar no se consideran en informes oficiales y su peso es la mitad el de un voto verificado.{" "}
              <br />
              <span style={{ color: "#07ff1c", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, paddingTop: 20}}><BadgeCheck size={24} />Verifícado, tu voto cuenta 100%</span>
            </p>
          </div>

          {/* Resultados totales */}
          {poll.total_votes > 0 ? (
            hasMultiQ ? (
              <MultiQuestionResults
                byQuestion={poll.results_by_question!}
                userVoteJson={userVote}
              />
            ) : (
              <PollResults
                poll={poll}
                userVote={userVote}
                results={poll.results}
                totalVotes={poll.total_votes}
              />
            )
          ) : (
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>
              Sin votos aún
            </p>
          )}
          <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: 12 }}>
            {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"} totales
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Resultados multi-pregunta (grid compacto) ────────────────────────────────

function MiniBar({ pct, isUser }: { pct: number; isUser: boolean }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        width: `${Math.max(pct, 2)}%`, height: "100%", borderRadius: 3,
        background: isUser ? "#D4AF37" : "rgba(0,229,255,0.55)",
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

function MultiQuestionResults({
  byQuestion,
  userVoteJson,
  accent = "#00E5FF",
}: {
  byQuestion: QuestionResults[];
  userVoteJson?: string | null;
  accent?: string;
}) {
  // Parsear voto del usuario (JSON multi-pregunta o string plano q1)
  let userAnswers: Record<string, string> = {};
  if (userVoteJson) {
    try { userAnswers = JSON.parse(userVoteJson); } catch { /* plano: ignorar */ }
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: byQuestion.length >= 3 ? "repeat(2, 1fr)" : "1fr",
      gap: 10,
    }}>
      {byQuestion.map((q) => {
        const userAns = userAnswers[q.question_id] ?? null;

        if (q.question_type === "scale") {
          const avgResult = q.results[0];
          const average = avgResult?.average ?? "–";
          return (
            <div key={q.question_id} style={{
              borderRadius: 12, padding: "12px 14px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", margin: "0 0 8px", lineHeight: 1.4 }}>
                {q.question_text}
              </p>
              <p style={{ fontSize: 24, fontFamily: "monospace", fontWeight: 900, color: accent, margin: "0 0 10px", lineHeight: 1 }}>
                {average}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.results.map((r) => {
                  const pct = r.pct ?? 0;
                  const isUser = userAns === r.option;
                  // Obtener label si existen scale_labels
                  const scaleMin = (q as any).scale_min ?? 1;
                  const scaleLabels = (q as any).scale_labels || [];
                  const optionIdx = parseInt(r.option || "1") - scaleMin;
                  const label = scaleLabels[optionIdx] || "";
                  return (
                    <div key={r.option}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, gap: 8 }}>
                        <span style={{ fontSize: 11, color: isUser ? "#D4AF37" : "rgba(255,255,255,0.7)", fontWeight: isUser ? 700 : 400, flex: 1 }}>
                          {isUser && "✓ "}{r.option} {label && `— ${label}`}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: isUser ? "#D4AF37" : "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                          {r.count} ({pct}%)
                        </span>
                      </div>
                      <MiniBar pct={pct} isUser={isUser} />
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "right", margin: "8px 0 0" }}>
                {q.total_votes} {q.total_votes === 1 ? "voto" : "votos"}
              </p>
            </div>
          );
        }

        const sortedResults = [...q.results].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
        return (
          <div key={q.question_id} style={{
            borderRadius: 12, padding: "12px 14px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", margin: "0 0 10px", lineHeight: 1.4 }}>
              {q.question_text}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedResults.map((r) => {
                const pct = r.pct ?? 0;
                const isUser = userAns === r.option;
                return (
                  <div key={r.option}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: isUser ? "#D4AF37" : "rgba(255,255,255,0.7)", fontWeight: isUser ? 700 : 400, lineHeight: 1.3 }}>
                        {isUser && "✓ "}{r.option}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: isUser ? "#D4AF37" : "rgba(255,255,255,0.5)", flexShrink: 0, marginLeft: 8 }}>
                        {pct}%
                      </span>
                    </div>
                    <MiniBar pct={pct} isUser={isUser} />
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "right", margin: "8px 0 0" }}>
              {q.total_votes} {q.total_votes === 1 ? "voto" : "votos"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Resultados ───────────────────────────────────────────────────────────────

function PollResults({
  poll,
  userVote,
  results: overrideResults,
  totalVotes: overrideTotalVotes,
}: {
  poll: Poll;
  userVote: string | null;
  results?: PollResult[];
  totalVotes?: number;
}) {
  const results    = overrideResults    ?? poll.results;
  const totalVotes = overrideTotalVotes ?? poll.total_votes;
  const pollType = poll.questions?.[0]?.type ?? "multiple_choice";

  if (pollType === "scale") {
    const avgResult = results[0];
    const average = avgResult?.average ?? "–";
    const totalCount = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
    const firstQuestion = poll.questions?.[0];
    const scaleMin = firstQuestion?.scale_min ?? poll.scale_min ?? 1;
    const scaleLabels = firstQuestion?.scale_labels || [];

    return (
      <div style={{ padding: "0" }}>
        {/* Promedio destacado */}
        <div style={{ textAlign: "center", padding: "16px 0 20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 48, fontFamily: "monospace", fontWeight: 900, color: "#00E5FF", lineHeight: 1 }}>
            {average}
          </p>
          <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
            promedio
          </p>
        </div>

        {/* Distribución por punto */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}>
          {results.map((r) => {
            const pct = r.pct ?? 0;
            const isUser = userVote === r.option;
            const optionIdx = parseInt(r.option || "1") - scaleMin;
            const label = scaleLabels[optionIdx] || "";
            return (
              <div
                key={r.option}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: `1px solid ${isUser ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.07)"}`,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0, top: 0,
                    height: "100%",
                    width: `${pct}%`,
                    background: isUser ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)",
                    transition: "width 0.7s ease",
                    borderRadius: 12,
                  }}
                />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: isUser ? "#D4AF37" : "#f5f5f5", fontWeight: isUser ? 700 : 400 }}>
                      {isUser && "✓ "}{r.option} {label && `— ${label}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: isUser ? "#D4AF37" : "rgba(255,255,255,0.65)", fontWeight: isUser ? 700 : 400, flexShrink: 0 }}>
                    {r.count} ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: 12 }}>
          {totalCount} {totalCount === 1 ? "voto" : "votos"}
        </p>
      </div>
    );
  }



  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {results.map((r) => {
        const pct = r.pct ?? 0;
        const isUser = userVote === r.option;
        return (
          <div
            key={r.option}
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1px solid ${isUser ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.07)"}`,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0, top: 0,
                height: "100%",
                width: `${pct}%`,
                background: isUser ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)",
                transition: "width 0.7s ease",
                borderRadius: 12,
              }}
            />
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: isUser ? "#D4AF37" : "#f5f5f5", fontWeight: isUser ? 700 : 400 }}>
                {isUser && "✓ "}{r.option}
              </span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: isUser ? "#D4AF37" : "rgba(255,255,255,0.65)", fontWeight: isUser ? 700 : 400 }}>
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: 4 }}>
        {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

// ─── Formulario multi-pregunta ────────────────────────────────────────────────

function MultiQuestionForm({ questions, onSubmit, submitting }: {
  questions: QuestionDef[];
  onSubmit: (answers: Record<string, string>) => void;
  submitting: boolean;
}) {
  // answers: radio → string | multi-select → string[] (serializado como "opt1||opt2")
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const sorted = [...questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const total = sorted.length;
  const answered = sorted.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : !!a;
  }).length;

  function toggleMulti(qid: string, opt: string) {
    setAnswers((prev) => {
      const cur = (prev[qid] as string[]) || [];
      const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
      return { ...prev, [qid]: next };
    });
  }

  function handleSubmit() {
    const missing = sorted.find((q) => {
      const a = answers[q.id];
      return Array.isArray(a) ? a.length === 0 : !a;
    });
    if (missing) { setLocalError(`Responde: "${missing.text}"`); return; }
    setLocalError(null);
    // Serializar: multi-select como "opt1||opt2||..."
    const serialized: Record<string, string> = {};
    for (const q of sorted) {
      const a = answers[q.id];
      serialized[q.id] = Array.isArray(a) ? a.join("||") : (a as string ?? "");
    }
    onSubmit(serialized);
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div
            style={{
              height: "100%",
              width: `${total > 0 ? (answered / total) * 100 : 0}%`,
              background: "linear-gradient(90deg, #D4AF37, #39FF14)",
              borderRadius: 2,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
          {answered}/{total}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        {sorted.map((q, idx) => (
          <div key={q.id} style={{
            paddingTop: idx === 0 ? 0 : 22,
            paddingBottom: 22,
            borderBottom: idx < sorted.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}>
            {/* ── Badge número + línea ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontFamily: "monospace", fontWeight: 800,
                border: `1.5px solid ${answers[q.id] ? "rgba(212,175,55,0.7)" : "rgba(57,255,20,0.5)"}`,
                background: answers[q.id] ? "rgba(212,175,55,0.12)" : "rgba(57,255,20,0.08)",
                color: answers[q.id] ? "#D4AF37" : "#39FF14",
                transition: "all 0.2s",
              }}>
                {idx + 1}
              </span>
              <div style={{
                flex: 1, height: 1,
                background: answers[q.id] ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.1)",
                transition: "background 0.2s",
              }} />
            </div>

            {/* ── Texto pregunta full-width ── */}
            <p style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f5", lineHeight: 1.55, marginBottom: 16 }}>
              {q.text}
            </p>

            {q.type === "multiple_choice" && q.options && (() => {
              const isMulti = !!q.allow_multiple;
              const multiSel = (answers[q.id] as string[]) || [];
              const singleSel = answers[q.id] as string;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isMulti && (
                    <p style={{ fontSize: 11, fontFamily: "monospace", color: "#D4AF37", marginBottom: 2, letterSpacing: "0.08em" }}>
                      ☑ Puedes elegir varias opciones
                    </p>
                  )}
                  {q.options.map((opt) => {
                    const sel = isMulti ? multiSel.includes(opt) : singleSel === opt;
                    return (
                      <button key={opt}
                        onClick={() => isMulti
                          ? toggleMulti(q.id, opt)
                          : setAnswers((p) => ({ ...p, [q.id]: opt }))
                        }
                        style={{ textAlign: "left", padding: "8px 12px", borderRadius: 9, fontSize: 13, border: `1px solid ${sel ? "rgba(212,175,55,0.55)" : "rgba(255,255,255,0.1)"}`, background: sel ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)", color: sel ? "#D4AF37" : "#d0d0d0", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10, fontWeight: sel ? 600 : 400 }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: isMulti ? 4 : "50%", border: `1.5px solid ${sel ? "#D4AF37" : "rgba(255,255,255,0.3)"}`, background: sel ? "#D4AF37" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 8, color: "#000", transition: "all 0.15s" }}>
                          {sel && "✓"}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              );
            })()}


            {q.type === "scale" && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, justifyContent: "center" }}>
                  {Array.from({ length: (q.scale_points ?? q.scale_max ?? 5) - 1 + 1 }, (_, i) => 1 + i).map((n, idx) => {
                    const sel = answers[q.id] === String(n);
                    const label = q.scale_labels?.[idx] || "";
                    return (
                      <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <button onClick={() => setAnswers((p) => ({ ...p, [q.id]: String(n) }))}
                          style={{ width: 48, height: 48, borderRadius: 10, border: `1.5px solid ${sel ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(57,255,20,0.18)" : "rgba(255,255,255,0.02)", color: sel ? "#39FF14" : "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "monospace", fontWeight: sel ? 800 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                          {n}
                        </button>
                        {label && (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", textAlign: "center", maxWidth: 70, lineHeight: 1.2 }}>
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {localError && (
        <div style={{ borderRadius: 8, padding: "10px 14px", fontSize: 11, fontFamily: "monospace", color: "#FF073A", background: "rgba(255,7,58,0.07)", border: "1px solid rgba(255,7,58,0.2)", marginBottom: 14 }}>
          {localError}
        </div>
      )}

      <button onClick={handleSubmit} disabled={submitting || answered < total}
        style={{ width: "100%", padding: "14px 0", borderRadius: 14, fontSize: 13, fontFamily: "monospace", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", border: answered < total ? "1px solid rgba(255,255,255,0.12)" : "none", background: answered < total ? "rgba(255,255,255,0.04)" : submitting ? "rgba(212,175,55,0.4)" : "linear-gradient(135deg, #D4AF37 0%, #F5C842 50%, #B8860B 100%)", color: answered < total ? "rgba(255,255,255,0.55)" : "#0A0A0A", cursor: answered < total ? "not-allowed" : submitting ? "wait" : "pointer", transition: "all 0.2s", boxShadow: answered >= total && !submitting ? "0 4px 24px rgba(212,175,55,0.3)" : "none" }}>
        {submitting ? "Enviando…" : answered < total ? `Responde ${total - answered} pregunta${total - answered !== 1 ? "s" : ""} pendiente${total - answered !== 1 ? "s" : ""}` : "Enviar respuesta →"}
      </button>
    </div>
  );
}

// ─── Votación single-question ─────────────────────────────────────────────────

function SingleQuestionVote({ poll, onVote, voting }: { poll: Poll; onVote: (v: string) => void; voting: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  // Get first question to determine poll type and scale
  const firstQuestion = poll.questions?.[0];
  const pollType = firstQuestion?.type ?? "multiple_choice";
  const scalePoints = firstQuestion?.scale_points ?? 5;
  const [scaleVal, setScaleVal] = useState(1);

  if (pollType === "multiple_choice") {
    const options = firstQuestion?.options || [];
    return (
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {options.map((opt) => {
            const sel = selected === opt;
            return (
              <button key={opt} onClick={() => setSelected(opt)} disabled={voting}
                style={{ textAlign: "left", padding: "12px 16px", borderRadius: 12, fontSize: 13, border: `1.5px solid ${sel ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.02)", color: sel ? "#D4AF37" : "#e0e0e0", cursor: voting ? "not-allowed" : "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10, fontWeight: sel ? 600 : 400 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${sel ? "#D4AF37" : "rgba(255,255,255,0.2)"}`, background: sel ? "#D4AF37" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: "#000" }}>
                  {sel && "✓"}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
        <button onClick={() => selected && onVote(selected)} disabled={!selected || voting}
          style={{ width: "100%", padding: "14px 0", borderRadius: 14, fontSize: 13, fontFamily: "monospace", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", border: "none", background: !selected ? "rgba(255,255,255,0.05)" : voting ? "rgba(212,175,55,0.4)" : "linear-gradient(135deg, #D4AF37 0%, #F5C842 50%, #B8860B 100%)", color: !selected ? "rgba(255,255,255,0.25)" : "#0A0A0A", cursor: !selected || voting ? "not-allowed" : "pointer", transition: "all 0.2s", boxShadow: selected && !voting ? "0 4px 24px rgba(212,175,55,0.3)" : "none" }}>
          {voting ? "Enviando…" : selected ? "Confirmar voto →" : "Selecciona una opción"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, justifyContent: "center" }}>
        {Array.from({ length: scalePoints }, (_, i) => 1 + i).map((n, idx) => {
          const sel = scaleVal === n;
          const label = firstQuestion?.scale_labels?.[idx] || "";
          return (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <button onClick={() => setScaleVal(n)}
                style={{ width: 50, height: 50, borderRadius: 10, border: `1.5px solid ${sel ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(57,255,20,0.18)" : "rgba(255,255,255,0.02)", color: sel ? "#39FF14" : "rgba(255,255,255,0.6)", fontSize: 16, fontFamily: "monospace", fontWeight: sel ? 800 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {n}
              </button>
              {label && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 70, lineHeight: 1.2 }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={() => onVote(String(scaleVal))} disabled={voting}
        style={{ width: "100%", padding: "14px 0", borderRadius: 14, fontSize: 13, fontFamily: "monospace", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", border: "none", background: voting ? "rgba(57,255,20,0.3)" : "linear-gradient(135deg, #39FF14 0%, #00E5FF 100%)", color: "#0A0A0A", cursor: voting ? "wait" : "pointer", transition: "all 0.2s", boxShadow: !voting ? "0 4px 24px rgba(57,255,20,0.25)" : "none" }}>
        {voting ? "Enviando…" : `Votar ${scaleVal} →`}
      </button>
    </div>
  );
}

// ─── Cross-tabs Panel ─────────────────────────────────────────────────────────

const DIM_LABELS: Record<CrossTabDimension, string> = {
  region:  "Región",
  commune: "Comuna",
  age:     "Edad",
  country: "País",
};

function CrossTabsPanel({ pollId, pollType }: { pollId: string; pollType: "multiple_choice" | "scale" }) {
  const [dimension, setDimension]   = useState<CrossTabDimension>("region");
  const [data, setData]             = useState<CrossTabData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fetchCrosstabs = useCallback(async (dim: CrossTabDimension) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${pollId}/crosstabs?dimension=${dim}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError("Error al cargar cross-tabs");
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => { fetchCrosstabs(dimension); }, [fetchCrosstabs, dimension]);

  const dimTabStyle = (d: CrossTabDimension) => ({
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 9,
    fontFamily: "monospace" as const,
    letterSpacing: "0.06em",
    cursor: "pointer" as const,
    transition: "all 0.15s",
    border: `1px solid ${dimension === d ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.08)"}`,
    background: dimension === d ? "rgba(0,229,255,0.1)" : "transparent",
    color: dimension === d ? "#00E5FF" : "rgba(255,255,255,0.35)",
  });

  return (
    <div style={{
      borderRadius: 16,
      padding: "18px 20px",
      background: "rgba(0,229,255,0.02)",
      border: "1px solid rgba(0,229,255,0.1)",
      marginTop: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Análisis Demográfico
          </p>
          <p style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(0,229,255,0.4)", marginTop: 2 }}>
            Solo votos de ciudadanos VERIFIED
          </p>
        </div>
        <span style={{
          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          color: "#00E5FF", background: "rgba(0,229,255,0.08)",
          border: "1px solid rgba(0,229,255,0.2)",
          borderRadius: 20, padding: "2px 10px",
        }}>
          ADMIN
        </span>
      </div>

      {/* Selector de dimensión */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {(Object.keys(DIM_LABELS) as CrossTabDimension[]).map((d) => (
          <button key={d} onClick={() => setDimension(d)} style={dimTabStyle(d)}>
            {DIM_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Estados */}
      {loading && (
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>
          Calculando cross-tabs…
        </p>
      )}
      {!loading && error && (
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "#FF073A", textAlign: "center", padding: "12px 0" }}>
          {error}
        </p>
      )}
      {!loading && !error && data && (
        <>
          {/* Métricas resumen */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              <span style={{ color: "#00E5FF" }}>{data.total_verified_votes}</span> votos VERIFIED
            </span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              <span style={{ color: "#39FF14" }}>{data.results.length}</span> grupos mostrados
            </span>
            {data.suppressed_groups > 0 && (
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                <span style={{ color: "rgba(255,7,58,0.7)" }}>{data.suppressed_groups}</span> suprimidos (n&lt;{data.min_group_size})
              </span>
            )}
          </div>

          {/* Sin datos */}
          {data.results.length === 0 && (
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "16px 0" }}>
              Sin grupos con suficientes respuestas (mín. {data.min_group_size})
            </p>
          )}

          {/* Grupos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.results.map((group) => (
              <div key={group.group} style={{
                borderRadius: 10,
                padding: "12px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {/* Cabecera grupo */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f5f5f5" }}>{group.group}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(0,229,255,0.6)", background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.15)", borderRadius: 20, padding: "2px 8px" }}>
                    n={group.n}
                  </span>
                </div>

                {/* Breakdown */}
                {pollType === "multiple_choice" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.breakdown.map((b) => {
                      const pct = b.pct ?? 0;
                      return (
                        <div key={b.option}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{b.option}</span>
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>
                              {pct}% <span style={{ color: "rgba(255,255,255,0.2)" }}>({b.count})</span>
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: pct >= 50 ? "linear-gradient(90deg,#39FF14,#00E5FF)" : "rgba(0,229,255,0.5)",
                              borderRadius: 2,
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Escala: histograma por punto + promedio */
                  <div>
                    {/* Promedio destacado */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 900, color: "#00E5FF" }}>
                        {group.average ?? "–"}
                      </span>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                        promedio · {group.n} votos
                      </span>
                    </div>
                    {/* Histograma por punto */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {group.breakdown.map((b) => {
                        const pct = b.pct ?? 0;
                        const maxPct = Math.max(...group.breakdown.map((x) => x.pct ?? 0), 1);
                        const relWidth = Math.round((pct / maxPct) * 100);
                        return (
                          <div key={b.option} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", width: 16, textAlign: "right", flexShrink: 0 }}>
                              {b.option}
                            </span>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${relWidth}%`,
                                background: pct === Math.max(...group.breakdown.map((x) => x.pct ?? 0))
                                  ? "linear-gradient(90deg,#00E5FF,#39FF14)"
                                  : "rgba(0,229,255,0.45)",
                                borderRadius: 3,
                                transition: "width 0.5s ease",
                              }} />
                            </div>
                            <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", width: 34, textAlign: "right", flexShrink: 0 }}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EncuestaDetailClient({ params }: EncuestaPageProps) {
  const { id: slug } = use(params);   // el segmento es el slug: /encuestas/{slug}
  const { token } = useAuthStore();
  const { isVerified, isAdmin, isBasic } = usePermissions();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [voted, setVoted] = useState(false);
  const [showVoteSuccess, setShowVoteSuccess] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voteSuccessRef = useRef<HTMLDivElement>(null);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  useBeaconPulse(`poll:${slug}`, (data) => {
    if (data.type === "POLL_PULSE" && voted) {
      setPoll((p) => p ? {
        ...p,
        results:          data.results          as PollResult[],
        total_votes:      data.total_votes       as number,
        results_verified: (data.results_verified as PollResult[]) ?? p.results_verified,
        verified_votes:   (data.verified_votes   as number)       ?? p.verified_votes,
        basic_votes:      (data.basic_votes      as number)       ?? p.basic_votes,
      } : p);
    }
  });

  // Auto-scroll al "Compartir votación" cuando se vota
  useEffect(() => {
    if (voted && voteSuccessRef.current) {
      setTimeout(() => {
        voteSuccessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [voted]);

  const fetchPoll = useCallback(async (code?: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      // Usar endpoint by-slug — URL canónica: /encuestas/{slug}
      const url = code
        ? `${API_URL}/api/v1/polls/by-slug/${slug}?access_code=${encodeURIComponent(code)}`
        : `${API_URL}/api/v1/polls/by-slug/${slug}`;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPoll(data);
      // Detectar voto previo en visitas de retorno (sin activar celebración)
      if (data.user_vote && !voted) {
        setUserVote(data.user_vote);
        setVoted(true);
        // showVoteSuccess queda false → muestra resultados directamente
      }
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [slug, token]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll al card de éxito cuando el usuario acaba de votar
  useEffect(() => {
    if (showVoteSuccess && voteSuccessRef.current) {
      setTimeout(() => {
        voteSuccessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [showVoteSuccess]);

  async function handleVerifyCode() {
    if (!accessCode.trim()) return;
    setVerifyingCode(true); setAccessError(null);
    await fetchPoll(accessCode.trim());
    setVerifyingCode(false);
    // Si tras el fetch poll.is_private sigue true, el código fue incorrecto
  }

  useEffect(() => { fetchPoll(); }, [fetchPoll]);

  // Detectar código incorrecto tras re-fetch
  useEffect(() => {
    if (poll?.is_private && !poll.questions && accessCode) {
      setAccessError("Código incorrecto. Inténtalo de nuevo.");
    }
  }, [poll, accessCode]);

  async function doVote(optionValue: string) {
    const requiresAuth = poll?.requires_auth !== false;
    if (requiresAuth && !token) { setError("Debes iniciar sesión para votar."); return; }
    setVoting(true); setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const body: Record<string, string> = { option_value: optionValue };
      if (!requiresAuth) body["anon_session_id"] = getOrCreateAnonSessionId();
      if (poll?.is_private && accessCode) body["access_code"] = accessCode;
      const res = await fetch(`${API_URL}/api/v1/polls/${poll!.id}/vote`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("beacon:session-expired"));
        throw new Error("Tu sesión expiró. Inicia sesión nuevamente — tus respuestas siguen seleccionadas.");
      }
      if (!res.ok) throw new Error(data.detail || "Error al votar");
      setUserVote(optionValue);
      setVoted(true);
      setShowVoteSuccess(true);
      await fetchPoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al votar");
    } finally { setVoting(false); }
  }

  async function handleMultiVote(answers: Record<string, string>) {
    if (!poll?.questions?.length) return;
    // Multi-pregunta: enviar todas las respuestas como JSON {"qid": "respuesta", ...}
    await doVote(JSON.stringify(answers));
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }} className="animate-pulse">
        Cargando encuesta…
      </p>
    </div>
  );

  if (notFound || !poll) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">📊</p>
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Encuesta no encontrada.</p>
        <Link href="/encuestas" style={{ fontSize: 11, fontFamily: "monospace", color: "#00E5FF" }}>← Volver</Link>
      </div>
    </div>
  );

  // Gate: encuesta privada sin código válido
  if (poll.is_private && !poll.questions) {
    return (
      <div className="min-h-screen pt-20 pb-16 px-4 sm:px-6 flex items-center justify-center">
        <div style={{ maxWidth: 400, width: "100%" }}>
          <div style={{ borderRadius: 24, overflow: "hidden", border: "1px solid rgba(212,175,55,0.25)", background: "rgba(14,14,14,0.98)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", padding: "36px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>🔒</p>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "#f5f5f5", marginBottom: 8 }}>{poll.title}</h1>
              <p style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
                Esta encuesta es privada. Ingresa el código de acceso para participar.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setAccessError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                placeholder="CÓDIGO DE ACCESO"
                style={{ width: "100%", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${accessError ? "rgba(255,7,58,0.4)" : "rgba(212,175,55,0.25)"}`, color: "#f5f5f5", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.15em", outline: "none", textAlign: "center", boxSizing: "border-box" }}
                autoFocus
              />
              {accessError && (
                <p style={{ fontSize: 11, fontFamily: "monospace", color: "#FF073A", textAlign: "center" }}>✗ {accessError}</p>
              )}
              <button
                onClick={handleVerifyCode}
                disabled={verifyingCode || !accessCode.trim()}
                style={{ width: "100%", padding: "12px", borderRadius: 10, fontSize: 12, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", background: "rgba(212,175,55,0.12)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.3)", cursor: verifyingCode ? "not-allowed" : "pointer", opacity: (!accessCode.trim() || verifyingCode) ? 0.5 : 1 }}
              >
                {verifyingCode ? "Verificando…" : "Ingresar →"}
              </button>
            </div>
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <Link href="/encuestas" style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>← Volver a encuestas</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasMultiQ = (poll.questions?.length ?? 0) > 1;
  const pageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/encuestas/${poll?.slug || slug}`
    : `https://www.beaconchile.cl/encuestas/${poll?.slug || slug}`;

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 sm:px-6">
      <div style={{ maxWidth: 660, margin: "0 auto" }}>

        {/* ── Breadcrumb ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <Link href="/encuestas" style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
            ← Encuestas
          </Link>
          <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 11 }}>/</span>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#39FF14", letterSpacing: "0.08em" }}>
            {poll?.title
              ? poll.title.length > 48
                ? poll.title.slice(0, 48) + "…"
                : poll.title
              : (poll?.slug || slug).toUpperCase()}
          </span>
        </div>

        {/* ── Card ── */}
        <div style={{ borderRadius: 24, overflow: "hidden", border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.08)"}`, background: "rgba(14,14,14,0.95)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>

          {/* Imagen cabecera */}
          {poll.header_image ? (
            <div className="relative w-full" style={{ height: 260 }}>
              <Image src={poll.header_image} alt={poll.title} fill className="object-cover" sizes="660px" priority />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(14,14,14,0.97) 85%)" }} />

              {/* Header overlay: badges + QR + share */}
              <div className="absolute inset-x-0 bottom-0 p-5" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  {/* Status + badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {poll.is_open ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "monospace", color: "#39FF14", background: "rgba(0,0,0,0.7)", padding: "3px 12px", borderRadius: 20, border: "1px solid rgba(57,255,20,0.35)", backdropFilter: "blur(8px)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#39FF14", display: "inline-block", animation: "pulse 2s infinite" }} />
                      ABIERTA
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.7)", padding: "3px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)" }}>
                      CERRADA
                    </span>
                  )}
                  {poll.category && poll.category !== "general" && (
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#D4AF37", background: "rgba(0,0,0,0.7)", padding: "3px 12px", borderRadius: 20, border: "1px solid rgba(212,175,55,0.3)" }}>
                      {CATEGORY_LABELS[poll.category] ?? poll.category}
                    </span>
                  )}
                  {poll.requires_auth === false && (
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#39FF14", background: "rgba(0,0,0,0.7)", padding: "3px 12px", borderRadius: 20, border: "1px solid rgba(57,255,20,0.3)" }}>
                      ⚡ Flash
                    </span>
                  )}
                  </div>
                </div>
                {/* QR pequeño */}
                <div style={{ padding: 6, background: "#fff", borderRadius: 10, display: "inline-flex", lineHeight: 0, boxShadow: "0 2px 16px rgba(0,0,0,0.5)", flexShrink: 0 }}>
                  <QRCode value={pageUrl} size={64} level="M" />
                </div>
              </div>
            </div>
          ) : (
            /* Sin imagen: header con gradiente */
            <div className="px-4 sm:px-7" style={{ paddingTop: 28, paddingBottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                {poll.is_open ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "monospace", color: "#39FF14" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#39FF14", display: "inline-block" }} />
                    ABIERTA
                  </span>
                ) : (
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>CERRADA</span>
                )}
              </div>
              <InlineQR url={pageUrl} />
            </div>
          )}

          <div className="px-4 sm:px-7" style={{ paddingTop: 22, paddingBottom: 30 }}>
            {/* Título */}
            <h1 className="text-2xl sm:text-3xl" style={{ fontWeight: 900, color: "#f5f5f5", marginBottom: 8, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
              {poll.title}
            </h1>
            {/* Real vote badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "8px 14px", borderRadius: 10, background: "rgba(57,255,20,0.08)", border: "1px solid rgba(57,255,20,0.2)" }}>
              <span style={{ fontSize: 11, color: "#39FF14", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                ✓ Tu voto aquí es real. Y no el de un grupo seleccionado.
              </span>
            </div>
            {poll.description && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 8, lineHeight: 1.6, fontWeight: 500 }}>
                {poll.description}
              </p>
            )}
            {/* Fecha con hora */}
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
              {poll.is_open ? "⏳ Cierra" : "🔒 Cerró"} el {formatDateHour(poll.ends_at)} hrs
            </p>

            {/* ══════════════════════════════════════════
             *  CONTEXTO — información de la encuesta
             * ══════════════════════════════════════════ */}
            {(poll.context || poll.source_url || (poll.tags && poll.tags.length > 0)) && (
              <div
                style={{
                  marginBottom: 22,
                  borderRadius: 16,
                  border: "1px solid rgba(0,229,255,0.1)",
                  background: "rgba(0,229,255,0.03)",
                  padding: "20px 24px",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>🔍</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.15em", color: "rgba(0,229,255,0.7)", textTransform: "uppercase", fontWeight: 700 }}>
                    Contexto
                  </span>
                </div>

                {/* Texto de contexto */}
                {poll.context && (
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginBottom: poll.source_url || poll.tags?.length ? 14 : 0 }}>
                    {poll.context}
                  </p>
                )}

                {/* Fuente */}
                {poll.source_url && (
                  <a
                    href={poll.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "monospace", color: "#00E5FF", textDecoration: "none", marginBottom: poll.tags?.length ? 12 : 0 }}
                  >
                    🔗 Ver fuente →
                  </a>
                )}

                {/* Tags */}
                {poll.tags && poll.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {poll.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{ fontSize: 10, fontFamily: "monospace", padding: "3px 12px", borderRadius: 20, background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "rgba(0,229,255,0.6)" }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Share social */}
            <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <SocialShareBar
                url={pageUrl}
                title={poll.title}
                mode={voted ? "post-vote" : "pre-vote"}
                totalVotes={poll.total_votes}
              />
            </div>

            {/* Divisor */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 22 }} />

            {/* ── Banner FOMO para usuarios BASIC (antes de votar) ── */}
            {token && isBasic && poll.is_open && !voted && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "14px 18px",
                  marginBottom: 18,
                  background: "rgba(212,175,55,0.06)",
                  border: "1px solid rgba(212,175,55,0.25)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🗳️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#D4AF37", marginBottom: 4, lineHeight: 1.3 }}>
                    Tu voto vale 0.5× y no aparecerá en los Resultados Verificados
                  </p>
                  <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 8 }}>
                    Los ciudadanos VERIFIED tienen peso 1.0× y sus votos forman el resultado formal de la encuesta.
                  </p>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("beacon:open-verify-modal"))}
                    style={{
                      fontSize: 10, fontFamily: "monospace", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      color: "#D4AF37", background: "rgba(212,175,55,0.12)",
                      border: "1px solid rgba(212,175,55,0.35)",
                      borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                    }}
                  >
                    Verificar identidad →
                  </button>
                </div>
              </div>
            )}

            {/* ── Contenido de votación ── */}
            {voted ? (
              <div ref={voteSuccessRef}>
                {/* Momento de orgullo: se muestra una vez al votar, se cierra al ver resultados */}
                {showVoteSuccess && (
                  <PostVoteCard
                    isVerified={isVerified}
                    totalVotes={poll.total_votes}
                    pollTitle={poll.title}
                    pageUrl={pageUrl}
                    onReveal={() => setShowVoteSuccess(false)}
                  />
                )}
                {!showVoteSuccess && (
                  <>
                    <div style={{ borderRadius: 16, padding: "14px 18px", textAlign: "center", background: "rgba(57,255,20,0.04)", border: "1px solid rgba(57,255,20,0.15)", marginBottom: 20 }}>
                      <p style={{ fontSize: 11, fontFamily: "monospace", color: "#39FF14", opacity: 0.7 }}>
                        ✓ Voto registrado
                      </p>
                    </div>
                    <div ref={voteSuccessRef} />
                    <DownloadResultButton slug={slug} onOpen={() => setDownloadModalOpen(true)} />
                  </>
                )}
              </div>
            ) : !poll.is_open ? (
              <div>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
                  Resultados finales
                </p>
                <PollResults poll={poll} userVote={null} />
                <DownloadResultButton slug={slug} onOpen={() => setDownloadModalOpen(true)} />
              </div>
            ) : !token ? (
              <div style={{ borderRadius: 14, padding: "20px 22px", background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.12)", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#00E5FF", fontFamily: "monospace", marginBottom: 6 }}>
                  Inicia sesión para participar
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>
                  Tu voto se pondera: BASIC 0.5× · VERIFIED 1.0×
                </p>
              </div>
            ) : hasMultiQ ? (
              <div>
                <MultiQuestionForm
                  questions={poll.questions!}
                  onSubmit={handleMultiVote}
                  submitting={voting}
                />
                {error && (
                  <p style={{ fontSize: 11, fontFamily: "monospace", color: "#FF073A", marginTop: 10, textAlign: "center" }}>
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div>
                {poll.questions?.[0]?.text && (
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5", marginBottom: 22, lineHeight: 1.5 }}>
                    {poll.questions[0].text}
                  </p>
                )}
                <SingleQuestionVote poll={poll} onVote={doVote} voting={voting} />
                {error && (
                  <p style={{ fontSize: 11, fontFamily: "monospace", color: "#FF073A", marginTop: 12, textAlign: "center" }}>
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* ── Panel resultados en vivo ── */}
            {poll.total_votes > 0 && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "22px 0 18px" }} />

                {(voted || !poll.is_open || isVerified || isAdmin) ? (
                  <>
                    <ResultsWithTabs
                      poll={poll}
                      userVote={voted ? userVote : null}
                      hasMultiQ={hasMultiQ}
                    />

                    {/* ── Card 3: Análisis Demográfico (solo admins) ── */}
                    {isAdmin && poll.verified_votes > 0 && (
                      <CrossTabsPanel pollId={poll.id} pollType={(poll.questions?.[0]?.type as any) ?? "multiple_choice"} />
                    )}
                  </>
                ) : (
                  /* BASIC sin votar: teaser bloqueado */
                  <div style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}>
                    <div style={{ filter: "blur(4px)", opacity: 0.4, pointerEvents: "none" }}>
                      <PollResults poll={poll} userVote={null} />
                    </div>
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: "rgba(10,10,10,0.6)", backdropFilter: "blur(2px)",
                      borderRadius: 14, padding: "16px 20px", textAlign: "center",
                    }}>
                      <Lock size={22} color="#D4AF37" strokeWidth={1.5} style={{ marginBottom: 10, display: "block" }} />
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#f5f5f5", margin: "0 0 4px 0" }}>
                        Verifica tu identidad para ver resultados
                      </p>
                      <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                        Los ciudadanos VERIFIED acceden a resultados en tiempo real.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 22 }}>
              {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"} · BASIC 0.5× · VERIFIED 1.0× · Beacon Chile
            </p>
          </div>
        </div>


        {/* ══════════════════════════════════════════
         *  COMENTARIOS / REACCIONES CIUDADANAS
         * ══════════════════════════════════════════ */}
        <PollCommentsSection pollId={poll.id} pollSlug={poll.slug} isOpen={poll.is_open} />

      </div>

      {/* Modal de descarga de imágenes */}
      {poll && (
        <ImageDownloadModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          slug={poll.slug}
          title={poll.title}
          questions={poll.questions || []}
          totalVotes={poll.total_votes}
          verifiedVotes={poll.verified_votes}
        />
      )}
    </div>
  );
}
