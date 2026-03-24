"use client";
import { LucideIcon } from "lucide-react";
import Link from "next/link";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color: "blue" | "green" | "orange" | "red" | "purple" | "gray";
  alert?: boolean;
  href?: string;
}

const colorMap = {
  blue  : { bg: "bg-blue-50",   icon: "bg-blue-100 text-blue-600",   text: "text-blue-700" },
  green : { bg: "bg-green-50",  icon: "bg-green-100 text-green-600", text: "text-green-700" },
  orange: { bg: "bg-orange-50", icon: "bg-orange-100 text-orange-600",text: "text-orange-700" },
  red   : { bg: "bg-red-50",    icon: "bg-red-100 text-red-600",     text: "text-red-700" },
  purple: { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600",text: "text-purple-700" },
  gray  : { bg: "bg-gray-50",   icon: "bg-gray-100 text-gray-600",   text: "text-gray-700" },
};

export default function StatCard({ title, value, subtitle, icon: Icon, color, alert, href }: StatCardProps) {
  const c = colorMap[color];
  const inner = (
    <>
      <div className={`rounded-xl p-2 sm:p-3 ${c.icon} flex-shrink-0`}>
        <Icon size={18} className="sm:hidden" />
        <Icon size={22} className="hidden sm:block" />
      </div>
      <div className="min-w-0">
        <p className="text-xs sm:text-sm text-gray-500 font-medium truncate">{title}</p>
        <p className={`text-lg sm:text-2xl font-bold ${c.text}`}>{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{subtitle}</p>}
      </div>
      {alert && (
        <span className="ml-auto flex-shrink-0 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
      )}
    </>
  );

  const className = `rounded-2xl p-3 sm:p-5 ${c.bg} border border-white shadow-sm flex items-center gap-2 sm:gap-4 ${alert ? "ring-2 ring-red-400" : ""} ${href ? "cursor-pointer hover:brightness-95 transition-all" : ""}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
