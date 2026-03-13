"use client";
import { RefreshCw, Bell } from "lucide-react";
import { useState } from "react";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  loading?: boolean;
  alerts?: number;
}

export default function Topbar({ title, subtitle, onRefresh, loading, alerts }: TopbarProps) {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    if (!onRefresh) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
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
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={spinning || loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        )}
      </div>
    </header>
  );
}
