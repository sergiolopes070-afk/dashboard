"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, UserSearch, Users, Plus, CalendarPlus, UserPlus, X } from "lucide-react";
import { prefetchPage, cacheGet, cacheSet, CACHE_KEYS } from "@/lib/dataCache";
import type { Prestataire } from "@/lib/constants";

// Barre d'onglets du bas — téléphone uniquement (< md, même seuil que le menu
// hamburger de la Sidebar/Topbar). Le « + » central ouvre directement les modales
// de création (chargées à la demande), sans passer par une page.
const NewClientModal   = dynamic(() => import("@/components/NewClientModal"),   { ssr: false });
const AddProspectModal = dynamic(() => import("@/components/AddProspectModal"), { ssr: false });
const ClientFicheById  = dynamic(() => import("@/components/ClientFiche").then(m => m.ClientFicheById), { ssr: false });

const ONGLETS_GAUCHE = [
  { href: "/",       label: "Accueil", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda",  icon: CalendarDays },
];
const ONGLETS_DROITE = [
  { href: "/prospects", label: "Prospects", icon: UserSearch },
  { href: "/clients",   label: "Clients",   icon: Users },
];

// Même règle que la Sidebar : actif aussi sur une sous-page.
const estActif = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

export default function BottomNav({ onDataChanged }: { onDataChanged?: () => void }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal]       = useState<null | "rdv" | "prospect">(null);
  const [ficheId, setFicheId]   = useState<string | null>(null);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);

  // Changement de page → on referme le petit menu.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Échap ferme le menu « + ».
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [menuOpen]);

  const ouvrirRdv = () => {
    setMenuOpen(false);
    setModal("rdv");
    // Liste des prestataires (menu d'assignation) : cache immédiat + relecture.
    fetch("/api/prestataires")
      .then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => { if (Array.isArray(d)) { setPrestataires(d as Prestataire[]); cacheSet(CACHE_KEYS.prestataires, d); } })
      .catch(() => { /* non bloquant : on garde la liste en cache */ });
  };

  const changed = () => {
    onDataChanged?.();
    window.dispatchEvent(new CustomEvent("kinouclean:data-changed"));
  };

  const onglet = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
    const actif = estActif(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={actif ? "page" : undefined}
        onTouchStart={() => prefetchPage(href)}
        onMouseEnter={() => prefetchPage(href)}
        className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors
          ${actif ? "text-blue-600" : "text-gray-500 active:text-gray-800"}`}
      >
        <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${actif ? "bg-blue-50" : ""}`}>
          <Icon size={20} strokeWidth={actif ? 2.4 : 2} />
        </span>
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* Fond du menu « + » (sous la barre, au-dessus de la page) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[14] bg-black/30" onClick={() => setMenuOpen(false)} />
      )}

      {/* z-[15] : sous le fond et le panneau de la Sidebar (z-20/z-30) et sous les modales (z-50). */}
      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 inset-x-0 z-[15] bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      >
        {/* Menu « + » : au-dessus du bouton central */}
        {menuOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <button type="button" onClick={ouvrirRdv}
              className="w-full min-h-[48px] flex items-center gap-3 px-4 text-sm font-medium text-gray-800 active:bg-gray-50 border-b border-gray-100">
              <CalendarPlus size={18} className="text-blue-600" /> Nouveau RDV
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); setModal("prospect"); }}
              className="w-full min-h-[48px] flex items-center gap-3 px-4 text-sm font-medium text-gray-800 active:bg-gray-50">
              <UserPlus size={18} className="text-orange-500" /> Nouveau prospect
            </button>
          </div>
        )}

        <div className="flex items-stretch">
          {ONGLETS_GAUCHE.map(onglet)}
          <div className="flex-1 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? "Fermer le menu de création" : "Créer : nouveau RDV ou nouveau prospect"}
              aria-expanded={menuOpen}
              className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all
                ${menuOpen ? "bg-gray-700 rotate-0" : "bg-blue-600 active:bg-blue-700"}`}
            >
              {menuOpen ? <X size={22} /> : <Plus size={24} strokeWidth={2.5} />}
            </button>
          </div>
          {ONGLETS_DROITE.map(onglet)}
        </div>
      </nav>

      {modal === "rdv" && (
        <NewClientModal
          prestataires={prestataires}
          onClose={() => setModal(null)}
          onSaved={changed /* la modale reste ouverte sur l'écran de succès */}
          onVoirFiche={(id) => { setModal(null); setFicheId(id); }}
        />
      )}
      {modal === "prospect" && (
        <AddProspectModal
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); changed(); }}
        />
      )}
      {ficheId && (
        <ClientFicheById clientId={ficheId} onClose={() => setFicheId(null)} onChanged={changed} />
      )}
    </>
  );
}
