"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import {
  LayoutDashboard, Users, Archive,
  Settings, ChevronRight, Wrench, CalendarDays, LogOut, X, UserSearch, Package, BarChart3,
} from "lucide-react";
import { prefetchPage } from "@/lib/dataCache";

// Prefetch des données (prefetchPage) au survol, au toucher (mobile : touchstart
// part avant le clic) ou au focus clavier : réchauffe le cache avant la navigation.

// Menu par usage : le quotidien en haut, la gestion (dont les finances) ensuite.
// `aussi` : autres routes qui allument l'entrée (vues rattachées, URL conservées) :
//  - Agenda   ← /prestations (vue « Liste » de l'agenda)
//  - Finances ← /depenses (onglet de Finances, à côté de Pilotage)
// /devis n'est plus au menu (doublon de la fiche client / Prospects) mais la page reste accessible.
type Item = { href: string; label: string; icon: React.ElementType; aussi?: string[] };
const sections: { titre: string; items: Item[] }[] = [
  { titre: "Quotidien", items: [
    { href: "/",              label: "Tableau de bord",  icon: LayoutDashboard },
    { href: "/agenda",        label: "Agenda",           icon: CalendarDays, aussi: ["/prestations"] },
    { href: "/prospects",     label: "Prospects",        icon: UserSearch },
    { href: "/clients",       label: "Clients",          icon: Users },
  ]},
  { titre: "Gestion", items: [
    { href: "/pilotage",      label: "Finances",         icon: BarChart3, aussi: ["/depenses"] },
    { href: "/prestataires",  label: "Prestataires",     icon: Wrench },
    { href: "/stock",         label: "Stock",            icon: Package },
    { href: "/archive",       label: "Historique",       icon: Archive },
  ]},
];

// Actif aussi sur une sous-page (ex. /prospects?fiche=… ou /clients/…).
const estActif = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

export default function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  // Rechargement complet vers /login : aucun écran mis en cache côté navigateur
  // (routeur client) ne survit d'une session à la suivante dans le même onglet.
  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { window.location.assign("/login"); }
  }

  return (
    <>
      {/* Backdrop overlay on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`
          h-screen w-64 bg-[#0f172a] text-white flex flex-col fixed left-0 top-0 z-30 shadow-xl
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
            alt="Kinouclean"
            className="w-9 h-9 rounded-lg object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="flex-1">
            <p className="font-bold text-white text-sm">KinouClean</p>
            <p className="text-xs text-blue-300">Dashboard</p>
          </div>
          {/* Close button - mobile only */}
          <button
            onClick={close}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors md:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {sections.map(({ titre, items }) => (
            <div key={titre}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{titre}</p>
              <div className="space-y-0.5">
                {items.map(({ href, label, icon: Icon, aussi }) => {
                  const active = [href, ...(aussi ?? [])].some(h => estActif(pathname, h));
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={close}
                      onMouseEnter={() => prefetchPage(href)}
                      onTouchStart={() => prefetchPage(href)}
                      onFocus={() => prefetchPage(href)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group
                        ${active
                          ? "bg-blue-600 text-white shadow-md"
                          : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {active && <ChevronRight size={14} className="opacity-60" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer : réglages + déconnexion */}
        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          <Link
            href="/configuration"
            onClick={close}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm transition-all
              ${estActif(pathname, "/configuration") ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
          >
            <Settings size={16} />
            <span>Configuration</span>
          </Link>
          <div className="px-3 pt-1">
            <p className="text-xs text-gray-500">Gomes Lopes Sergio</p>
            <p className="text-xs text-gray-500">kinouclean@gmail.com</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-gray-400
                       hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={16} />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>
    </>
  );
}
