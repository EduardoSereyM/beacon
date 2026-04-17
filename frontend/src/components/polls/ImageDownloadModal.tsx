"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store";

interface Question {
  id: string;
  text: string;
  type: "multiple_choice" | "scale";
  options?: string[] | null;
}

interface ImageDownloadModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  questions: Question[];
  totalVotes: number;
  verifiedVotes: number;
}

export default function ImageDownloadModal({
  open,
  onClose,
  slug,
  title,
  questions,
  totalVotes,
  verifiedVotes,
}: ImageDownloadModalProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [format, setFormat] = useState<"1080x1080" | "1200x630">("1080x1080");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateAnother, setShowGenerateAnother] = useState(false);
  const { token } = useAuthStore();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Inicializar pregunta seleccionada
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion) {
      setSelectedQuestion(questions[0].id);
    }
  }, [questions, selectedQuestion]);

  // Cargar preview cuando cambia formato
  useEffect(() => {
    if (selectedQuestion && open) {
      handleLoadPreview();
    }
  }, [format, selectedQuestion, open]);

  async function handleLoadPreview() {
    if (!selectedQuestion) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        question_id: selectedQuestion,
        format,
      });

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/v1/images/polls/${slug}/generate?${params}`, {
        headers,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error cargando imagen");
      }

      const data = await res.json();
      setPreviewUrl(data.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!selectedQuestion || !previewUrl) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        question_id: selectedQuestion,
        format,
      });

      const headers: HeadersInit = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/v1/images/polls/${slug}/generate?${params}`, {
        headers,
      });

      if (!res.ok) {
        throw new Error("Error descargando imagen");
      }

      const data = await res.json();
      const downloadUrl = data.image_url;
      const downloadName = data.download_name || `beacon-${slug}.png`;

      // Descargar archivo
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = downloadName;
      link.click();

      // Mostrar "¿Generar otra?"
      setShowGenerateAnother(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error descargando");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerateAnother() {
    setShowGenerateAnother(false);
    setSelectedQuestion("");
    setPreviewUrl(null);
    setError(null);
    if (questions.length > 0) {
      setSelectedQuestion(questions[0].id);
    }
  }

  function handleCancel() {
    onClose();
    setSelectedQuestion("");
    setPreviewUrl(null);
    setError(null);
    setShowGenerateAnother(false);
  }

  if (!open) return null;

  const selectedQ = questions.find((q) => q.id === selectedQuestion);
  const optionCount = selectedQ?.options?.length || 0;
  const hasWarning = optionCount > 10;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !showGenerateAnother) handleCancel();
      }}
    >
      <div
        className="rounded-2xl p-8 max-w-md w-full mx-4 flex flex-col max-h-[90vh] overflow-y-auto"
        style={{
          background: "rgba(15,15,15,0.98)",
          border: "1px solid rgba(0,229,255,0.2)",
        }}
      >
        {/* Header */}
        <p style={{ fontSize: 13, fontFamily: "monospace", color: "#D4AF37", margin: 0, marginBottom: 20, fontWeight: 700 }}>
          {showGenerateAnother ? "¿Generar otra imagen?" : "Selecciona pregunta para compartir"}
        </p>

        {/* Contenido principal */}
        {!showGenerateAnother ? (
          <>
            {/* Selector de pregunta */}
            {questions.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "0 0 12px", fontFamily: "monospace" }}>
                  PREGUNTAS ({questions.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {questions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setSelectedQuestion(q.id)}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        fontSize: 12,
                        fontFamily: "monospace",
                        border: selectedQuestion === q.id ? "1px solid #D4AF37" : "1px solid rgba(255,255,255,0.1)",
                        background: selectedQuestion === q.id ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.02)",
                        color: selectedQuestion === q.id ? "#D4AF37" : "rgba(255,255,255,0.7)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="radio"
                        checked={selectedQuestion === q.id}
                        onChange={() => setSelectedQuestion(q.id)}
                        style={{ marginRight: 8 }}
                      />
                      {q.text.substring(0, 50)}...
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Advertencia de muchas opciones */}
            {hasWarning && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,193,7,0.08)",
                  border: "1px solid rgba(255,193,7,0.3)",
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 11, color: "#FFC107", margin: 0, fontFamily: "monospace" }}>
                  ⚠️ Esta pregunta tiene {optionCount} opciones. Se mostrarán solo las primeras 10.
                </p>
              </div>
            )}

            {/* Selector de formato */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "0 0 12px", fontFamily: "monospace" }}>
                FORMATO
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {["1080x1080", "1200x630"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt as "1080x1080" | "1200x630")}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      border: format === fmt ? "1px solid #D4AF37" : "1px solid rgba(255,255,255,0.1)",
                      background: format === fmt ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.02)",
                      color: format === fmt ? "#D4AF37" : "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      textAlign: "center",
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "0 0 12px", fontFamily: "monospace" }}>
                VISTA PREVIA
              </p>
              {loading && (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: format === "1080x1080" ? "1/1" : "1200/630",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  Generando...
                </div>
              )}
              {previewUrl && !loading && (
                <img
                  src={previewUrl}
                  alt="Vista previa"
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,7,58,0.1)",
                  border: "1px solid rgba(255,7,58,0.3)",
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 11, color: "#FF073A", margin: 0, fontFamily: "monospace" }}>
                  {error}
                </p>
              </div>
            )}

            {/* Botones */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCancel}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDownload}
                disabled={loading || !previewUrl || !selectedQuestion}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  border: "none",
                  background: loading || !previewUrl ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.6)",
                  color: "#0A0A0A",
                  cursor: loading || !previewUrl ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  opacity: loading || !previewUrl ? 0.5 : 1,
                }}
              >
                {loading ? "Descargando..." : "↓ Descargar"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Post-descarga */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "0 0 16px", textAlign: "center", lineHeight: 1.5 }}>
                ✓ Imagen descargada correctamente
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, textAlign: "center", fontFamily: "monospace" }}>
                ¿Deseas generar otra imagen para compartir?
              </p>
            </div>

            {/* Botones post-descarga */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCancel}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Cerrar
              </button>
              <button
                onClick={handleGenerateAnother}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  border: "none",
                  background: "rgba(212,175,55,0.6)",
                  color: "#0A0A0A",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                ↻ Generar otra
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
