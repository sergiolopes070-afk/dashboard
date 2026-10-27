"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Surveille un paramètre d'URL (?fiche=…) et prévient la page à CHAQUE changement,
// y compris lors d'une navigation <Link> sans rechargement (recherche globale) —
// un simple useEffect([]) ne le lit qu'au premier montage de la page.
// useSearchParams est isolé dans son propre Suspense : la page reste rendue
// normalement (pas de bascule en rendu 100 % client).
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

type Props = { name: string; onChange: (value: string | null) => void };

function Watcher({ name, onChange }: Props) {
  const value = useSearchParams().get(name);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => { cb.current(value); }, [value]);
  return null;
}

export default function UrlParamWatcher(props: Props) {
  return <Suspense fallback={null}><Watcher {...props} /></Suspense>;
}
