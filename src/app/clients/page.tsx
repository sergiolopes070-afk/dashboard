"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Phone, Mail, MapPin } from "lucide-react";
import Topbar from "@/components/Topbar";
import { Prestation } from "@/lib/constants";

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

export default function ClientsPage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

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
            {filtered.map((c, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{c.prenom} {c.nom}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.prestations.length} prestation{c.prestations.length > 1 ? "s" : ""}</p>
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
                {c.derniere && (
                  <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">
                    Dernière intervention : {c.derniere}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
