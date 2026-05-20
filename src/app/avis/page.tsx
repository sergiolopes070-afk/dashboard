"use client";
import { useState } from "react";

const GOOGLE_REVIEW_URL = "https://g.page/r/CXaV5vRY-MysEBM/review";

export default function AvisUniverselPage() {
  const [rating,     setRating]     = useState(0);
  const [hovered,    setHovered]    = useState(0);
  const [comment,    setComment]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [calque,     setCalque]     = useState(false);

  const effective = hovered || rating;

  async function handleSubmit() {
    if (!rating) return;
    setSubmitting(true);
    try {
      if (rating >= 4) {
        // Copier le commentaire dans le presse-papier
        if (comment.trim()) {
          try { await navigator.clipboard.writeText(comment); setCopied(true); } catch { /* silencieux */ }
        }
        // Ouvrir Google dans un nouvel onglet
        window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer");
        // Afficher le calque d'aide au collage
        setCalque(true);
      } else {
        await fetch("/api/avis", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            clientId  : "general",
            clientName: "Avis anonyme",
            prestation: "",
            rating,
            comment,
          }),
        });
        setDone(true);
      }
    } catch {
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function recopy() {
    try { await navigator.clipboard.writeText(comment); setCopied(true); } catch { /* silencieux */ }
  }

  // ── Merci (≤ 3 étoiles) ──────────────────────────────────────────────────
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

  // ── Calque "coller sur Google" (≥ 4 étoiles) ─────────────────────────────
  if (calque) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Arial, sans-serif" }}>
        <div style={{ background: "#1e1e2e", borderRadius: 20, padding: "40px 32px", maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>

          <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
          <h2 style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Merci pour vos {rating} étoiles !</h2>
          <p style={{ color: "#a0a0b0", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
            Google s&apos;est ouvert dans un nouvel onglet.
          </p>

          {comment.trim() ? (
            <>
              {/* Bloc texte copié */}
              <div style={{ background: "#13131f", border: "1px solid #2a3694", borderRadius: 12, padding: "16px 18px", marginBottom: 20, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "#7b93ff", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                    {copied ? "✅ Texte copié !" : "📋 Votre commentaire"}
                  </span>
                  <button
                    onClick={recopy}
                    style={{ background: copied ? "#1a3a1a" : "#2a3694", color: copied ? "#4ade80" : "#fff", border: "none", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {copied ? "Recopier" : "Copier"}
                  </button>
                </div>
                <p style={{ color: "#d0d0e0", fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{comment}</p>
              </div>

              {/* Raccourci clavier */}
              <div style={{ background: "rgba(42,54,148,0.2)", border: "1px solid rgba(42,54,148,0.4)", borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
                <p style={{ color: "#a0b0ff", fontSize: 13, margin: "0 0 10px" }}>
                  Allez sur l&apos;onglet Google et collez votre texte :
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <kbd style={{ background: "#1a1a2e", border: "1px solid #3a3a5e", borderRadius: 6, padding: "4px 10px", color: "#e0e0f0", fontSize: 14, fontFamily: "monospace", boxShadow: "0 2px 0 #111" }}>⌘</kbd>
                    <kbd style={{ background: "#1a1a2e", border: "1px solid #3a3a5e", borderRadius: 6, padding: "4px 10px", color: "#e0e0f0", fontSize: 14, fontFamily: "monospace", boxShadow: "0 2px 0 #111" }}>V</kbd>
                    <span style={{ color: "#555", fontSize: 12 }}>sur Mac</span>
                  </div>
                  <span style={{ color: "#333" }}>|</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <kbd style={{ background: "#1a1a2e", border: "1px solid #3a3a5e", borderRadius: 6, padding: "4px 10px", color: "#e0e0f0", fontSize: 14, fontFamily: "monospace", boxShadow: "0 2px 0 #111" }}>Ctrl</kbd>
                    <kbd style={{ background: "#1a1a2e", border: "1px solid #3a3a5e", borderRadius: 6, padding: "4px 10px", color: "#e0e0f0", fontSize: 14, fontFamily: "monospace", boxShadow: "0 2px 0 #111" }}>V</kbd>
                    <span style={{ color: "#555", fontSize: 12 }}>sur PC</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "#a0a0b0", fontSize: 14, marginBottom: 24 }}>
              Allez sur l&apos;onglet Google pour publier votre avis !
            </p>
          )}

          {/* Bouton ouvrir Google */}
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", width: "100%", padding: "14px", borderRadius: 12, background: "#2a3694", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", boxSizing: "border-box" }}
          >
            Ouvrir Google →
          </a>
        </div>
      </div>
    );
  }

  // ── Formulaire ────────────────────────────────────────────────────────────
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
            Comment s&apos;est passée votre expérience avec KinouClean ?
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
                  transition: "transform 0.15s, color 0.15s, filter 0.15s",
                  color: effective >= i ? "#f59e0b" : "#4a4a6a",
                  filter: effective >= i ? "drop-shadow(0 0 8px #f59e0b88)" : "none",
                }}
              >
                ★
              </button>
            ))}
          </div>

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
              style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 10, color: "#e0e0f0", fontSize: 14, padding: "12px 14px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Bouton */}
          <button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: rating ? "#2a3694" : "#2a2a3e", color: rating ? "#ffffff" : "#555", fontSize: 15, fontWeight: 700, cursor: rating ? "pointer" : "not-allowed", transition: "background 0.2s" }}
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
