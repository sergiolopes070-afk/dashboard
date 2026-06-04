"use client";
import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Bot, ChevronDown, Wrench } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolName?: string; // nom de l'outil en cours d'exécution
}

const SUGGESTIONS = [
  "Qui dois-je relancer aujourd'hui ?",
  "Quels sont mes prochains RDV ?",
  "Quel est mon CA ce mois-ci ?",
  "Rédige un message de relance WhatsApp",
];

const TOOL_LABELS: Record<string, string> = {
  get_prospects:      "📋 Chargement des prospects…",
  get_prestations:    "📅 Chargement de l'agenda…",
  update_prospect:    "✏️ Mise à jour du prospect…",
  add_note_prospect:  "📝 Ajout de la note…",
  update_prestation:  "🔄 Mise à jour de la prestation…",
  find_nearest_rdv:   "📍 Calcul des distances…",
  calculate_route:    "🗺️ Calcul de l'itinéraire…",
};

export default function AssistantWidget() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      // Message de bienvenue
      setMessages([{
        role: "assistant",
        content: "Bonjour ! Je suis ton assistant KinouClean 👋\n\nJ'ai accès à ton agenda, tes prospects et tes stats en temps réel. Comment puis-je t'aider ?",
      }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);

    // Ajoute message assistant vide pour le streaming
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Erreur serveur");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const evt = JSON.parse(data);

            if (evt.type === "tool") {
              // Affiche une bulle outil temporaire
              const toolLabel = TOOL_LABELS[evt.name] ?? `🔧 ${evt.name}`;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                // Si la dernière bulle est déjà vide (placeholder), on y met le toolName
                if (last.role === "assistant" && !last.content) {
                  updated[updated.length - 1] = { ...last, toolName: evt.name, content: "" };
                } else {
                  // Sinon on ajoute une nouvelle bulle outil
                  updated.push({ role: "assistant", content: "", toolName: evt.name });
                }
                void toolLabel; // avoid unused warning
                return updated;
              });
            } else if (evt.type === "text" && evt.text) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                // Si la dernière bulle était un outil, on la remplace par du texte
                if (last.role === "assistant" && last.toolName) {
                  updated[updated.length - 1] = { role: "assistant", content: evt.text };
                } else {
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: last.content + evt.text,
                  };
                }
                return updated;
              });
            } else if (evt.type === "done") {
              // Nettoyage : retire les bulles outil vides qui n'ont pas eu de texte
              setMessages(prev => prev.filter(m => !(m.role === "assistant" && !m.content && m.toolName)));
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "❌ Une erreur est survenue. Réessaie." };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function formatMessage(text: string) {
    return text.split("\n").map((line, i) => (
      <span key={i}>
        {line}
        {i < text.split("\n").length - 1 && <br />}
      </span>
    ));
  }

  return (
    <>
      {/* ── Bouton flottant ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all ${
          open ? "bg-gray-700 scale-95" : "bg-blue-600 hover:bg-blue-700 hover:scale-110"
        }`}
        title="Assistant KinouClean"
      >
        {open
          ? <ChevronDown size={22} className="text-white" />
          : <Bot size={24} className="text-white" />
        }
        {/* Badge notification si messages non lus */}
      </button>

      {/* ── Fenêtre de chat ── */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[360px] max-w-[calc(100vw-20px)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ height: "500px" }}>

          {/* Header */}
          <div className="bg-blue-600 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot size={16} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Assistant KinouClean</p>
                <p className="text-blue-200 text-xs">Accès à tes données en temps réel</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-1 ${m.toolName ? "bg-amber-100" : "bg-blue-100"}`}>
                    {m.toolName
                      ? <Wrench size={11} className="text-amber-600" />
                      : <Bot size={12} className="text-blue-600" />
                    }
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : m.toolName
                      ? "bg-amber-50 text-amber-700 border border-amber-100 rounded-bl-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}>
                  {m.toolName && !m.content ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin shrink-0" />
                      {TOOL_LABELS[m.toolName] ?? `🔧 ${m.toolName}…`}
                    </span>
                  ) : m.content ? (
                    formatMessage(m.content)
                  ) : (
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (si peu de messages) */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 shrink-0">
            <div className="flex gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Pose ta question…"
                disabled={loading}
                className="flex-1 bg-transparent text-sm focus:outline-none text-gray-800 placeholder-gray-400 disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="text-blue-600 hover:text-blue-700 disabled:opacity-30 transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
