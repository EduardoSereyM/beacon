/**
 * PollCard
 * ────────
 * Reusable poll card component for home page display.
 * Shows poll info, image, vote count, and status badge.
 */

"use client";

import Link from "next/link";

interface PollCardProps {
  id: string;
  slug?: string | null;   // preferido para URL canónica; fallback a id
  title: string;
  headerImage?: string | null;
  totalVotes: number;
  endsAt: string;
  isOpen: boolean;
  requiresAuth: boolean;
  size?: "small" | "medium" | "large";
}

export default function PollCard({
  id,
  slug,
  title,
  headerImage,
  totalVotes,
  endsAt,
  isOpen,
  requiresAuth,
  size = "small",
}: PollCardProps) {
  const sizeClasses = {
    small: { container: "h-auto", image: "h-[120px]", padding: "px-4 py-3", title: "text-sm", meta: "text-xs" },
    medium: { container: "h-auto", image: "h-[160px]", padding: "px-5 py-4", title: "text-base", meta: "text-sm" },
    large: { container: "h-auto", image: "h-[200px]", padding: "px-6 py-5", title: "text-lg", meta: "text-base" },
  };

  const sizeConfig = sizeClasses[size];
  const endsAtDate = new Date(endsAt).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });

  return (
    <Link href={`/encuestas/${slug || id}`} style={{ textDecoration: "none" }}>
      <div
        className={sizeConfig.container}
        style={{
          background: "rgba(17,17,17,0.9)",
          border: `1px solid ${isOpen ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 16,
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 0.2s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = isOpen ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.15)";
          el.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = isOpen ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.07)";
          el.style.transform = "translateY(0)";
        }}
      >
        {/* Image Section */}
        <div
          className={sizeConfig.image}
          style={{
            background: headerImage
              ? "transparent"
              : "linear-gradient(135deg, rgba(57,255,20,0.08) 0%, rgba(0,229,255,0.08) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {headerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerImage}
              alt={title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <span style={{ fontSize: 32, opacity: 0.4 }}>📊</span>
          )}

          {/* Status Badge */}
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              fontSize: 9,
              fontFamily: "monospace",
              padding: "2px 8px",
              borderRadius: 20,
              background: isOpen ? "rgba(57,255,20,0.15)" : "rgba(0,0,0,0.6)",
              color: isOpen ? "#39FF14" : "rgba(255,255,255,0.4)",
              border: `1px solid ${isOpen ? "rgba(57,255,20,0.3)" : "rgba(255,255,255,0.12)"}`,
            }}
          >
            {isOpen ? "● ABIERTA" : "CERRADA"}
          </span>

          {/* Flash Badge */}
          {!requiresAuth && (
            <span
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                fontSize: 9,
                fontFamily: "monospace",
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(57,255,20,0.12)",
                color: "#39FF14",
                border: "1px solid rgba(57,255,20,0.2)",
              }}
            >
              ⚡ Flash
            </span>
          )}
        </div>

        {/* Content Section */}
        <div className={sizeConfig.padding}>
          <p
            className={`${sizeConfig.title} font-bold mb-2`}
            style={{
              color: "#f5f5f5",
              lineHeight: 1.3,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
            }}
          >
            {title}
          </p>
          <p
            className={`${sizeConfig.meta} font-mono`}
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {totalVotes} votos · Cierra {endsAtDate}
          </p>
        </div>
      </div>
    </Link>
  );
}
