"use client";
import { useEffect, useState } from "react";
import { InscritsIndex, indexInscrits, indexVide, matchInscrit } from "@/lib/avanceMatch";

// Liste des inscrits chargée UNE fois par page, partagée par tous les badges.
let chargement: Promise<InscritsIndex> | null = null;
function chargerInscrits(): Promise<InscritsIndex> {
  if (!chargement) {
    chargement = fetch("/api/avance/inscrits")
      .then(r => (r.ok ? r.json() : null))
      .then(indexInscrits)
      .catch(() => { chargement = null; return indexVide(); });
  }
  return chargement;
}

export function useAvanceInscrits(): InscritsIndex {
  const [idx, setIdx] = useState<InscritsIndex>(indexVide);
  useEffect(() => { let vivant = true; chargerInscrits().then(i => { if (vivant) setIdx(i); }); return () => { vivant = false; }; }, []);
  return idx;
}

interface Props { tel?: string | null; email?: string | null; prenom?: string | null; nom?: string | null }

// Petit badge « ⚡ Avance » : le client s'est inscrit à l'Avance Immédiate
// (détecté depuis le mail d'inscription — tél, email ou prénom + nom).
export default function AvanceBadge(props: Props) {
  const idx = useAvanceInscrits();
  if (!matchInscrit(idx, props)) return null;
  return (
    <span title="Inscrit à l'Avance Immédiate" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold leading-none flex-shrink-0">
      ⚡ Avance
    </span>
  );
}
