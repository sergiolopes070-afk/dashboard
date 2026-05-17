"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";

const GOOGLE_REVIEW_URL = "https://share.google/i8O91Q5iL8bpbSqFb";

export default function AvisPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const clientId = params.clientId as string;
  const clientName = searchParams.get("nom") || "Client";
  const prestation = searchParams.get("prestation") || "";

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done_private" | "done_redirect">("idle");

  const handleSubmit = async () => {
    if (rating === 0) return;
    setStatus("sending");

    if (rating >= 4) {
      setStatus("done_redirect");
      setTimeout(() => {
        window.location.href = GOOGLE_REVIEW_URL;
      }, 1200);
      return;
    }

    await fetch("/api/avis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientName, prestation, rating, comment }),
    });
    setStatus("done_private");
  };

  const starDisplay = hovered || rating;

  if (status === "done_private") {
    return (
      <Screen>
        <div className="text-center space-y-4">
          <div className="text-5xl">🙏</div>
          <h2 className="text-2xl font-bold text-white">Merci pour votre retour</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Votre avis a bien été transmis à notre équipe.<br />
            Nous en tiendrons compte pour améliorer nos services.
          </p>
        </div>
      </Screen>
    );
  }

  if (status === "done_redirect") {
    return (
      <Screen>
        <div className="text-center space-y-4">
          <div className="text-5xl">⭐</div>
          <h2 className="text-2xl font-bold text-white">Merci !</h2>
          <p className="text-gray-400 text-sm">
            Vous allez être redirigé vers Google pour publier votre avis…
          </p>
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <div className="bg-[#1a1a2e] rounded-xl px-8 py-4">
          <img
            src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
            alt="KinouClean"
            className="h-12 w-auto"
          />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white text-center mb-1">
        Comment s&apos;est passée votre prestation ?
      </h1>
      {clientName && (
        <p className="text-gray-400 text-sm text-center mb-6">
          Bonjour <span className="text-white font-medium">{clientName}</span>
          {prestation ? ` — ${prestation}` : ""}
        </p>
      )}

      {/* Étoiles */}
      <div className="flex justify-center gap-3 mb-6">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setRating(n)}
            className="transition-transform hover:scale-110"
          >
            <Star
              size={44}
              className={
                n <= starDisplay
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-transparent text-gray-600"
              }
            />
          </button>
        ))}
      </div>

      {/* Label de la note */}
      {rating > 0 && (
        <p className="text-center text-sm mb-4 font-medium" style={{ color: rating <= 3 ? "#f87171" : "#4ade80" }}>
          {rating === 1 && "Très insatisfait"}
          {rating === 2 && "Insatisfait"}
          {rating === 3 && "Moyen"}
          {rating === 4 && "Satisfait"}
          {rating === 5 && "Très satisfait !"}
        </p>
      )}

      {/* Commentaire (toujours visible, optionnel) */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={
          rating <= 3 && rating > 0
            ? "Dites-nous ce que nous pouvons améliorer…"
            : "Laissez un commentaire (optionnel)…"
        }
        rows={4}
        className="w-full bg-[#252535] border border-[#3a3a5a] text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
      />

      {/* Explication selon note */}
      {rating >= 4 && (
        <p className="text-xs text-gray-500 text-center mb-4">
          Votre avis sera publié sur Google — merci de votre confiance !
        </p>
      )}
      {rating > 0 && rating <= 3 && (
        <p className="text-xs text-gray-500 text-center mb-4">
          Votre retour restera confidentiel et sera transmis directement à notre équipe.
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={rating === 0 || status === "sending"}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: rating === 0 ? "#2a2a3e" : "linear-gradient(135deg, #2a3694, #4a7fd4)",
          color: "white",
        }}
      >
        {status === "sending" ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1e1e2e] rounded-2xl p-8 shadow-2xl border border-[#2a2a3e]">
        {children}
      </div>
    </div>
  );
}
