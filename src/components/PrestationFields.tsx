"use client";
// Champs de prestation adaptatifs, pilotés par le schéma (src/lib/prestationSchema).
// Réutilisable dans n'importe quel formulaire. Produit un résumé lisible via
// onDetailChange (à stocker dans le champ "quantité").
import { useState, useEffect, useRef } from "react";
import { getSchema, buildDetail } from "@/lib/prestationSchema";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

export default function PrestationFields({
  typePresta,
  onDetailChange,
  initialValues,
}: {
  typePresta: string;
  onDetailChange: (detail: string, values: Record<string, string>) => void;
  initialValues?: Record<string, string>;
}) {
  const fields = getSchema(typePresta);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const onChangeRef = useRef(onDetailChange);
  onChangeRef.current = onDetailChange;
  const firstRun = useRef(true);

  // Réinitialise les valeurs quand le type change — mais PAS au tout premier
  // rendu, pour préserver un éventuel pré-remplissage (conversion d'un prospect).
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setValues({});
  }, [typePresta]);

  // Remonte le résumé au parent à chaque changement
  useEffect(() => {
    onChangeRef.current(buildDetail(fields, values), values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, typePresta]);

  if (fields.length === 0) return null;

  const set = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
          {f.type === "select" ? (
            <select value={values[f.key] || ""} onChange={e => set(f.key, e.target.value)} className={inputCls}>
              <option value="">— Choisir —</option>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.type === "number" ? "number" : "text"}
              value={values[f.key] || ""}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className={inputCls}
            />
          )}
        </div>
      ))}
    </div>
  );
}
