"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Système de toast global : feedback visuel après chaque action.
// Usage :
//   const toast = useToast();
//   toast.success("Devis enregistré");
//   toast.error("Erreur, réessayez");
//   toast.show("Prospect supprimé", "info", { action: { label: "Annuler", onClick } });
// Dégradation gracieuse : sans mouvement si prefers-reduced-motion (motion-reduce).
// ─────────────────────────────────────────────────────────────────────────────
import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";
interface ToastAction { label: string; onClick: () => void }
interface ToastOpts   { action?: ToastAction; duration?: number }
interface ToastItem   { id: string; msg: string; type: ToastType; action?: ToastAction }

interface ToastApi {
  show:    (msg: string, type?: ToastType, opts?: ToastOpts) => string;
  success: (msg: string, opts?: ToastOpts) => string;
  error:   (msg: string, opts?: ToastOpts) => string;
  info:    (msg: string, opts?: ToastOpts) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>");
  return ctx;
}

const STYLES: Record<ToastType, { bar: string; icon: ReactNode }> = {
  success: { bar: "border-l-emerald-500", icon: <CheckCircle2 size={18} className="text-emerald-500" /> },
  error:   { bar: "border-l-red-500",     icon: <AlertCircle size={18} className="text-red-500" /> },
  info:    { bar: "border-l-blue-500",    icon: <Info size={18} className="text-blue-500" /> },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const st = STYLES[item.type];
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 border-l-4 ${st.bar} px-3.5 py-3
        transform transition-all duration-200 ease-out motion-reduce:transition-none
        ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
    >
      <span className="shrink-0 mt-0.5">{st.icon}</span>
      <p className="flex-1 text-sm text-gray-800 leading-snug">{item.msg}</p>
      {item.action && (
        <button
          onClick={() => { item.action!.onClick(); onDismiss(item.id); }}
          className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded"
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(item.id)}
        aria-label="Fermer la notification"
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id));
    const t = timers.current[id];
    if (t) { clearTimeout(t); delete timers.current[id]; }
  }, []);

  const show = useCallback((msg: string, type: ToastType = "success", opts: ToastOpts = {}) => {
    const id = crypto.randomUUID();
    setItems(prev => [...prev, { id, msg, type, action: opts.action }]);
    const duration = opts.duration ?? (opts.action ? 6000 : 3500);
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api: ToastApi = {
    show,
    success: (m, o) => show(m, "success", o),
    error:   (m, o) => show(m, "error", o),
    info:    (m, o) => show(m, "info", o),
    dismiss,
  };

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto"
      >
        {items.map(item => <ToastCard key={item.id} item={item} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}
