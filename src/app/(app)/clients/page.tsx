"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search, Phone, Mail, MapPin, UserPlus, Pencil, Wrench,
  Clock, ChevronDown, ChevronUp, CheckCircle2, FileText,
  MessageCircle, Send, AlertTriangle, Calendar, Trash2, Download, Archive, X, Star,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import ClientModal from "@/components/ClientModal";
import NewClientModal from "@/components/NewClientModal";
import { Prestation, Prestataire, STATUT_COLORS } from "@/lib/constants";

const TAGS_PRESET = ["Régulier", "VIP", "Difficile", "Sensible", "Pro", "Fidèle"];
const TAG_COLORS: Record<string, string> = {
  "Régulier": "bg-blue-100 text-blue-700",
  "VIP"     : "bg-purple-100 text-purple-700",
  "Difficile": "bg-red-100 text-red-700",
  "Sensible": "bg-orange-100 text-orange-700",
  "Pro"     : "bg-gray-100 text-gray-700",
  "Fidèle"  : "bg-green-100 text-green-700",
};

interface Client {
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  prestations: Prestation[];
  totalCA: number;
  derniere: string;
  tags: string[];
  clientId: string;
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

function CopyAvisLink({ clientId, clientName, prestation }: { clientId: string; clientName: string; prestation?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const params = new URLSearchParams({ nom: clientName });
    if (prestation) params.set("prestation", prestation);
    const url = `${window.location.origin}/avis/${clientId}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
        copied
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
      }`}
    >
      <Star size={12} className={copied ? "text-green-500" : "text-yellow-500"} />
      {copied ? "Lien copié !" : "Copier lien avis"}
    </button>
  );
}

function PrestationRow({
  p,
  onDelete,
  onDevisGenerated,
  onArchive,
}: {
  p: Prestation;
  onDelete: (id: string) => void;
  onDevisGenerated: () => void;
  onArchive: (ids: string[], label: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [generatingDevis, setGeneratingDevis] = useState(false);

  const handleGenerateDevis = async () => {
    setGeneratingDevis(true);
    try {
      const url = `/api/devis/${p.row}`;
      // Ouvrir dans un nouvel onglet (le PDF sera servi et devis_genere = true côté serveur)
      window.open(url, "_blank");
      // Rafraîchir pour mettre à jour le badge "Devis disponible"
      setTimeout(onDevisGenerated, 1500);
    } finally {
      setGeneratingDevis(false);
    }
  };

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
          <button
            onClick={() => onArchive([p.row], `${p.typePresta} – ${p.date || "?"}`)}
            className="p-1 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
            title="Archiver cette prestation"
          >
            <Archive size={13} />
          </button>
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
        {/* Devis : voir PDF existant OU générer */}
        {p.devisPDF ? (
          <a
            href={p.devisPDF}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <FileText size={12} />Voir devis PDF
          </a>
        ) : p.genDevis === "FAIT" ? (
          <a
            href={`/api/devis/${p.row}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <FileText size={12} />Voir devis PDF
          </a>
        ) : null}
        {/* Bouton générer (toujours disponible) */}
        <button
          onClick={handleGenerateDevis}
          disabled={generatingDevis}
          className="flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download size={11} />
          {generatingDevis ? "..." : p.genDevis === "FAIT" || p.devisPDF ? "Re-générer" : "Générer devis"}
        </button>
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
  const [data, setData]               = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [modal, setModal]             = useState<{ mode: "add" | "edit"; client?: Client } | null>(null);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [confirmClientDel, setConfirmClientDel] = useState<string | null>(null);
  const [archiveModal, setArchiveModal] = useState<{ ids: string[]; label: string } | null>(null);
  const [archiveReason, setArchiveReason]   = useState("");
  const [archivePayment, setArchivePayment] = useState("");
  const [archiveComment, setArchiveComment] = useState("");
  const [archiving, setArchiving]     = useState(false);
  const [tagEditKey, setTagEditKey]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resPres, resPresta] = await Promise.all([
        fetch(`/api/prestations?t=${Date.now()}`, { cache: "no-store" }),
        fetch("/api/prestataires"),
      ]);
      if (resPres.ok) setData(await resPres.json());
      if (resPresta.ok) setPrestataires(await resPresta.json());
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
          tags: p.tags ?? [], clientId: p.clientId,
        });
      }
      const c = map.get(key)!;
      c.prestations.push(p);
      c.totalCA += parseFloat(p.prix) || 0;
      if (p.date > c.derniere) c.derniere = p.date;
      // Merge tags from any prestation (they're all the same client)
      if (p.tags?.length && c.tags.length === 0) c.tags = p.tags;
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

  const handleToggleTag = async (c: Client, tag: string) => {
    const current = c.tags ?? [];
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    // Optimistic update
    setData(prev => prev.map(p =>
      (p.email === c.email || (!p.email && `${p.nom}-${p.prenom}-${p.tel}` === `${c.nom}-${c.prenom}-${c.tel}`))
        ? { ...p, tags: next }
        : p
    ));
    await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: c.clientId, tags: next }),
    });
  };

  const handleArchiveConfirm = async () => {
    if (!archiveModal) return;
    setArchiving(true);
    try {
      await Promise.all(
        archiveModal.ids.map((id) =>
          fetch("/api/archive", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, reason: archiveReason + (archiveComment.trim() ? ` — ${archiveComment.trim()}` : ""), modePaiement: archivePayment }),
          })
        )
      );
      setArchiveModal(null);
      setArchiveReason("");
      setArchivePayment("");
      setArchiveComment("");
      load();
    } finally {
      setArchiving(false);
    }
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
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(c.tags ?? []).map(tag => (
                            <span
                              key={tag}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {tag}
                            </span>
                          ))}
                          <button
                            onClick={(e) => { e.stopPropagation(); setTagEditKey(tagEditKey === key ? null : key); }}
                            className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
                            title="Gérer les tags"
                          >
                            {tagEditKey === key ? "✕" : "+"}
                          </button>
                        </div>
                        {tagEditKey === key && (
                          <div className="flex flex-wrap gap-1 mt-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100">
                            {TAGS_PRESET.map(tag => (
                              <button
                                key={tag}
                                onClick={(e) => { e.stopPropagation(); handleToggleTag(c, tag); }}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                  (c.tags ?? []).includes(tag)
                                    ? (TAG_COLORS[tag] ?? "bg-gray-200 text-gray-700") + " font-semibold"
                                    : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                              >
                                {(c.tags ?? []).includes(tag) ? "✓ " : ""}{tag}
                              </button>
                            ))}
                          </div>
                        )}
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
                          onClick={() => {
                            setArchiveModal({ ids: c.prestations.map((p) => p.row), label: `${c.prenom} ${c.nom}` });
                            setArchiveReason(""); setArchivePayment("");
                          }}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
                          title="Archiver ce client"
                        >
                          <Archive size={14} />
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
                      {c.email && (() => {
                        const last = c.prestations[0];
                        const details = [
                          last?.typePresta ? `  • Prestation : ${last.typePresta}${last.quantite ? ` (x${last.quantite})` : ""}` : "",
                          last?.adresse    ? `  • Adresse    : ${last.adresse}` : "",
                          last?.date       ? `  • Date       : ${last.date}${last.heure ? ` à ${last.heure}` : ""}` : "",
                          last?.prix       ? `  • Montant    : ${last.prix} €` : "",
                        ].filter(Boolean).join("\n");
                        const body = [
                          `Bonjour ${c.prenom},`,
                          ``,
                          `Nous avons bien enregistré votre demande et vous remercions de votre confiance.`,
                          ``,
                          `Voici le récapitulatif de votre rendez-vous :`,
                          ``,
                          details,
                          ``,
                          `Pour toute question ou modification, n'hésitez pas à nous contacter — nous sommes à votre entière disposition.`,
                          ``,
                          `Nous nous réjouissons de vous accueillir prochainement et vous souhaitons une excellente journée.`,
                          ``,
                          `À très bientôt,`,
                          ``,
                          `L'équipe KinouClean`,
                        ].join("\n");
                        const subject = encodeURIComponent("Confirmation de votre rendez-vous – KinouClean");
                        return (
                          <div className="flex items-center gap-2">
                            <Mail size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-500 truncate flex-1">{c.email}</span>
                            <a
                              href={`mailto:${c.email}?subject=${subject}&body=${encodeURIComponent(body)}`}
                              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
                              title="Ouvrir dans votre application mail"
                            >
                              <Send size={11} />
                              Envoyer un mail
                            </a>
                          </div>
                        );
                      })()}
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

                  {/* Lien avis + WhatsApp fin de prestation */}
                  {c.clientId && (
                    <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap items-center gap-2">
                      <CopyAvisLink
                        clientId={c.clientId}
                        clientName={`${c.prenom} ${c.nom}`}
                        prestation={c.prestations[0]?.typePresta}
                      />
                      {c.tel && (() => {
                        const tel = c.tel.replace(/\s/g, "").replace(/^0/, "33");
                        const last = c.prestations[0];
                        const avisUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/avis/${c.clientId}?nom=${encodeURIComponent(`${c.prenom} ${c.nom}`)}${last?.typePresta ? `&prestation=${encodeURIComponent(last.typePresta)}` : ""}`;
                        const msg = encodeURIComponent(
                          `Bonjour ${c.prenom} 👋,\n\n` +
                          `J'espère que votre ${last?.typePresta ? `prestation de ${last.typePresta}` : "prestation"} s'est très bien passée 😊.\n\n` +
                          `Votre satisfaction est notre priorité et nous serions ravis d'avoir votre retour !\n\n` +
                          `Si vous avez quelques instants, pourriez-vous laisser un avis ici ⭐ :\n${avisUrl}\n\n` +
                          `Merci infiniment pour votre confiance 🙏\n\nÀ très bientôt,\nL'équipe KinouClean`
                        );
                        return (
                          <a
                            href={`https://wa.me/${tel}?text=${msg}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors"
                          >
                            <MessageCircle size={12} />
                            Message fin de prestation
                          </a>
                        );
                      })()}
                    </div>
                  )}

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
                            onDevisGenerated={load}
                            onArchive={(ids, label) => { setArchiveModal({ ids, label }); setArchiveReason(""); setArchivePayment(""); }}
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

      {modal && modal.mode === "add" && (
        <NewClientModal
          prestataires={prestataires}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal && modal.mode === "edit" && (
        <ClientModal
          mode="edit"
          client={modal.client}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {/* Modal archivage */}
      {archiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={18} className="text-amber-500" />
                <h2 className="font-semibold text-gray-900">Archiver la prestation</h2>
              </div>
              <button onClick={() => setArchiveModal(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{archiveModal.label}</span>{" "}
              {archiveModal.ids.length > 1
                ? `et ses ${archiveModal.ids.length} prestations seront déplacées dans l'historique.`
                : "sera déplacée dans l'historique."}
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Raison de l&apos;archivage</label>
              <div className="grid grid-cols-2 gap-2">
                {["Annulation client", "Prestation terminée", "Client injoignable", "Doublon"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setArchiveReason(r)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors text-left ${
                      archiveReason === r
                        ? "border-amber-400 bg-amber-50 text-amber-700 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Autre raison…"
                value={["Annulation client", "Prestation terminée", "Client injoignable", "Doublon"].includes(archiveReason) ? "" : archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            {/* Mode de paiement — obligatoire */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                Mode de paiement <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["Espèces", "Virement bancaire", "Lien de paiement", "Chèque", "Carte sur place"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setArchivePayment(m)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors text-left ${
                      archivePayment === m
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    {m === "Espèces" ? "💵 " : m === "Virement bancaire" ? "🏦 " : m === "Lien de paiement" ? "🔗 " : m === "Chèque" ? "📄 " : "💳 "}
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Commentaire <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <textarea
                rows={2}
                placeholder="Détails supplémentaires sur la situation…"
                value={archiveComment}
                onChange={(e) => setArchiveComment(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setArchiveModal(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveConfirm}
                disabled={!archiveReason.trim() || !archivePayment || archiving}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {archiving ? "Archivage…" : "Archiver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
