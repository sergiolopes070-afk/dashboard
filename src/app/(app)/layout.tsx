"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider } from "@/components/SidebarContext";
import AssistantWidget from "@/components/AssistantWidget";
import BottomNav from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toast";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Création depuis le « + » de la barre du bas → on remonte la page courante
  // (key) pour qu'elle relise ses données, quelle que soit la page.
  const [version, setVersion] = useState(0);

  return (
    <ToastProvider>
      <SidebarProvider>
        <Sidebar />
        {/* Téléphone : marge basse = hauteur de la barre d'onglets + zone sûre (encoche). */}
        <main key={version} className="md:ml-64 min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <BottomNav onDataChanged={() => setVersion(v => v + 1)} />
        <AssistantWidget />
      </SidebarProvider>
    </ToastProvider>
  );
}
