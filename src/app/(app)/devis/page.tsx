"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { FileText, ExternalLink, Search, Download, Plus, X, Trash2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonTable } from "@/components/Skeleton";
import { Prestation } from "@/lib/constants";
import { getEntite } from "@/lib/entite";

// ─── Modal de personnalisation ─────────────────────────────────────────────────
interface LigneSupp { label: string; quantite: number; prixHT: number }
interface DevisOptions {
  etats:           string[];
  avanceImmediate: boolean;
  creditImpot:     boolean;
  lignesSupp:      LigneSupp[];
}

const ETATS_OPTIONS = [
  "Rafraîchissement",
  "Entretien régulier",
  "Taches",
  "Odeurs",
  "Taches & Odeurs",
  "Taches incrustées",
  "Très encrassé",
  "Désinfection",
  "Anti-acariens",
  "État normal",
];

function DevisCustomizeModal({
  presta,
  onClose,
}: {
  presta: Prestation;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<DevisOptions>({
    etats: [],
    avanceImmediate: false,
    creditImpot: false,
    lignesSupp: [],
  });

  // Kinourent (nettoyage véhicules) n'est pas agréé services à la personne :
  // ni avance immédiate URSSAF ni crédit d'impôt SAP ne s'appliquent.
  const isKinourent = getEntite(presta.typePresta) === "Kinourent";

  function toggleEtat(e: string) {
    setOpts(o => ({
      ...o,
      etats: o.etats.includes(e) ? o.etats.filter(x => x !== e) : [...o.etats, e],
    }));
  }

  function addLigne() {
    setOpts(o => ({ ...o, lignesSupp: [...o.lignesSupp, { label: "", quantite: 1, prixHT: 0 }] }));
  }

  function updateLigne(i: number, field: keyof LigneSupp, val: string | number) {
    setOpts(o => {
      const ls = [...o.lignesSupp];
      ls[i] = { ...ls[i], [field]: val };
      return { ...o, lignesSupp: ls };
    });
  }

  function removeLigne(i: number) {
    setOpts(o => ({ ...o, lignesSupp: o.lignesSupp.filter((_, j) => j !== i) }));
  }

  function buildUrl(download = false) {
    const params = new URLSearchParams();
    if (download) params.set("download", "1");
    if (opts.etats.length) params.set("etat", opts.etats.join(", "));
    if (!isKinourent && opts.avanceImmediate) params.set("avance", "1");
    if (!isKinourent && opts.creditImpot) params.set("credit", "1");
    const validSupp = opts.lignesSupp.filter(l => l.label.trim());
    if (validSupp.length) params.set("supp", encodeURIComponent(JSON.stringify(validSupp)));
    return `/api/devis/${presta.row}?${params.toString()}`;
  }

  // Les prix saisis sont des TTC. On calcule le HT à l'envers (TVA 20%).
  const mainTTC   = parseFloat(presta.prix) || 0;
  const suppTTC   = opts.lignesSupp.reduce((s, l) => s + (l.prixHT || 0) * (l.quantite || 1), 0);
  const totalTTC  = mainTTC + suppTTC;
  const totalHT   = totalTTC / 1.2;
  const totalTVA  = totalTTC - totalHT;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Personnaliser le devis</h2>
            <p className="text-xs text-gray-400 mt-0.5">{presta.prenom} {presta.nom} — {presta.typePresta}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* État du bien — multi-sélection */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              État du bien <span className="text-gray-300 normal-case font-normal">(plusieurs choix possibles)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ETATS_OPTIONS.map(e => {
                const active = opts.etats.includes(e);
                return (
                  <button
                    key={e}
                    onClick={() => toggleEtat(e)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100"
                    }`}
                  >
                    {active ? "✓ " : ""}{e}
                  </button>
                );
              })}
            </div>
            {opts.etats.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                Sélectionnés : {opts.etats.join(", ")}
              </p>
            )}
          </div>

          {/* Avantages fiscaux */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Avantage fiscal
            </label>
            {isKinourent ? (
              <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-100 text-amber-700 font-medium shrink-0 mt-0.5">Kinourent</span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Prestation <strong>Kinourent</strong> (nettoyage de véhicules) — non éligible aux services à la personne.
                  Ni l&apos;avance immédiate URSSAF ni le crédit d&apos;impôt SAP ne s&apos;appliquent. TVA 20 %.
                </p>
              </div>
            ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-blue-200 transition-colors">
                <input
                  type="checkbox"
                  checked={opts.avanceImmediate}
                  onChange={e => setOpts(o => ({ ...o, avanceImmediate: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Avance Immédiate URSSAF</p>
                  <p className="text-xs text-gray-400">Le client ne paie que 50% — l&apos;État verse le reste directement</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-orange-200 transition-colors">
                <input
                  type="checkbox"
                  checked={opts.creditImpot}
                  onChange={e => setOpts(o => ({ ...o, creditImpot: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Crédit d&apos;impôt SAP (50%)</p>
                  <p className="text-xs text-gray-400">Remboursé lors de la déclaration de revenus — art. 199 sexdecies CGI</p>
                </div>
              </label>
            </div>
            )}
          </div>

          {/* Services supplémentaires */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Services supplémentaires
              </label>
              <button
                onClick={addLigne}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>

            {opts.lignesSupp.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
                Aucun service supplémentaire — cape, matelas, tapis…
              </p>
            ) : (
              <div className="space-y-2">
                {opts.lignesSupp.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
                    <input
                      type="text"
                      value={l.label}
                      onChange={e => updateLigne(i, "label", e.target.value)}
                      placeholder="Service (ex: Cape de protection)"
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                    <input
                      type="number"
                      value={l.quantite}
                      min={1}
                      onChange={e => updateLigne(i, "quantite", parseInt(e.target.value) || 1)}
                      className="w-12 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-300"
                      title="Quantité"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        value={l.prixHT}
                        min={0}
                        step={0.01}
                        onChange={e => updateLigne(i, "prixHT", parseFloat(e.target.value) || 0)}
                        className="w-24 bg-white border border-gray-200 rounded-lg pl-2 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                        title="Prix TTC"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€TTC</span>
                    </div>
                    <button onClick={() => removeLigne(i)} className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Récap totaux (prix saisis = TTC) */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Sous-total HT</span>
              <span className="font-medium">{totalHT.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">TVA (20%)</span>
              <span className="font-medium">{totalTVA.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total TTC à payer</span>
              <span>{totalTTC.toFixed(2)} €</span>
            </div>
            <p className="text-[11px] text-gray-400 pt-0.5">Le prix saisi est le montant TTC — le HT et la TVA sont calculés automatiquement.</p>
            {(opts.avanceImmediate || opts.creditImpot) && (
              <div className="flex justify-between text-sm text-blue-600 font-semibold pt-1">
                <span>Après avantage fiscal (50%)</span>
                <span>{(totalTTC * 0.5).toFixed(2)} €</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <a
            href={buildUrl(false)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <FileText size={15} />
            Voir le PDF
            <ExternalLink size={12} />
          </a>
          <a
            href={buildUrl(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <Download size={15} />
            Télécharger
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function DevisPage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [customizing, setCustomizing] = useState<Prestation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prestations?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const devis = useMemo(() =>
    data.filter((p) => p.devisPDF || p.genDevis === "FAIT"),
    [data]
  );

  const all = useMemo(() => data, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return devis;
    const q = search.toLowerCase();
    return devis.filter((p) =>
      [p.nom, p.prenom, p.typePresta, p.email].join(" ").toLowerCase().includes(q)
    );
  }, [devis, search]);

  const allFiltered = useMemo(() => {
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((p) =>
      [p.nom, p.prenom, p.typePresta, p.email].join(" ").toLowerCase().includes(q)
    );
  }, [all, search]);

  return (
    <div className="flex flex-col min-h-screen">
      {customizing && (
        <DevisCustomizeModal presta={customizing} onClose={() => setCustomizing(null)} />
      )}
      <Topbar
        title="Devis"
        subtitle={`${filtered.length} devis généré${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {/* Devis déjà générés */}
        {loading && data.length === 0 ? (
          <SkeletonTable rows={6} cols={4} />
        ) : (
          <>
            {filtered.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700">Devis générés</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Client</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Prestation</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Montant HT</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((p) => (
                      <tr key={p.row} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                          <div className="text-xs text-gray-400">{p.tel}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-700">{p.typePresta || "—"}</td>
                        <td className="py-3 px-4">
                          {p.prix
                            ? <span className="font-semibold text-green-700">{p.prix} €</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCustomizing(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                            >
                              <FileText size={12} />
                              Personnaliser & PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Toutes les prestations — Générer un devis */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Générer un nouveau devis</h3>
                <span className="text-xs text-gray-400">{allFiltered.length} prestation{allFiltered.length > 1 ? "s" : ""}</span>
              </div>
              {allFiltered.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <FileText size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Aucune prestation trouvée</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Client</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Prestation</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Montant HT</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allFiltered.slice(0, 20).map((p) => (
                      <tr key={p.row} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                          <div className="text-xs text-gray-400">{p.tel}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-700">{p.typePresta || "—"}</td>
                        <td className="py-3 px-4 text-gray-500">{p.date || "—"}</td>
                        <td className="py-3 px-4">
                          {p.prix
                            ? <span className="font-semibold text-green-700">{p.prix} €</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setCustomizing(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                          >
                            <FileText size={12} />
                            {p.genDevis === "FAIT" ? "Re-générer" : "Générer devis"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
