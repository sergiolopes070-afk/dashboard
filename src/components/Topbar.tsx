"use client";
import { RefreshCw, Bell, Search, X, Menu } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import DarkModeToggle from "./DarkModeToggle";
import { useSidebar } from "./SidebarContext";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  loading?: boolean;
  alerts?: number;
  action?: React.ReactNode;
}

interface SearchResult {
  type: "client" | "prestation";
  label: string;
  sub: string;
  href: string;
}

function GlobalSearch() {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcut: /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-400 hover:border-gray-300 transition-colors bg-white min-w-[200px]"
      >
        <Search size={14} />
        <span>Rechercher…</span>
        <span className="ml-auto text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">/</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-screen max-w-sm sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Search size={15} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher client, prestation, prestataire…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              autoFocus
            />
            {query && <button onClick={() => setQuery("")}><X size={14} className="text-gray-400" /></button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="p-4 text-center">
                <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
              </div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <p className="p-4 text-sm text-gray-400 text-center">Aucun résultat pour « {query} »</p>
            )}
            {!loading && results.length === 0 && !query.trim() && (
              <p className="p-4 text-sm text-gray-400 text-center">Tapez pour rechercher…</p>
            )}
            {results.map((r, i) => (
              <a
                key={i}
                href={r.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 flex-shrink-0 ${
                  r.type === "client" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                }`}>
                  {r.type === "client" ? "Client" : "Prestation"}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-xs text-gray-500">{r.sub}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ title, subtitle, onRefresh, loading, alerts, action }: TopbarProps) {
  const [spinning, setSpinning] = useState(false);
  const { toggle } = useSidebar();

  const handleRefresh = () => {
    if (!onRefresh) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between gap-4">
      {/* Hamburger - mobile only */}
      <button
        onClick={toggle}
        className="p-2 rounded-xl hover:bg-gray-100 transition-colors md:hidden shrink-0"
        aria-label="Ouvrir le menu"
      >
        <Menu size={20} className="text-gray-600" />
      </button>
      <div className="shrink-0 min-w-0">
        <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-gray-400 mt-0.5 hidden sm:block">{subtitle}</p>}
      </div>
      <div className="flex-1 hidden md:flex">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {alerts && alerts > 0 ? (
          <div className="relative">
            <button className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
              <Bell size={18} />
            </button>
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {alerts > 9 ? "9+" : alerts}
            </span>
          </div>
        ) : null}
        <DarkModeToggle />
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-2 sm:px-4 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={spinning || loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        )}
      </div>
    </header>
  );
}
