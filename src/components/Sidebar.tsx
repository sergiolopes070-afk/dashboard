"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import {
  LayoutDashboard, Users, Briefcase, Archive,
  FileText, Settings, ChevronRight, Wrench, CalendarDays, TrendingDown, LogOut, X, UserSearch, Package, BarChart3,
} from "lucide-react";
import { cachePrefetch, CACHE_KEYS } from "@/lib/dataCache";

// Prefetch des données au survol : réchauffe le cache avant même le clic.
const PREFETCH: Record<string, { key: string; url: string; transform?: (d: unknown) => unknown }> = {
  "/prospects":    { key: CACHE_KEYS.prospects,    url: "/api/prospects" },
  "/depenses":     { key: CACHE_KEYS.depenses,     url: "/api/depenses" },
  "/stock":        { key: CACHE_KEYS.stock,        url: "/api/stock" },
  "/prestataires": { key: CACHE_KEYS.prestataires, url: "/api/prestataires" },
  "/prestations":  { key: CACHE_KEYS.prestations,  url: "/api/prestations" },
  "/clients":      { key: CACHE_KEYS.prestations,  url: "/api/prestations" },
  "/archive":      { key: CACHE_KEYS.archive,      url: "/api/archive", transform: (d) => (Array.isArray(d) ? [...d].reverse() : d) },
};

function prefetchRoute(href: string) {
  const p = PREFETCH[href];
  if (p) cachePrefetch(p.key, p.url, p.transform);
}

const nav = [
  { href: "/",              label: "Tableau de bord",  icon: LayoutDashboard },
  { href: "/prestations",   label: "Prestations",       icon: Briefcase },
  { href: "/prestataires",  label: "Prestataires",      icon: Wrench },
  { href: "/clients",       label: "Clients",           icon: Users },
  { href: "/prospects",     label: "Prospects",         icon: UserSearch },
  { href: "/agenda",        label: "Agenda",            icon: CalendarDays },
  { href: "/devis",         label: "Devis",             icon: FileText },
  { href: "/depenses",      label: "Dépenses",          icon: TrendingDown },
  { href: "/stock",         label: "Stock",             icon: Package },
  { href: "/pilotage",      label: "Pilotage",          icon: BarChart3 },
  { href: "/archive",       label: "Historique",        icon: Archive },
  { href: "/configuration", label: "Configuration",     icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, close } = useSidebar();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
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
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                onMouseEnter={() => prefetchRoute(href)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
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
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-white/10 space-y-3">
          <div>
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
