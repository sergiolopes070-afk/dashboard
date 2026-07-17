"use client";

import { useState, useRef, useEffect } from "react";
import { Entite, ENTITES, ENTITE_BADGE, ENTITE_SHORT, resolveEntite, getEntite } from "@/lib/entite";

// Badge d'entité juridique cliquable. Affiche l'entité résolue (déduite du type,
// ou corrigée manuellement) et permet de la corriger via un petit menu.
// La correction est gérée par le parent (onSet) qui persiste dans settings.
export default function EntiteBadge({
  prestationId,
  typePresta,
  overrides,
  onSet,
  className = "",
}: {
  prestationId: string;
  typePresta: string;
  overrides: Record<string, Entite>;
  onSet: (prestationId: string, entite: Entite | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const resolved = resolveEntite(prestationId, typePresta, overrides);
  const auto = getEntite(typePresta);
  const isOverridden = !!overrides[prestationId];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(e: React.MouseEvent, entite: Entite | null) {
    e.stopPropagation();
    // Choisir la valeur auto = suppression de l'exception.
    onSet(prestationId, entite && entite !== auto ? entite : null);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title={isOverridden ? "Entité corrigée manuellement — cliquer pour modifier" : "Cliquer pour corriger l'entité"}
        className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium inline-flex items-center gap-0.5 hover:brightness-95 transition ${ENTITE_BADGE[resolved]}`}
      >
        {ENTITE_SHORT[resolved]}
        {isOverridden && <span className="opacity-60">✎</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-left">
          {ENTITES.map((ent) => (
            <button
              key={ent}
              type="button"
              onClick={(e) => choose(e, ent)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between ${resolved === ent ? "font-semibold text-gray-900" : "text-gray-600"}`}
            >
              {ent}
              {resolved === ent && <span className="text-blue-600">✓</span>}
            </button>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            onClick={(e) => choose(e, null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
          >
            Auto ({ENTITE_SHORT[auto]})
          </button>
        </div>
      )}
    </div>
  );
}
