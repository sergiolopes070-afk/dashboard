"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Visionneuse plein écran des photos d'intervention, avec navigation :
//   • flèches à l'écran (← →)   • clavier (←/→/Échap)   • glissement tactile
// Réutilisée par l'agenda, la fiche client et la modale prestation.
export interface LightboxPhoto {
  url: string;
  article?: string;
  phase?: string; // "avant" | "apres"
  path?: string;
}

export default function PhotoLightbox({ photos, startIndex = 0, onClose }: {
  photos: LightboxPhoto[];
  startIndex?: number;
  onClose: () => void;
}) {
  const n = photos.length;
  const [i, setI] = useState(Math.min(Math.max(startIndex, 0), Math.max(n - 1, 0)));
  const touchX = useRef<number | null>(null);

  const go = useCallback((d: number) => { if (n) setI(p => (p + d + n) % n); }, [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (n === 0) return null;
  const p = photos[i];
  const phaseLabel = p.phase === "avant" ? "AVANT" : p.phase === "apres" ? "APRÈS" : "";
  const phaseCls   = p.phase === "avant" ? "bg-orange-500" : p.phase === "apres" ? "bg-green-600" : "bg-white/20";

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/90 flex flex-col select-none"
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={e => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Barre du haut */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          {p.article && <span className="text-sm font-medium truncate">{p.article}</span>}
          {phaseLabel && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${phaseCls}`}>{phaseLabel}</span>}
        </div>
        <span className="text-sm text-white/70 shrink-0">{i + 1} / {n}</span>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">
          <X size={18} />
        </button>
      </div>

      {/* Image + flèches */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden px-2" onClick={e => e.stopPropagation()}>
        {n > 1 && (
          <button onClick={() => go(-1)} aria-label="Précédente"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center z-10">
            <ChevronLeft size={26} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.article || "photo"} className="max-h-full max-w-full object-contain rounded-lg" />
        {n > 1 && (
          <button onClick={() => go(1)} aria-label="Suivante"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center z-10">
            <ChevronRight size={26} />
          </button>
        )}
      </div>

      {/* Pastilles de position */}
      {n > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-4" onClick={e => e.stopPropagation()} style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {photos.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
              className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
