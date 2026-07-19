"use client";

import { useState, useEffect } from "react";
import { Mail, Bell, Loader2 } from "lucide-react";

// Boutons d'emails MANUELS pour une prestation (réutilisé : modale Prestations,
// panneau détail Agenda…). « Besoin d'infos » (client injoignable) + « Démarrer
// les relances » (envoie la 1re relance et amorce la séquence auto).
export default function EmailActions({
  prestationId,
  clientEmail,
  compact = false,
}: {
  prestationId: string;
  clientEmail?: string | null;
  compact?: boolean;
}) {
  const [busy, setBusy]             = useState<"" | "relance" | "besoin_infos">("");
  const [relanceNiveau, setNiveau]  = useState<number | null>(null);
  const [feedback, setFeedback]     = useState("");

  useEffect(() => {
    fetch(`/api/emails/action?prestationId=${prestationId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setNiveau(d.relance ?? 0); })
      .catch(() => {});
  }, [prestationId]);

  async function send(type: "relance" | "besoin_infos") {
    setBusy(type); setFeedback("");
    try {
      const res = await fetch("/api/emails/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestationId, type }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      if (type === "relance") {
        setNiveau(d.relance ?? 1);
        setFeedback("✅ 1re relance envoyée — les suivantes s'enchaînent automatiquement.");
      } else {
        setFeedback("✅ Email « besoin d'infos » envoyé au client.");
      }
    } catch (e) {
      setFeedback(`❌ ${e instanceof Error ? e.message : "Erreur d'envoi"}`);
    } finally {
      setBusy("");
    }
  }

  if (!clientEmail) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
        Pas d&apos;adresse email pour ce client — impossible d&apos;envoyer.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => send("besoin_infos")}
          disabled={busy !== ""}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {busy === "besoin_infos" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Besoin d&apos;infos
        </button>
        <button
          type="button"
          onClick={() => send("relance")}
          disabled={busy !== "" || (relanceNiveau ?? 0) >= 1}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors disabled:cursor-default text-white bg-orange-500 border-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200"
        >
          {busy === "relance" ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          {(relanceNiveau ?? 0) >= 1 ? `Relances en cours (niv. ${relanceNiveau})` : "Démarrer les relances"}
        </button>
      </div>
      {!compact && (
        <p className="text-[11px] text-gray-400">
          « Besoin d&apos;infos » : on a essayé de vous joindre, il nous manque des éléments pour le devis. « Démarrer les relances » envoie la 1re relance ; les suivantes (J+2, J+4) s&apos;enchaînent automatiquement.
        </p>
      )}
      {feedback && (
        <p className={`text-xs font-medium ${feedback.startsWith("❌") ? "text-red-600" : "text-green-600"}`}>{feedback}</p>
      )}
    </div>
  );
}
