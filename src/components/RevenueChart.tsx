"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { Prestation, Depense } from "@/lib/constants";
import { bilanParMois, formatMontant } from "@/lib/finance";

interface Props {
  archive: Prestation[];  // prestations archivées (les annulations sont exclues par finance.ts)
  depenses: Depense[];
  annee?: number;
}

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

// Bénéfice net par mois = CA réalisé − commissions − charges (mêmes règles que partout : lib/finance.ts)
export default function RevenueChart({ archive, depenses, annee = new Date().getFullYear() }: Props) {
  const data = bilanParMois(archive, depenses, annee).map(b => ({
    month: MONTHS[b.mois],
    montant: Math.round(b.benefice),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toLocaleString("fr-FR")}€`} />
        <Tooltip
          formatter={(value) => [formatMontant(Number(value)), "Bénéfice net"]}
          contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
        />
        <Bar dataKey="montant" radius={[6, 6, 0, 0]} maxBarSize={40}>
          {data.map(d => <Cell key={d.month} fill={d.montant < 0 ? "#f97316" : "#2563eb"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
