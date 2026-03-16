"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search, Phone, Mail, MapPin, UserPlus, Pencil, Wrench,
  Clock, ChevronDown, ChevronUp, CheckCircle2, FileText,
  MessageCircle, Send, AlertTriangle, Calendar, Trash2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import ClientModal from "@/components/ClientModal";
import { Prestation, STATUT_COLORS } from "@/lib/constants";

interface Client {
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  prestations: Prestation[];
  totalCA: number;
  derniere: string;
}

function StatusBadge({ label }: { label: string }) {
  if (!label) return null;
  const cls = STATUT_COLORS[label] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function ConfirmBtns({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <button
        onClick={onConfirm}
        className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
      >
        Supprimer
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
      >
        Annuler
      </button>
    </span>
  );
}

function PrestationRow({
  p,
  onDelete,
}: {
  p: Prestation;
  onDelete: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      {/* Ligne 1 : type + date + prix + poubelle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {p.typePresta && (
            <span className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
              {p.typePresta}
              {p.quantite ? ` · ${p.quantite}` : ""}
            </span>
          )}
          {p.date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar size={11} />
              {p.date}{p.heure ? ` à ${p.heure}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {p.prix && (
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">
              {parseFloat(p.prix).toFixed(0)} €
            </span>
          )}
          {!confirmDel ? (
            <button
              onClick={() => setConfirmDel(true)}
              className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Supprimer cette prestation"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <ConfirmBtns
              onConfirm={() => onDelete(p.row)}
              onCancel={() => setConfirmDel(false)}
            />
          )}
        </div>
      </div>

      {/* Ligne 2 : statuts */}
      {(p.statut || p.statutPresta) && (
        <div className="flex flex-wrap gap-1">
          {p.statut && <StatusBadge label={p.statut} />}
          {p.statutPresta && <StatusBadge label={p.statutPresta} />}
        </div>
      )}

      {/* Ligne 3 : prestataire */}
      {p.prestataire ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Wrench size={11} className="text-gray-400" />
          <span className="font-medium">{p.prestataire}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle size={11} />
          <span>Aucun prestataire affecté</span>
        </div>
      )}

      {/* Ligne 4 : actions menées */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {p.envoyer === "OUI" && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <CheckCircle2 size={12} />Email client envoyé
          </span>
        )}
        {p.rappel === "OUI" && (
          <span className="flex items-center gap-1 text-xs text-purple-600">
            <Send size={12} />Rappel J-1 envoyé
          </span>
        )}
        {p.lienWA && (
          <a
            href={p.lienWA}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-green-600 hover:underline"
          >
            <MessageCircle size={12} />WhatsApp prestataire
          </a>
        )}
        {p.devisPDF && (
          <a
            href={p.devisPDF}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <FileText size={12} />Devis PDF
          </a>
        )}
        {p.genDevis === "FAIT" && !p.devisPDF && (
          <span className="flex items-center gap-1 text-xs text-indigo-500">
            <FileText size={12} />Devis généré
          </span>
        )}
      </div>

      {/* Adresse prestation si différente */}
      {p.adresse && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin size={11} />
          {p.adresse}
        </p>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const [data, setData]         = useState<Prestation[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState<{ mode: "add" | "edit"; client?: Client } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmClientDel, setConfirmClientDel] = useState<string | null>(null); // client key

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

  const clients = useMemo<Client[]>(() => {
    const map = new Map<string, Client>();
    for (const p of data) {
      const key = p.email || `${p.nom}-${p.prenom}-${p.tel}`;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          nom: p.nom, prenom: p.prenom, tel: p.tel,
          email: p.email, adresse: p.adresse,
          prestations: [], totalCA: 0, derniere: p.date,
        });
      }
      const c = map.get(key)!;
      c.prestations.push(p);
      c.totalCA += parseFloat(p.prix) || 0;
      if (p.date > c.derniere) c.derniere = p.date;
    }
    return Array.from(map.values()).sort((a, b) => b.prestations.length - a.prestations.length);
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      [c.nom, c.prenom, c.email, c.tel, c.adresse].join(" ").toLowerCase().includes(q)
    );
  }, [clients, search]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeletePrestation = async (id: string) => {
    await fetch("/api/prestations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const handleDeleteClient = async (c: Client) => {
    const clientId = c.prestations[0]?.clientId;
    if (!clientId) return;
    await fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    setConfirmClientDel(null);
    load();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Clients"
        subtitle={`${filtered.length} client${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        {/* Barre recherche + bouton Ajouter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <button
              onClick={() => setModal({ mode: "add" })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={15} />
              Ajouter
            </button>
          </div>
        </div>

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const key = c.email || `${c.nom}-${c.prenom}-${c.tel}`;
              const isExpanded = expanded.has(key);
              const isConfirmingDel = confirmClientDel === key;
              const unassigned = c.prestations.filter((p) => !p.prestataire).length;
              const hasDevis = c.prestations.some((p) => p.devisPDF || p.genDevis === "FAIT");
              const lastPrestataire = [...c.prestations].reverse().find((p) => p.prestataire)?.prestataire;

              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* En-tête carte */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{c.prenom} {c.nom}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.prestations.length} prestation{c.prestations.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                          {c.totalCA.toFixed(0)} €
                        </span>
                        <button
                          onClick={() => setModal({ mode: "edit", client: c })}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Modifier ce client"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmClientDel(isConfirmingDel ? null : key)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          title="Supprimer ce client"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Confirmation suppression client */}
                    {isConfirmingDel && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2">
                        <p className="text-xs text-red-700 font-medium">
                          Supprimer ce client et toutes ses prestations ?
                        </p>
                        <ConfirmBtns
                          onConfirm={() => handleDeleteClient(c)}
                          onCancel={() => setConfirmClientDel(null)}
                        />
                      </div>
                    )}

                    {/* Coordonnées */}
                    <div className="space-y-1.5">
                      {c.tel && (
                        <a href={`tel:${c.tel}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                          <Phone size={13} className="text-gray-400" />{c.tel}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline truncate">
                          <Mail size={13} />{c.email}
                        </a>
                      )}
                      {c.adresse && (
                        <p className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                          <span className="truncate">{c.adresse}</span>
                        </p>
                      )}
                    </div>

                    {/* Résumé rapide */}
                    <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
                      {lastPrestataire && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Wrench size={12} className="text-gray-400" />
                          {lastPrestataire}
                        </p>
                      )}
                      {unassigned > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Clock size={11} />
                          {unassigned} mission{unassigned > 1 ? "s" : ""} à affecter
                        </span>
                      )}
                      {hasDevis && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                          <FileText size={11} />
                          Devis disponible
                        </span>
                      )}
                      {c.derniere && (
                        <p className="text-xs text-gray-400">
                          Dernière intervention : {c.derniere}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bouton déplier */}
                  <button
                    onClick={() => toggleExpanded(key)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-xs text-gray-500 font-medium transition-colors border-t border-gray-100"
                  >
                    {isExpanded ? (
                      <><ChevronUp size={13} />Masquer les prestations</>
                    ) : (
                      <><ChevronDown size={13} />Voir toutes les prestations ({c.prestations.length})</>
                    )}
                  </button>

                  {/* Détail des prestations */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 border-t border-gray-100 bg-white">
                      {c.prestations.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Aucune prestation</p>
                      ) : (
                        c.prestations.map((p) => (
                          <PrestationRow
                            key={p.row}
                            p={p}
                            onDelete={handleDeletePrestation}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <ClientModal
          mode={modal.mode}
          client={modal.client}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
