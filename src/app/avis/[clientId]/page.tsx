"use client";
import { useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";

// Lien direct vers le formulaire d'écriture d'avis Google Maps (#lrd=CID,3 = write review)
const GOOGLE_REVIEW_URL =
  "https://www.google.com/maps/place/Kinouclean/@48.7630231,2.1122147,17z/data=!4m6!3m5!1s0x4b9518e5d12e9c1:0xacccf858f4e69576!8m2!3d48.7630231!4d2.1122147!16s%2Fg%2F11njljl30f#lrd=0x4b9518e5d12e9c1:0xacccf858f4e69576,3,,";

// Composant interne qui utilise useSearchParams (doit être dans un Suspense)
function AvisContent() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const clientId     = params.clientId as string;
  const clientName   = searchParams.get("nom")       || "Client";
  const prestation   = searchParams.get("prestation") || "";

  const [rating,    setRating]    = useState(0);
  const [hovered,   setHovered]   = useState(0);
  const [comment,   setComment]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const effective = hovered || rating;

  async function handleSubmit() {
    if (!rating) return;
    setSubmitting(true);
    try {
      await fetch("/api/avis", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ clientId, clientName, prestation, rating, comment }),
      });
      if (rating >= 4) {
        setRedirecting(true);
        // Copier le commentaire dans le presse-papier pour faciliter le collage sur Google
        if (comment.trim()) {
          navigator.clipboard.writeText(comment).catch(() => {});
        }
        setTimeout(() => { window.location.href = GOOGLE_REVIEW_URL; }, 1200);
      } else {
        setDone(true);
      }
    } catch {
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Écran de confirmation (≤ 3 étoiles) ──────────────────────────────────
  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ background: "#1e1e2e", borderRadius: 20, padding: "48px 32px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🙏</div>
          <h2 style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Merci pour votre retour !</h2>
          <p style={{ color: "#a0a0b0", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Votre avis a bien été transmis à notre équipe. Nous en tenons compte pour améliorer nos services.
          </p>
        </div>
      </div>
    );
  }

  // ── Écran de redirection vers Google (≥ 4 étoiles) ───────────────────────
  if (redirecting) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ background: "#1e1e2e", borderRadius: 20, padding: "48px 32px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>⭐</div>
          <h2 style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Merci {clientName.split(" ")[0]} !</h2>
          <p style={{ color: "#a0a0b0", fontSize: 15, lineHeight: 1.6, margin: "0 0 8px" }}>
            Nous vous redirigeons vers Google pour publier votre avis…
          </p>
          {comment.trim() && (
            <p style={{ color: "#7b93ff", fontSize: 13, margin: "0 0 20px" }}>
              📋 Votre commentaire a été copié — collez-le directement sur Google !
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#2a3694", animation: `pulse 1s ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Formulaire principal ──────────────────────────────────────────────────
  const isHigh = rating >= 4;
  const isLow  = rating > 0 && rating <= 3;

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
            alt="KinouClean"
            style={{ height: 56, objectFit: "contain" }}
          />
        </div>

        {/* Card */}
        <div style={{ background: "#1e1e2e", borderRadius: 20, padding: 32, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>

          <h1 style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: "0 0 6px", textAlign: "center" }}>
            Votre avis nous est précieux
          </h1>
          <p style={{ color: "#a0a0b0", fontSize: 14, textAlign: "center", margin: "0 0 28px" }}>
            Bonjour <strong style={{ color: "#d0d0e0" }}>{clientName}</strong>
            {prestation ? ` — ${prestation}` : ""}
          </p>

          {/* Étoiles */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            {[1,2,3,4,5].map(i => (
              <button
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  fontSize: 44,
                  lineHeight: 1,
                  transform: effective >= i ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.15s, filter 0.15s",
                  filter: effective >= i ? "drop-shadow(0 0 6px #f59e0b)" : "grayscale(1) opacity(0.4)",
                }}
              >
                ★
              </button>
            ))}
          </div>

          {/* Message contextuel */}
          {isHigh && (
            <div style={{
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 18,
              textAlign: "center",
              fontSize: 13,
              background: "rgba(42,54,148,0.25)",
              color: "#7b93ff",
              border: "1px solid rgba(42,54,148,0.5)",
            }}>
              ✨ Votre avis sera publié sur Google
            </div>
          )}

          {/* Commentaire */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: "#a0a0b0", fontSize: 13, marginBottom: 8 }}>
              Commentaire <span style={{ color: "#555" }}>(optionnel)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder="Partagez votre expérience…"
              style={{
                width: "100%",
                background: "#13131f",
                border: "1px solid #2a2a3e",
                borderRadius: 10,
                color: "#e0e0f0",
                fontSize: 14,
                padding: "12px 14px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Bouton */}
          <button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: rating ? "#2a3694" : "#2a2a3e",
              color: rating ? "#ffffff" : "#555",
              fontSize: 15,
              fontWeight: 700,
              cursor: rating ? "pointer" : "not-allowed",
              transition: "background 0.2s",
            }}
          >
            {submitting ? "Envoi en cours…" : rating >= 4 ? "Publier mon avis ⭐" : rating > 0 ? "Envoyer mon retour" : "Sélectionnez une note"}
          </button>

        </div>

        <p style={{ color: "#555", fontSize: 12, textAlign: "center", marginTop: 16 }}>
          KinouClean — Service de nettoyage professionnel
        </p>
      </div>
    </div>
  );
}

// Export default avec Suspense obligatoire pour useSearchParams en Next.js 14
export default function AvisPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#a0a0b0", fontSize: 14 }}>Chargement…</p>
      </div>
    }>
      <AvisContent />
    </Suspense>
  );
}
