"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, TrendingDown } from "lucide-react";
import { prefetchPage } from "@/lib/dataCache";
import { useTabsSlot } from "@/components/TabsSlot";

// En-tête commun de la section « Finances » : Pilotage et Dépenses restent deux
// routes distinctes (liens existants conservés), présentées comme deux onglets.
const ONGLETS = [
  { href: "/pilotage", label: "Pilotage", icon: BarChart3 },
  { href: "/depenses", label: "Dépenses", icon: TrendingDown },
];

export default function FinancesTabs() {
  const pathname = usePathname();
  // Onglet additionnel éventuel, fourni par un layout serveur (absent par défaut).
  const extra = useTabsSlot();
  return (
    <nav aria-label="Finances" className="px-3 sm:px-6 pt-3 sm:pt-4">
      <div className="inline-flex w-full sm:w-auto rounded-xl border border-gray-200 bg-white p-1 text-sm font-medium shadow-sm">
        {ONGLETS.map(({ href, label, icon: Icon }) => {
          const actif = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={actif ? "page" : undefined}
              onMouseEnter={() => prefetchPage(href)}
              onTouchStart={() => prefetchPage(href)}
              onFocus={() => prefetchPage(href)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-lg transition-colors
                ${actif ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
        {extra && (() => {
          const actif = pathname === extra.href || pathname.startsWith(extra.href + "/");
          return (
            <Link
              href={extra.href}
              aria-current={actif ? "page" : undefined}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-lg transition-colors
                ${actif ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {extra.icone}
              {extra.label}
            </Link>
          );
        })()}
      </div>
    </nav>
  );
}
