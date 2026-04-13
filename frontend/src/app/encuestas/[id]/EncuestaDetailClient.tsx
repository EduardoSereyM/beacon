/**
 * BEACON PROTOCOL — /encuestas/[id]
 * ====================================
 * Detalle de encuesta con imagen, multi-pregunta, votación, QR inline y share social.
 */

"use client";

import { use, useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";
import { useAuthStore } from "@/store";
import { useBeaconPulse } from "@/hooks/useBeaconPulse";
import usePermissions from "@/hooks/usePermissions";
import PollCommentsSection from "@/components/polls/PollCommentsSection";

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
  type: "multiple_choice" | "scale" | "ranking";
  allow_multiple?: boolean;   // true = checkboxes, false/undefined = radio
  options: string[] | null;
  scale_min?: number;
  scale_max?: number;
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
  // ranking fields
  borda_score?: number;
  avg_position?: number;
  first_place_pct?: number;
}

// ─── Cross-tabs ────────────────────────────────────────────────────────────────

type CrossTabDimension = "region" | "commune" | "age" | "country";

interface CrossTabBreakdown {
  option?: string;
  count: number;
  pct?: number;
  average?: number;
  avg_position?: number;    // ranking: posición promedio (1-based)
  first_place_pct?: number; // ranking: % de veces en primer lugar
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

interface Poll {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  context: string | null;       // texto contextual visible en la página
  source_url: string | null;    // fuente de origen
  tags: string[];
  header_image: string | null;
  poll_type: "multiple_choice" | "scale" | "ranking";
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
  questions: QuestionDef[] | null;
  category: string;
  requires_auth: boolean;
  is_private?: boolean;
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

// ─── Share Social ─────────────────────────────────────────────────────────────

function SocialShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const text = encodeURIComponent(`${title} — Encuesta BEACON`);
  const encUrl = encodeURIComponent(url);

  const networks = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      logo: logoWhatsapp,
      color: "#25D366",
      href: `https://wa.me/?text=${text}%20${encUrl}`,
    },
    {
      id: "twitter",
      label: "X",
      logo: logoX,
      color: "#ffffff",
      href: `https://twitter.com/intent/tweet?text=${text}&url=${encUrl}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      logo: logoTelegram,
      color: "#229ED9",
      href: `https://t.me/share/url?url=${encUrl}&text=${text}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      logo: logoFacebook,
      color: "#1877F2",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
    },
    {
      id: "instagram",
      label: "Instagram",
      logo: logoInstagram,
      color: "#E1306C",
      href: null, // no direct share — solo copy
    },
    {
      id: "tiktok",
      label: "TikTok",
      logo: logoTiktok,
      color: "#EE1D52",
      href: null, // no direct share — solo copy
    },
  ];

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        Compartir en
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {networks.map((n) =>
          n.href ? (
            <a
              key={n.id}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              title={n.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${n.color}18`,
                border: `1px solid ${n.color}40`,
                textDecoration: "none",
                transition: "transform 0.15s, background 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = `${n.color}30`;
                (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = `${n.color}18`;
                (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1)";
              }}
            >
              <Image src={n.logo} alt={n.label} width={20} height={20} style={{ objectFit: "contain" }} />
            </a>
          ) : (
            /* Instagram / TikTok → copiar link con tooltip */
            <button
              key={n.id}
              onClick={copyLink}
              title={`${n.label} — Copia el link y pégalo en ${n.label}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${n.color}18`,
                border: `1px solid ${n.color}40`,
                cursor: "pointer",
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              <Image src={n.logo} alt={n.label} width={20} height={20} style={{ objectFit: "contain" }} />
            </button>
          )
        )}

        {/* Copy URL */}
        <button
          onClick={copyLink}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 36,
            padding: "0 12px",
            borderRadius: 10,
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 700,
            background: copied ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${copied ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.12)"}`,
            color: copied ? "#39FF14" : "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "✓ Copiado" : "🔗 Copiar link"}
        </button>
      </div>
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

  if (poll.poll_type === "scale") {
    const r = results[0];
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <p style={{ fontSize: 52, fontFamily: "monospace", fontWeight: 900, color: "#00E5FF", lineHeight: 1 }}>
          {r?.average ?? "–"}
        </p>
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
          promedio · {r?.count ?? totalVotes} votos
        </p>
        {userVote && (
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "#39FF14", marginTop: 10 }}>
            Tu voto: {userVote} ✓
          </p>
        )}
      </div>
    );
  }

  if (poll.poll_type === "ranking") {
    // Mostrar posición promedio (columna principal) + frecuencia #1
    const maxBorda = results[0]?.borda_score ?? 1;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", width: 52, textAlign: "right" }}>pos. prom.</span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", width: 42, textAlign: "right" }}>#1 frec.</span>
        </div>
        {results.map((r, idx) => {
          const barWidth = maxBorda > 0 ? Math.round(((r.borda_score ?? 0) / maxBorda) * 100) : 0;
          return (
            <div key={r.option} style={{
              position: "relative", overflow: "hidden",
              padding: "10px 12px", borderRadius: 12,
              border: `1px solid ${idx === 0 ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.07)"}`,
              background: "rgba(255,255,255,0.02)",
            }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${barWidth}%`,
                background: idx === 0 ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)",
                transition: "width 0.7s ease",
              }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontFamily: "monospace", fontWeight: 800,
                  background: idx === 0 ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.06)",
                  color: idx === 0 ? "#D4AF37" : "rgba(255,255,255,0.4)",
                }}>
                  {idx + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: idx === 0 ? "#f5f5f5" : "rgba(255,255,255,0.75)", fontWeight: idx === 0 ? 700 : 400 }}>
                  {r.option}
                </span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,229,255,0.7)", width: 52, textAlign: "right", flexShrink: 0 }}>
                  {r.avg_position != null ? `${r.avg_position}°` : "–"}
                </span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", width: 42, textAlign: "right", flexShrink: 0 }}>
                  {r.first_place_pct ?? 0}%
                </span>
              </div>
            </div>
          );
        })}
        <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", textAlign: "right", marginTop: 4 }}>
          {totalVotes} {totalVotes === 1 ? "voto" : "votos"} · ordenado por Borda
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
              <span style={{ fontSize: 12, fontFamily: "monospace", color: isUser ? "#D4AF37" : "rgba(255,255,255,0.3)", fontWeight: isUser ? 700 : 400 }}>
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", textAlign: "right", marginTop: 4 }}>
        {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

// ─── Ranking drag-and-drop ────────────────────────────────────────────────────

function SortableItem({ id, position, label }: { id: string; position: number; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "box-shadow 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${isDragging ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.1)"}`,
        background: isDragging ? "rgba(57,255,20,0.08)" : "rgba(255,255,255,0.03)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        zIndex: isDragging ? 10 : 1,
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
      }}
      {...attributes}
      {...listeners}
    >
      <span style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontFamily: "monospace", fontWeight: 800,
        background: "rgba(57,255,20,0.12)",
        border: "1px solid rgba(57,255,20,0.3)",
        color: "#39FF14",
      }}>
        {position}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: "#f5f5f5" }}>{label}</span>
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>⠿</span>
    </div>
  );
}

function RankingInput({ options, value, onChange }: {
  options: string[];
  value: string[];   // ordered list, same elements as options
  onChange: (ordered: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = value.indexOf(active.id as string);
      const newIndex = value.indexOf(over.id as string);
      onChange(arrayMove(value, oldIndex, newIndex));
    }
  }

  return (
    <div>
      <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: "0.08em" }}>
        ARRASTRA para ordenar · 1 = mayor prioridad
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {value.map((opt, idx) => (
              <SortableItem key={opt} id={opt} position={idx + 1} label={opt} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ─── Formulario multi-pregunta ────────────────────────────────────────────────

function MultiQuestionForm({ questions, onSubmit, submitting }: {
  questions: QuestionDef[];
  onSubmit: (answers: Record<string, string>) => void;
  submitting: boolean;
}) {
  // answers: radio → string | multi-select → string[] | ranking → string[] (ordenado)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() => {
    // Inicializar rankings con el orden original de opciones
    const init: Record<string, string | string[]> = {};
    for (const q of questions) {
      if (q.type === "ranking" && q.options) {
        init[q.id] = [...q.options];
      }
    }
    return init;
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const sorted = [...questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const total = sorted.length;
  const answered = sorted.filter((q) => {
    if (q.type === "ranking") return true;  // siempre tiene orden inicial
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
    // Serializar: multi-select y ranking como "opt1||opt2||..."
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
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
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
                    <p style={{ fontSize: 9, fontFamily: "monospace", color: "#D4AF37", marginBottom: 2, letterSpacing: "0.08em" }}>
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

            {q.type === "ranking" && q.options && (
              <RankingInput
                options={q.options}
                value={(answers[q.id] as string[]) ?? [...q.options]}
                onChange={(ordered) => setAnswers((p) => ({ ...p, [q.id]: ordered }))}
              />
            )}

            {q.type === "scale" && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, justifyContent: "center" }}>
                  {Array.from({ length: (q.scale_max ?? 5) - (q.scale_min ?? 1) + 1 }, (_, i) => (q.scale_min ?? 1) + i).map((n, idx) => {
                    const sel = answers[q.id] === String(n);
                    const label = q.scale_labels?.[idx] || "";
                    return (
                      <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <button onClick={() => setAnswers((p) => ({ ...p, [q.id]: String(n) }))}
                          style={{ width: 48, height: 48, borderRadius: 10, border: `1.5px solid ${sel ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(57,255,20,0.18)" : "rgba(255,255,255,0.02)", color: sel ? "#39FF14" : "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "monospace", fontWeight: sel ? 800 : 400, cursor: "pointer", transition: "all 0.15s" }}>
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
  const [scaleVal, setScaleVal] = useState(poll.scale_min ?? 1);

  if (poll.poll_type === "multiple_choice") {
    return (
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {(poll.options || []).map((opt) => {
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
        {Array.from({ length: (poll.scale_max ?? 5) - (poll.scale_min ?? 1) + 1 }, (_, i) => (poll.scale_min ?? 1) + i).map((n) => {
          const sel = scaleVal === n;
          return (
            <button key={n} onClick={() => setScaleVal(n)}
              style={{ width: 50, height: 50, borderRadius: 10, border: `1.5px solid ${sel ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(57,255,20,0.18)" : "rgba(255,255,255,0.02)", color: sel ? "#39FF14" : "rgba(255,255,255,0.6)", fontSize: 16, fontFamily: "monospace", fontWeight: sel ? 800 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
          {poll.scale_min ?? 1}{poll.scale_min_label ? ` — ${poll.scale_min_label}` : " — Mínimo"}
        </span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
          {poll.scale_max_label ? `${poll.scale_max_label} — ` : "Máximo — "}{poll.scale_max ?? 5}
        </span>
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

function CrossTabsPanel({ pollId, pollType }: { pollId: string; pollType: "multiple_choice" | "scale" | "ranking" }) {
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
                {pollType === "ranking" ? (
                  /* Ranking: posición promedio por opción (1-based, menor = más preferida) */
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {group.breakdown.map((b, bi) => (
                      <div key={b.option} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontFamily: "monospace", fontWeight: 800,
                          background: bi === 0 ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.05)",
                          color: bi === 0 ? "#D4AF37" : "rgba(255,255,255,0.3)",
                        }}>
                          {bi + 1}
                        </span>
                        <span style={{ flex: 1, fontSize: 10, color: bi === 0 ? "#f5f5f5" : "rgba(255,255,255,0.6)" }}>
                          {b.option}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,229,255,0.7)", flexShrink: 0 }}>
                          {b.avg_position != null ? `pos. ${b.avg_position}` : "–"}
                        </span>
                        <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", width: 36, textAlign: "right", flexShrink: 0 }}>
                          {b.first_place_pct ?? 0}% #1
                        </span>
                      </div>
                    ))}
                  </div>
                ) : pollType === "multiple_choice" ? (
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
  const [userVote, setUserVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);

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

  const fetchPoll = useCallback(async (code?: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      // Usar endpoint by-slug — URL canónica: /encuestas/{slug}
      const url = code
        ? `${API_URL}/api/v1/polls/by-slug/${slug}?access_code=${encodeURIComponent(code)}`
        : `${API_URL}/api/v1/polls/by-slug/${slug}`;
      const res = await fetch(url);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPoll(await res.json());
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [slug]);

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
      if (!res.ok) throw new Error(data.detail || "Error al votar");
      setUserVote(optionValue);
      setVoted(true);
      await fetchPoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al votar");
    } finally { setVoting(false); }
  }

  async function handleMultiVote(answers: Record<string, string>) {
    if (!poll?.questions?.length) return;
    const firstQ = [...poll.questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))[0];
    await doVote(answers[firstQ.id]);
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
            {(poll?.slug || slug).toUpperCase()}
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
              <SocialShareBar url={pageUrl} title={poll.title} />
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
              <div>
                <div style={{ borderRadius: 16, padding: "22px 24px", textAlign: "center", background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", marginBottom: 20 }}>
                  <p style={{ fontSize: 32, marginBottom: 10 }}>✅</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#39FF14", marginBottom: 4 }}>¡Gracias por participar!</p>
                  <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                    Tu respuesta fue registrada con ponderación por integridad.
                  </p>
                </div>
                <PollResults poll={poll} userVote={userVote} />
              </div>
            ) : !poll.is_open ? (
              <div>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
                  Resultados finales
                </p>
                <PollResults poll={poll} userVote={null} />
              </div>
            ) : !token ? (
              <div style={{ borderRadius: 14, padding: "20px 22px", background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.12)", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#00E5FF", fontFamily: "monospace", marginBottom: 6 }}>
                  Inicia sesión para participar
                </p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* ── Card 1: Resultados Verificados ── */}
                    <div style={{
                      borderRadius: 16,
                      padding: "18px 20px",
                      background: "rgba(212,175,55,0.04)",
                      border: "1px solid rgba(212,175,55,0.2)",
                    }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                          Resultados Verificados
                        </p>
                        <span style={{
                          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                          color: "#D4AF37", background: "rgba(212,175,55,0.12)",
                          border: "1px solid rgba(212,175,55,0.3)",
                          borderRadius: 20, padding: "2px 10px", letterSpacing: "0.06em",
                        }}>
                          VERIFICADOS ✓
                        </span>
                      </div>

                      {poll.verified_votes > 0 ? (
                        <PollResults
                          poll={poll}
                          userVote={(voted && isVerified) ? userVote : null}
                          results={poll.results_verified}
                          totalVotes={poll.verified_votes}
                        />
                      ) : (
                        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "12px 0" }}>
                          Sin votos verificados aún
                        </p>
                      )}

                      {/* Footer */}
                      <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(212,175,55,0.5)", textAlign: "right", marginTop: 10 }}>
                        {poll.verified_votes} {poll.verified_votes === 1 ? "voto" : "votos"} verificados
                      </p>
                    </div>

                    {/* ── Card 2: Resultados Totales ── (sin cambio de posición) */}
                    <div style={{
                      borderRadius: 16,
                      padding: "18px 20px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                          Resultados Totales
                        </p>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontSize: 9, fontFamily: "monospace",
                          color: poll.is_open ? "#39FF14" : "rgba(255,255,255,0.3)",
                        }}>
                          {poll.is_open && (
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#39FF14", display: "inline-block" }} />
                          )}
                          {poll.is_open ? "EN VIVO" : "CERRADA"}
                        </span>
                      </div>

                      <PollResults poll={poll} userVote={voted ? userVote : null} />

                      {/* Footer con breakdown */}
                      <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", textAlign: "right", marginTop: 10 }}>
                        {poll.total_votes} votos totales
                        {poll.verified_votes > 0 && (
                          <span style={{ color: "rgba(255,255,255,0.15)" }}>
                            {" "}·{" "}
                            <span style={{ color: "rgba(212,175,55,0.5)" }}>{poll.verified_votes} verificados</span>
                            {" · "}
                            {poll.basic_votes} básicos
                          </span>
                        )}
                      </p>
                    </div>

                    {/* ── Card 3: Análisis Demográfico (solo admins) ── */}
                    {isAdmin && poll.verified_votes > 0 && (
                      <CrossTabsPanel pollId={poll.id} pollType={poll.poll_type} />
                    )}

                  </div>
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
                      <p style={{ fontSize: 18, marginBottom: 8 }}>🔒</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#f5f5f5", marginBottom: 4 }}>
                        Verifica tu identidad para ver resultados
                      </p>
                      <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>
                        Los ciudadanos VERIFIED acceden a resultados en tiempo real.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.1)", textAlign: "center", marginTop: 22 }}>
              {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"} · BASIC 0.5× · VERIFIED 1.0× · BEACON Protocol
            </p>
          </div>
        </div>


        {/* ══════════════════════════════════════════
         *  COMENTARIOS / REACCIONES CIUDADANAS
         * ══════════════════════════════════════════ */}
        <PollCommentsSection pollId={poll.id} pollSlug={poll.slug} isOpen={poll.is_open} />

      </div>
    </div>
  );
}
