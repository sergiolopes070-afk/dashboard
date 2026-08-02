"use client";
import { useEffect, useState, useMemo } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Package, AlertTriangle,
  ArrowUp, ArrowDown, Search, Boxes, TrendingUp, Bell,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";

interface Mouvement { date: string; type: "entree" | "sortie"; quantite: number; motif?: string; avant?: number; apres?: number; }
interface StockItem {
  id: string; createdAt: string; nom: string; categorie: string; unite: string;
  quantite: number; seuil: number; prixUnitaire: number | null; notes: string;
  historique: Mouvement[];
}

const CATS = ["Matériel", "Produits", "Consommables", "Équipement", "Autre"];
const UNITES = ["unité", "L", "ml", "kg", "g", "rouleau", "paquet", "carton", "paire"];

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

// ─── Modal ajout / édition d'un article ───────────────────────────────────────
function ItemModal({ initial, onClose, onSaved }: { initial: StockItem | null; onClose: () => void; onSaved: () => void; }) {
  const toast = useToast();
  const [nom, setNom]         = useState(initial?.nom ?? "");
  const [categorie, setCat]   = useState(initial?.categorie ?? "Matériel");
  const [unite, setUnite]     = useState(initial?.unite ?? "unité");
  const [quantite, setQte]    = useState(initial ? String(initial.quantite) : "0");
  const [seuil, setSeuil]     = useState(initial ? String(initial.seuil) : "0");
  const [prix, setPrix]       = useState(initial?.prixUnitaire != null ? String(initial.prixUnitaire) : "");
  const [notes, setNotes]     = useState(initial?.notes ?? "");
  const [saving, setSaving]   = useState(false);

  async function save() {
    if (!nom.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      const payload = { nom, categorie, unite, quantite, seuil, prixUnitaire: prix, notes };
      const res = initial
        ? await fetch(`/api/stock/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: payload }) })
        : await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      toast.success(initial ? "Article modifié" : "Article ajouté");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{initial ? "Modifier l'article" : "Nouvel article"}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom de l&apos;article *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} className={inputCls} placeholder="Ex : Détachant textile 5 L" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
              <select value={categorie} onChange={e => setCat(e.target.value)} className={inputCls}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unité</label>
              <select value={unite} onChange={e => setUnite(e.target.value)} className={inputCls}>{UNITES.map(u => <option key={u}>{u}</option>)}</select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantité</label>
              <input type="number" step="0.01" value={quantite} onChange={e => setQte(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Seuil d&apos;alerte</label>
              <input type="number" step="0.01" value={seuil} onChange={e => setSeuil(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prix unitaire (€)</label>
              <input type="number" step="0.01" value={prix} onChange={e => setPrix(e.target.value)} className={inputCls} placeholder="Optionnel" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Fournisseur, référence…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white">Annuler</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{initial ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal mouvement (entrée / sortie) ────────────────────────────────────────
function MvtModal({ item, type, onClose, onDone }: { item: StockItem; type: "entree" | "sortie"; onClose: () => void; onDone: () => void; }) {
  const toast = useToast();
  const [qte, setQte]   = useState("");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const entree = type === "entree";

  async function go() {
    const q = parseFloat(qte);
    if (!(q > 0)) { toast.error("Quantité invalide"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mouvement: { type, quantite: q, motif } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      toast.success(entree ? `+${q} ${item.unite} ajouté(s)` : `−${q} ${item.unite} retiré(s)`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className={`flex items-center gap-2 px-6 py-4 border-b border-gray-100 ${entree ? "text-emerald-700" : "text-orange-700"}`}>
          {entree ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
          <h2 className="font-bold">{entree ? "Entrée de stock" : "Sortie de stock"}</h2>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-600"><strong>{item.nom}</strong> — stock actuel : <strong>{item.quantite} {item.unite}</strong></p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Quantité à {entree ? "ajouter" : "retirer"} ({item.unite})</label>
            <input type="number" step="0.01" autoFocus value={qte} onChange={e => setQte(e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Motif (optionnel)</label>
            <input value={motif} onChange={e => setMotif(e.target.value)} className={inputCls}
              placeholder={entree ? "Achat Leroy Merlin…" : "Prestation Dupont…"} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white">Annuler</button>
          <button onClick={go} disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${entree ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : entree ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StockPage() {
  const toast = useToast();
  const [items, setItems]     = useState<StockItem[]>(() => { const c = cacheGet<StockItem[]>(CACHE_KEYS.stock); return Array.isArray(c) ? c : []; });
  const [loading, setLoading] = useState(() => !cacheHas(CACHE_KEYS.stock));
  const [needsSetup, setNeedsSetup] = useState(false);
  const [search, setSearch]   = useState("");
  const [modal, setModal]     = useState<"new" | StockItem | null>(null);
  const [mvt, setMvt]         = useState<{ item: StockItem; type: "entree" | "sortie" } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/stock");
      const d = await res.json();
      if (d && d.needsSetup) { setNeedsSetup(true); setItems([]); return; }
      if (Array.isArray(d)) { setNeedsSetup(false); setItems(d); cacheSet(CACHE_KEYS.stock, d); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/stock/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Article supprimé");
    } finally { setDeleting(null); }
  }

  const filtered = useMemo(() =>
    items.filter(i => !search || `${i.nom} ${i.categorie} ${i.notes}`.toLowerCase().includes(search.toLowerCase())),
    [items, search]);

  const bas = useMemo(() => items.filter(i => i.quantite <= i.seuil && i.seuil > 0), [items]);
  const valeurTotale = useMemo(() => items.reduce((s, i) => s + i.quantite * (i.prixUnitaire ?? 0), 0), [items]);

  // ── Table à créer ──────────────────────────────────────────────────────────
  if (needsSetup) {
    const sql = `CREATE TABLE IF NOT EXISTS stock_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  nom           TEXT NOT NULL,
  categorie     TEXT DEFAULT 'Matériel',
  unite         TEXT DEFAULT 'unité',
  quantite      NUMERIC DEFAULT 0,
  seuil         NUMERIC DEFAULT 0,
  prix_unitaire NUMERIC,
  notes         TEXT,
  historique    JSONB DEFAULT '[]'::jsonb
);`;
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Topbar title="Stock" subtitle="Gestion du matériel et des consommables" />
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-amber-200 shadow-sm p-6">
            <div className="flex items-center gap-2 text-amber-700 mb-3"><AlertTriangle size={20} /><h2 className="font-bold">Une étape rapide pour activer le Stock</h2></div>
            <p className="text-sm text-gray-600 mb-3">Copie ce SQL et exécute-le une seule fois dans <strong>Supabase → SQL Editor</strong>, puis recharge la page.</p>
            <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre">{sql}</pre>
            <button onClick={() => { navigator.clipboard.writeText(sql); toast.success("SQL copié"); }}
              className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Copier le SQL</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Stock"
        subtitle="Matériel & consommables"
        onRefresh={load}
        loading={loading}
        alerts={bas.length}
        action={
          <button onClick={() => setModal("new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /><span className="hidden sm:inline">Nouvel article</span>
          </button>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Articles", val: items.length, icon: Boxes, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Valeur du stock", val: `${valeurTotale.toFixed(0)} €`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "À réapprovisionner", val: bas.length, icon: Bell, color: bas.length ? "text-red-600" : "text-gray-400", bg: bas.length ? "bg-red-50" : "bg-gray-50" },
          ].map(({ label, val, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}><Icon size={16} className={color} /></div>
              <p className="text-xl font-bold text-gray-900 leading-none">{val}</p>
              <p className="text-[11px] text-gray-400 text-center">{label}</p>
            </div>
          ))}
        </div>

        {/* Alerte réappro */}
        {bas.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-2"><AlertTriangle size={16} /> {bas.length} article{bas.length > 1 ? "s" : ""} à réapprovisionner</p>
            <div className="flex flex-wrap gap-2">
              {bas.map(i => (
                <span key={i.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-red-200 text-xs text-red-700">
                  {i.nom} <strong>({i.quantite}/{i.seuil} {i.unite})</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recherche */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>

        {/* Liste */}
        {loading ? <SkeletonList count={5} /> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Package size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Aucun article en stock</p>
            <p className="text-sm mt-1">Clique sur « Nouvel article » pour commencer</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Article</th>
                  <th className="text-left px-4 py-3 font-medium">Catégorie</th>
                  <th className="text-center px-4 py-3 font-medium">Stock</th>
                  <th className="text-right px-4 py-3 font-medium">Valeur</th>
                  <th className="text-center px-4 py-3 font-medium">Mouvement</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(i => {
                  const low = i.seuil > 0 && i.quantite <= i.seuil;
                  return (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{i.nom}</p>
                        {i.notes && <p className="text-xs text-gray-400 truncate max-w-xs">{i.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{i.categorie}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${low ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {i.quantite} {i.unite}
                          {low && <AlertTriangle size={11} />}
                        </span>
                        {i.seuil > 0 && <p className="text-[10px] text-gray-400 mt-0.5">seuil {i.seuil}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{i.prixUnitaire != null ? `${(i.quantite * i.prixUnitaire).toFixed(2)} €` : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setMvt({ item: i, type: "entree" })} title="Entrée (+)"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><ArrowUp size={14} /></button>
                          <button onClick={() => setMvt({ item: i, type: "sortie" })} title="Sortie (−)"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100"><ArrowDown size={14} /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setModal(i)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                          <button onClick={() => remove(i.id)} disabled={deleting === i.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-40"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <ItemModal initial={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {mvt && (
        <MvtModal item={mvt.item} type={mvt.type} onClose={() => setMvt(null)} onDone={() => { setMvt(null); load(); }} />
      )}
    </div>
  );
}
