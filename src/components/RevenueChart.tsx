"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { Prestation } from "@/lib/constants";

interface Props {
  prestations: Prestation[];
}

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

export default function RevenueChart({ prestations }: Props) {
  const currentYear = new Date().getFullYear();

  const data = MONTHS.map((month, idx) => {
    const montant = prestations
      .filter((p) => {
        if (!p.date) return false;
        const parts = p.date.split("/");
        if (parts.length !== 3) return false;
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        return d.getFullYear() === currentYear && d.getMonth() === idx;
      })
      .reduce((sum, p) => sum + (parseFloat(p.prix) || 0), 0);
    return { month, montant: Math.round(montant) };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
        <Tooltip
          formatter={(value) => [`${value} €`, "Chiffre d'affaires"]}
          contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
        />
        <Bar dataKey="montant" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
