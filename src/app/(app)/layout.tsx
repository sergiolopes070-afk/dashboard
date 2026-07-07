"use client";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider } from "@/components/SidebarContext";
import AssistantWidget from "@/components/AssistantWidget";
import { ToastProvider } from "@/components/Toast";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <SidebarProvider>
        <Sidebar />
        <main className="md:ml-64 min-h-screen">
          {children}
        </main>
        <AssistantWidget />
      </SidebarProvider>
    </ToastProvider>
  );
}
