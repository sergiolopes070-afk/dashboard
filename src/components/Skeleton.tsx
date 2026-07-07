// ─────────────────────────────────────────────────────────────────────────────
// Skeletons de chargement : remplacent les spinners / écrans blancs.
// L'utilisateur voit tout de suite la structure de la page pendant le chargement.
// Animation désactivée si prefers-reduced-motion (motion-safe).
// ─────────────────────────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-gray-200/80 dark:bg-slate-700/60 rounded-md motion-safe:animate-pulse ${className}`}
    />
  );
}

// Grille de cartes (ex. page Clients) —────────────────────────────────────────
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      aria-busy="true"
      aria-label="Chargement en cours"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-24" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Lignes de tableau (ex. pages Prestations / Devis / Dépenses) —───────────────
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      aria-busy="true"
      aria-label="Chargement en cours"
    >
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-[120px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3.5 flex-1 ${c === 0 ? "max-w-[160px]" : "max-w-[120px]"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Liste d'éléments empilés (ex. page Prospects) —──────────────────────────────
export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement en cours">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}
