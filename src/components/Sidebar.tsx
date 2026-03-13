"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Briefcase, Archive,
  FileText, Settings, ChevronRight, Wrench
} from "lucide-react";

const nav = [
  { href: "/",              label: "Tableau de bord",  icon: LayoutDashboard },
  { href: "/prestations",   label: "Prestations",       icon: Briefcase },
  { href: "/prestataires",  label: "Prestataires",      icon: Wrench },
  { href: "/clients",       label: "Clients",           icon: Users },
  { href: "/devis",         label: "Devis",             icon: FileText },
  { href: "/archive",       label: "Historique",        icon: Archive },
  { href: "/configuration", label: "Configuration",     icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="h-screen w-64 bg-[#0f172a] text-white flex flex-col fixed left-0 top-0 z-30 shadow-xl">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
          alt="Kinouclean"
          className="w-9 h-9 rounded-lg object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div>
          <p className="font-bold text-white text-sm">KinouClean</p>
          <p className="text-xs text-blue-300">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
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
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-xs text-gray-500">Gomes Lopes Sergio</p>
        <p className="text-xs text-gray-500">kinouclean@gmail.com</p>
      </div>
    </aside>
  );
}
