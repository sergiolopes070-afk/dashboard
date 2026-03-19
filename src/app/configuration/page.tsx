"use client";
import {
  Settings, CheckCircle, AlertTriangle, ExternalLink, Copy,
  Mail, CreditCard, X, Eye, EyeOff, Loader2, Wifi, WifiOff,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { useState, useEffect, useCallback } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
      title="Copier"
    >
      {copied ? <CheckCircle size={13} className="text-green-600" /> : <Copy size={13} />}
    </button>
  );
}

function MaskedInput({ value, onChange, placeholder, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

// ─── Modal Gmail ─────────────────────────────────────────────────────────────

function GmailModal({ onClose, onSave, currentEmail }: {
  onClose: () => void;
  onSave: (user: string, pass: string) => Promise<void>;
  currentEmail?: string;
}) {
  const [email, setEmail] = useState(currentEmail || "");
  const [pass, setPass]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSave = async () => {
    if (!email.trim() || !pass.trim()) { setError("Les deux champs sont requis."); return; }
    setSaving(true);
    try { await onSave(email.trim(), pass.trim()); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
              <Mail size={18} className="text-red-500" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Connexion Gmail</h2>
              <p className="text-xs text-gray-500">Envoyer des emails via votre compte Google</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Adresse Gmail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@gmail.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <MaskedInput
            label="Mot de passe d'application"
            value={pass}
            onChange={setPass}
            placeholder="xxxx xxxx xxxx xxxx"
          />

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Où trouver le mot de passe d&apos;application ?</p>
            <p>Compte Google → Sécurité → Validation en 2 étapes → Mots de passe des applications</p>
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 underline font-medium mt-1"
            >
              Ouvrir les paramètres Google <ExternalLink size={11} />
            </a>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Stripe ─────────────────────────────────────────────────────────────

function StripeModal({ onClose, onSave, currentPubKey }: {
  onClose: () => void;
  onSave: (secret: string, pub: string) => Promise<void>;
  currentPubKey?: string;
}) {
  const [secret, setSecret] = useState("");
  const [pub,    setPub]    = useState(currentPubKey || "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSave = async () => {
    if (!secret.trim()) { setError("La clé secrète est requise."); return; }
    if (!secret.startsWith("sk_")) { setError("La clé secrète doit commencer par sk_live_ ou sk_test_"); return; }
    setSaving(true);
    try { await onSave(secret.trim(), pub.trim()); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
              <CreditCard size={18} className="text-violet-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Connexion Stripe</h2>
              <p className="text-xs text-gray-500">Accepter les paiements en ligne</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <MaskedInput
            label="Clé secrète (sk_live_… ou sk_test_…)"
            value={secret}
            onChange={setSecret}
            placeholder="sk_live_..."
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Clé publique <span className="font-normal text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={pub}
              onChange={e => setPub(e.target.value)}
              placeholder="pk_live_..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
            />
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-xs text-violet-800 space-y-1">
            <p className="font-semibold">Où trouver vos clés API Stripe ?</p>
            <p>Tableau de bord Stripe → Développeurs → Clés API</p>
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-violet-700 underline font-medium mt-1"
            >
              Ouvrir Stripe Dashboard <ExternalLink size={11} />
            </a>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte de connexion ───────────────────────────────────────────────────────

function ConnexionCard({
  icon, title, description, connected, connectedLabel,
  onConnect, onDisconnect, connectColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connected: boolean;
  connectedLabel?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  connectColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
          {connected
            ? <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                <Wifi size={10} /> Connecté
              </span>
            : <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                <WifiOff size={10} /> Non configuré
              </span>
          }
        </div>
        <p className="text-xs text-gray-500">
          {connected && connectedLabel ? connectedLabel : description}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {connected && (
          <button onClick={onDisconnect}
            className="px-3 py-2 text-xs border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
            Déconnecter
          </button>
        )}
        <button onClick={onConnect}
          className={`px-4 py-2 text-xs rounded-xl text-white font-semibold transition-colors ${connectColor}`}>
          {connected ? "Modifier" : "Se connecter"}
        </button>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<"gmail" | "stripe" | null>(null);
  const [saved, setSaved]       = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) setSettings(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const saveSettings = async (patch: Record<string, string>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
    await loadSettings();
    setSaved("Sauvegardé ✓");
    setTimeout(() => setSaved(""), 2500);
  };

  const disconnect = async (keys: string[]) => {
    const patch: Record<string, string> = {};
    for (const k of keys) patch[k] = "";
    await saveSettings(patch);
  };

  const gmailConnected  = !!(settings.gmail_user);
  const stripeConnected = !!(settings.stripe_secret_key);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar title="Configuration" subtitle="Connexions et paramètres" />
      <div className="flex-1 p-6 max-w-3xl space-y-6">

        {/* Toast */}
        {saved && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
            <CheckCircle size={15} /> {saved}
          </div>
        )}

        {/* Section intégrations */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Settings size={13} /> Intégrations
          </h2>

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Gmail */}
              <ConnexionCard
                icon={<Mail size={22} className="text-red-500" />}
                title="Gmail"
                description="Envoyer les emails de confirmation aux clients"
                connected={gmailConnected}
                connectedLabel={settings.gmail_user}
                onConnect={() => setModal("gmail")}
                onDisconnect={() => disconnect(["gmail_user", "gmail_app_password"])}
                connectColor="bg-red-500 hover:bg-red-600"
              />

              {/* Stripe */}
              <ConnexionCard
                icon={<CreditCard size={22} className="text-violet-600" />}
                title="Stripe"
                description="Accepter les paiements en ligne et générer des liens de paiement"
                connected={stripeConnected}
                connectedLabel={
                  settings.stripe_publishable_key
                    ? `${settings.stripe_publishable_key.slice(0, 14)}…`
                    : "Clé secrète configurée"
                }
                onConnect={() => setModal("stripe")}
                onDisconnect={() => disconnect(["stripe_secret_key", "stripe_publishable_key"])}
                connectColor="bg-violet-600 hover:bg-violet-700"
              />
            </div>
          )}
        </div>

        {/* Avertissement si Gmail non configuré */}
        {!loading && !gmailConnected && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Gmail non connecté</p>
              <p className="text-amber-700 mt-0.5">
                Les emails de confirmation clients ne seront pas envoyés.
                Connectez votre compte Gmail ci-dessus.
              </p>
            </div>
          </div>
        )}

        {/* Section technique Supabase */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Settings size={13} /> Configuration serveur
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <p className="text-sm text-gray-600">
              Variables d&apos;environnement requises dans <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.local</code> :
            </p>
            <div className="space-y-2">
              {[
                { key: "SUPABASE_URL", desc: "URL de votre projet Supabase" },
                { key: "SUPABASE_SERVICE_ROLE_KEY", desc: "Clé service Supabase (Settings → API)" },
                { key: "NEXT_PUBLIC_SUPABASE_URL", desc: "Même URL (côté client)" },
                { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", desc: "Clé anonyme Supabase" },
              ].map(({ key, desc }) => (
                <div key={key} className="flex items-center gap-3 text-xs">
                  <CopyButton text={key} />
                  <code className="bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 flex-1">{key}</code>
                  <span className="text-gray-400 hidden sm:block">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Modales */}
      {modal === "gmail" && (
        <GmailModal
          currentEmail={settings.gmail_user}
          onClose={() => setModal(null)}
          onSave={async (user, pass) => {
            await saveSettings({ gmail_user: user, gmail_app_password: pass });
          }}
        />
      )}
      {modal === "stripe" && (
        <StripeModal
          currentPubKey={settings.stripe_publishable_key}
          onClose={() => setModal(null)}
          onSave={async (secret, pub) => {
            await saveSettings({ stripe_secret_key: secret, stripe_publishable_key: pub });
          }}
        />
      )}
    </div>
  );
}
