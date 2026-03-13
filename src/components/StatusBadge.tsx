"use client";
import { STATUT_COLORS } from "@/lib/constants";

interface StatusBadgeProps {
  statut: string;
  small?: boolean;
}

export default function StatusBadge({ statut, small }: StatusBadgeProps) {
  if (!statut) return <span className="text-gray-300 text-xs">—</span>;
  const cls = STATUT_COLORS[statut] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"} ${cls}`}>
      {statut}
    </span>
  );
}
