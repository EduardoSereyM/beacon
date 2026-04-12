/**
 * CreatePollButton
 * ────────────────
 * Button component that allows admin users to create polls.
 * Non-admin users see a "Coming soon" modal.
 */

"use client";

import { useState } from "react";

interface CreatePollButtonProps {
  isAdmin: boolean;
  onCreateClick?: () => void;
}

export default function CreatePollButton({ isAdmin, onCreateClick }: CreatePollButtonProps) {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  const handleClick = () => {
    if (isAdmin && onCreateClick) {
      onCreateClick();
    } else if (!isAdmin) {
      setShowComingSoonModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!isAdmin}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all ${
          isAdmin
            ? "cursor-pointer hover:scale-105 active:scale-95"
            : "cursor-not-allowed opacity-50"
        }`}
        style={{
          backgroundColor: isAdmin ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${isAdmin ? "rgba(57,255,20,0.3)" : "rgba(255,255,255,0.1)"}`,
          color: isAdmin ? "#39FF14" : "rgba(255,255,255,0.4)",
        }}
      >
        ✨ Crear Encuesta
      </button>

      {/* Coming Soon Modal */}
      {showComingSoonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowComingSoonModal(false)}
        >
          <div
            className="max-w-sm w-full rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "rgba(17,17,17,0.95)",
              border: "1px solid rgba(57,255,20,0.2)",
              backdropFilter: "blur(10px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-4">✨</div>
            <h2 className="text-lg font-bold mb-3" style={{ color: "#39FF14" }}>
              Próximamente
            </h2>
            <p className="text-sm text-foreground-muted mb-6">
              Los usuarios podrán crear encuestas pronto. Por ahora, solo administradores pueden crear.
            </p>
            <button
              onClick={() => setShowComingSoonModal(false)}
              className="w-full px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
              style={{
                backgroundColor: "rgba(57,255,20,0.15)",
                border: "1px solid rgba(57,255,20,0.3)",
                color: "#39FF14",
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
