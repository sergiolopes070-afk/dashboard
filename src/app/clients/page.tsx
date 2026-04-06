"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Phone, Mail, MapPin, ChevronDown, ChevronUp, FileText, Download } from "lucide-react";
import Topbar from "@/components/Topbar";
import StatusBadge from "@/components/StatusBadge";
import { Prestation } from "@/lib/constants";

interface ClientGroup {
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  prestations: Prestation[];
  totalCA: number;
  derniere: string;
}

export default function ClientsPage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestations");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clients = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
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

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
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

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const key = c.email || `${c.nom}-${c.prenom}-${c.tel}`;
              const isOpen = expanded.has(key);
              const hasDevis = c.prestations.some((p) => p.devisPDF);

              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{c.prenom} {c.nom}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.prestations.length} prestation{c.prestations.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                        {c.totalCA.toFixed(0)} €
                      </span>
                    </div>

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

                    {hasDevis && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <FileText size={12} className="text-blue-400" />
                        <span className="text-xs text-blue-600 font-medium">Devis disponible</span>
                      </div>
                    )}

                    {c.derniere && (
                      <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">
                        Dernière intervention : {c.derniere}
                      </p>
                    )}
                  </div>

                  {/* Toggle prestations */}
                  <button
                    onClick={() => toggle(key)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-50 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {isOpen ? "Masquer les prestations" : "Voir les prestations"}
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {c.prestations.map((p) => (
                        <div key={p.row} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">
                              {p.typePresta}{p.quantite && p.quantite !== "1" ? ` · ${p.quantite}` : ""}
                            </span>
                            {p.prix && (
                              <span className="text-sm font-semibold text-green-700">{parseFloat(p.prix).toFixed(0)} €</span>
                            )}
                          </div>
                          {p.date && (
                            <p className="text-xs text-gray-400">{p.date}{p.heure ? ` à ${p.heure}` : ""}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <StatusBadge statut={p.statut} small />
                          </div>
                          {p.devisPDF && (
                            <div className="flex items-center gap-2 pt-1">
                              <a
                                href={p.devisPDF}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                              >
                                <FileText size={11} />
                                Voir devis PDF
                              </a>
                              <a
                                href={`/api/devis/download?url=${encodeURIComponent(p.devisPDF)}&name=${encodeURIComponent(`devis-${p.prenom}-${p.nom}`)}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                              >
                                <Download size={11} />
                                Télécharger
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
