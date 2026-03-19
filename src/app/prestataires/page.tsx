"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Phone, Mail, Wrench, UserPlus, Pencil, Trash2, X, Save, Loader2, BarChart2, Euro, CheckCircle2, XCircle, CalendarOff } from "lucide-react";
import Topbar from "@/components/Topbar";
import NewPrestataireModal from "@/components/NewPrestataireModal";
import { Prestataire, Prestation } from "@/lib/constants";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// ─── Modal édition ────────────────────────────────────────────────────────────

function EditPrestataireModal({
  prestataire,
  onClose,
  onSaved,
}: {
  prestataire: Prestataire;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm]   = useState({ nom: prestataire.nom, email: prestataire.email, tel: prestataire.tel });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nom.trim()) { setError("Le nom est requis."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prestataires", {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ id: prestataire.id, ...form }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Pencil size={18} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Modifier le prestataire</h2>
              <p className="text-xs text-gray-400 mt-0.5">{prestataire.nom}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom complet <span className="text-red-400">*</span></label>
            <input type="text" value={form.nom} onChange={(e) => set("nom", e.target.value)} className={inputCls} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Téléphone / WhatsApp</label>
            <input type="tel" value={form.tel} onChange={(e) => set("tel", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white transition-colors disabled:opacity-50">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrestatairesPage() {
  const [data, setData]             = useState<Prestataire[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [archive, setArchive]       = useState<Prestation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showNew, setShowNew]       = useState(false);
  const [editing, setEditing]       = useState<Prestataire | null>(null);
  const [confirmDel, setConfirmDel] = useState<Prestataire | null>(null);
  const [deleting, setDeleting]     = useState(false);
  // Disponibilités : map prestataire.id → jours off (0=Lun … 6=Dim)
  const [dispos, setDispos] = useState<Record<string, number[]>>({});
  const [savingDispo, setSavingDispo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resPrest, resPrestations, resArchive] = await Promise.all([
        fetch("/api/prestataires"),
        fetch("/api/prestations"),
        fetch("/api/archive"),
      ]);
      if (!resPrest.ok) throw new Error((await resPrest.json()).error);
      const prestataireData: Prestataire[] = await resPrest.json();
      setData(prestataireData);
      if (resPrestations.ok) setPrestations(await resPrestations.json());
      if (resArchive.ok) setArchive(await resArchive.json());
      // Load stored dispos from localStorage
      const stored = localStorage.getItem("prestataires_dispos");
      if (stored) setDispos(JSON.parse(stored));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  // Stats per prestataire
  const statsMap = useMemo(() => {
    const all = [...prestations, ...archive];
    const map: Record<string, { missions: number; ca: number; accepte: number; refuse: number }> = {};
    for (const p of all) {
      if (!p.prestataire) continue;
      if (!map[p.prestataire]) map[p.prestataire] = { missions: 0, ca: 0, accepte: 0, refuse: 0 };
      map[p.prestataire].missions++;
      map[p.prestataire].ca += parseFloat(p.prix) || 0;
      if (p.statutPresta === "ACCEPTÉ") map[p.prestataire].accepte++;
      if (p.statutPresta === "REFUSÉ")  map[p.prestataire].refuse++;
    }
    return map;
  }, [prestations, archive]);

  const toggleDispo = (prestataireId: string, jour: number) => {
    setDispos(prev => {
      const current = prev[prestataireId] ?? [];
      const next = current.includes(jour) ? current.filter(j => j !== jour) : [...current, jour];
      const updated = { ...prev, [prestataireId]: next };
      localStorage.setItem("prestataires_dispos", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/prestataires", {
        method : "DELETE",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ id: confirmDel.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      setConfirmDel(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {showNew && (
        <NewPrestataireModal onClose={() => setShowNew(false)} onSaved={load} />
      )}
      {editing && (
        <EditPrestataireModal
          prestataire={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {/* Confirmation suppression */}
      {confirmDel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDel(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">Supprimer {confirmDel.nom} ?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Le prestataire sera désactivé. L&apos;historique des prestations associées est conservé.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDel(null)}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      <Topbar
        title="Prestataires"
        subtitle={`${data.length} prestataire${data.length > 1 ? "s" : ""} dans l'équipe`}
        onRefresh={load}
        loading={loading}
        action={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <UserPlus size={16} />
            Nouveau prestataire
          </button>
        }
      />

      <div className="flex-1 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
        )}

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((p) => (
              {(() => {
                const s = statsMap[p.nom] ?? { missions: 0, ca: 0, accepte: 0, refuse: 0 };
                const tauxAccept = (s.accepte + s.refuse) > 0
                  ? Math.round(s.accepte / (s.accepte + s.refuse) * 100)
                  : null;
                const joursOff = dispos[p.id] ?? [];
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 group">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <Wrench size={20} className="text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{p.nom}</p>
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1 truncate">
                            <Mail size={13} />{p.email}
                          </a>
                        )}
                        {p.tel && (
                          <a href={`tel:${p.tel}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-0.5">
                            <Phone size={13} />{p.tel}
                          </a>
                        )}
                        {p.tel && (
                          <a
                            href={`https://wa.me/${p.tel.replace(/\s/g, "").replace(/^0/, "33")}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg hover:bg-orange-50 text-gray-400 hover:text-orange-600 transition-colors" title="Modifier">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDel(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 mb-0.5"><BarChart2 size={11} /><span className="text-xs">Missions</span></div>
                        <p className="font-bold text-gray-900 text-lg">{s.missions}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 mb-0.5"><Euro size={11} /><span className="text-xs">CA généré</span></div>
                        <p className="font-bold text-emerald-700 text-lg">{s.ca.toFixed(0)} €</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 mb-0.5">
                          {tauxAccept !== null && tauxAccept >= 70 ? <CheckCircle2 size={11} className="text-green-500" /> : <XCircle size={11} className="text-orange-500" />}
                          <span className="text-xs">Acceptation</span>
                        </div>
                        <p className={`font-bold text-lg ${tauxAccept !== null ? (tauxAccept >= 70 ? "text-green-700" : "text-orange-600") : "text-gray-400"}`}>
                          {tauxAccept !== null ? `${tauxAccept}%` : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Disponibilités */}
                    <div className="pt-2 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2">
                        <CalendarOff size={11} /> Jours off
                        {savingDispo === p.id && <span className="text-blue-500 normal-case font-normal ml-1">sauvegardé</span>}
                      </p>
                      <div className="flex gap-1">
                        {JOURS.map((j, i) => (
                          <button
                            key={i}
                            onClick={() => toggleDispo(p.id, i)}
                            className={`flex-1 text-xs py-1 rounded-lg font-medium transition-colors ${
                              joursOff.includes(i)
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {j}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            ))}
            {data.length === 0 && !loading && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                <Wrench size={40} className="mx-auto mb-3 opacity-20" />
                <p>Aucun prestataire trouvé</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
