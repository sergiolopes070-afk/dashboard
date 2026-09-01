"use client";
import {
  Mail, CreditCard, X, Eye, EyeOff, Loader2,
  CheckCircle2, Circle, ExternalLink, Copy, Check,
  AlertCircle, ChevronRight, Database,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Settings = Record<string, string | undefined>;

// ─── Composants utilitaires ───────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
    >
      {ok ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {label ?? (ok ? "Copié !" : "Copier")}
    </button>
  );
}

function MaskedField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
      />
    </label>
  );
}


// ─── Modal Gmail ─────────────────────────────────────────────────────────────

function GmailModal({ currentEmail, onClose, onSave }: {
  currentEmail?: string;
  onClose: () => void;
  onSave: (user: string, pass: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(currentEmail || "");
  const [pass, setPass]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("L'adresse email est requise."); return; }
    if (!pass.trim())  { setError("Le mot de passe d'application est requis."); return; }
    setLoading(true);
    setError("");
    try { await onSave(email.trim(), pass.trim()); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erreur inconnue"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <h2 className="font-bold text-base">Connexion Gmail</h2>
                <p className="text-red-100 text-xs">Envoyer des emails aux clients</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <TextField
            label="Adresse Gmail"
            value={email}
            onChange={setEmail}
            placeholder="votre@gmail.com"
            type="email"
          />

          <MaskedField
            label="Mot de passe d'application"
            value={pass}
            onChange={setPass}
            placeholder="xxxx xxxx xxxx xxxx"
          />

          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertCircle size={13} /> Comment créer un mot de passe d&apos;application ?
            </p>
            <ol className="list-decimal list-inside space-y-1 text-amber-700">
              <li>Allez sur <strong>Compte Google → Sécurité</strong></li>
              <li>Activez la <strong>Validation en 2 étapes</strong></li>
              <li>Cherchez <strong>Mots de passe des applications</strong></li>
              <li>Créez-en un pour l&apos;appli &quot;KinouClean&quot;</li>
            </ol>
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 underline font-medium"
            >
              Ouvrir myaccount.google.com <ExternalLink size={11} />
            </a>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Connexion…</> : "Connecter Gmail"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Stripe ─────────────────────────────────────────────────────────────

function StripeModal({ currentPubKey, currentWebhookSecret, onClose, onSave }: {
  currentPubKey?: string;
  currentWebhookSecret?: string;
  onClose: () => void;
  onSave: (secret: string, pub: string, webhookSecret: string) => Promise<void>;
}) {
  const [secret, setSecret]   = useState("");
  const [pub, setPub]         = useState(currentPubKey || "");
  const [whSecret, setWh]     = useState(currentWebhookSecret || "");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) { setError("La clé secrète est requise."); return; }
    if (!secret.startsWith("sk_")) { setError("La clé secrète doit commencer par sk_live_ ou sk_test_"); return; }
    setLoading(true);
    setError("");
    try { await onSave(secret.trim(), pub.trim(), whSecret.trim()); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erreur inconnue"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <div>
                <h2 className="font-bold text-base">Connexion Stripe</h2>
                <p className="text-violet-200 text-xs">Paiements en ligne</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <MaskedField
            label="Clé secrète (sk_live_… ou sk_test_…)"
            value={secret}
            onChange={setSecret}
            placeholder="sk_live_..."
          />

          <TextField
            label="Clé publique (optionnel — pk_live_… ou pk_test_…)"
            value={pub}
            onChange={setPub}
            placeholder="pk_live_..."
          />

          <MaskedField
            label="Secret webhook (whsec_… — pour confirmer les paiements)"
            value={whSecret}
            onChange={setWh}
            placeholder="whsec_..."
          />

          {/* Info clés */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5 text-xs text-violet-800 space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertCircle size={13} /> Configuration Stripe
            </p>
            <p className="text-violet-700">
              <strong>Clés API</strong> → Stripe Dashboard → Développeurs → Clés API
            </p>
            <p className="text-violet-700">
              <strong>Webhook</strong> → Développeurs → Webhooks → Ajouter un endpoint :<br />
              <code className="bg-violet-100 px-1 rounded font-mono">/api/stripe/webhook</code><br />
              Événement : <code className="bg-violet-100 px-1 rounded font-mono">checkout.session.completed</code>
            </p>
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-violet-700 underline font-medium">
              Ouvrir Stripe Dashboard <ExternalLink size={11} />
            </a>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Connexion…</> : "Connecter Stripe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Carte intégration ────────────────────────────────────────────────────────

function ServiceCard({
  icon, title, description, connected, detail,
  onConnect, onDisconnect, disabled,
  accentClass, connectBtnClass,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connected: boolean;
  detail?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
  accentClass: string;
  connectBtnClass: string;
}) {
  return (
    <div className={`rounded-2xl p-5 transition-all border-2 ${
      disabled
        ? "opacity-50 pointer-events-none bg-white border-gray-100"
        : connected
          ? "bg-emerald-50 border-emerald-300 shadow-sm"
          : "bg-white border-gray-100 shadow-sm hover:shadow-md"
    }`}>
      <div className="flex items-start gap-4">
        {/* Icône */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative ${
          connected ? "bg-white shadow-sm" : accentClass
        }`}>
          {icon}
          {connected && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow">
              <Check size={10} className="text-white" strokeWidth={3} />
            </span>
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold text-sm ${connected ? "text-emerald-900" : "text-gray-900"}`}>{title}</span>
            {connected ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 size={11} /> Bien configuré
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full">
                <Circle size={11} /> Non configuré
              </span>
            )}
          </div>

          <p className={`text-xs mb-3 ${connected ? "text-emerald-700 font-medium" : "text-gray-500"}`}>
            {connected && detail ? detail : description}
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onConnect}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                connected
                  ? "bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  : `text-white ${connectBtnClass}`
              }`}
            >
              {connected ? "Modifier" : <><ChevronRight size={12} /> Se connecter</>}
            </button>
            {connected && (
              <button
                onClick={onDisconnect}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-200 transition-colors"
              >
                Déconnecter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SQL Setup Banner ─────────────────────────────────────────────────────────

const SETUP_SQL = `-- Table de configuration (Gmail, Stripe…)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Colonne lien de paiement Stripe sur les prestations
ALTER TABLE prestations
  ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;`;

function SetupBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Database size={16} className="text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-blue-900 text-sm">Étape préalable — Créer la table settings</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Exécutez ce SQL une seule fois dans <strong>Supabase → SQL Editor</strong> pour activer le stockage des connexions.
          </p>
        </div>
      </div>
      <div className="relative">
        <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed">
          {SETUP_SQL}
        </pre>
        <div className="absolute top-2.5 right-2.5">
          <CopyBtn text={SETUP_SQL} />
        </div>
      </div>
      <p className="text-xs text-blue-600">
        Après avoir exécuté ce SQL, rechargez cette page.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<"gmail" | "stripe" | null>(null);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) setSettings(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const save = async (patch: Record<string, string>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de la sauvegarde");
    await loadSettings();
    showToast("Connexion enregistrée !");
  };

  const disconnect = async (keys: string[]) => {
    const patch: Record<string, string> = {};
    for (const k of keys) patch[k] = "";
    await save(patch);
    showToast("Service déconnecté", "success");
  };

  const tableReady  = settings._tableReady === "true" || settings._tableReady === true as unknown as string;
  const gmailOk     = !!settings.gmail_user;
  const stripeOk    = !!settings.stripe_secret_key;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar title="Configuration" subtitle="Gérez vos connexions et intégrations" />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="flex-1 p-6 max-w-2xl space-y-6">

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">Chargement de la configuration…</span>
          </div>
        ) : (
          <>
            {/* Setup SQL si table manquante */}
            {!tableReady && <SetupBanner />}

            {/* Section Services */}
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Intégrations
              </h2>
              <div className="space-y-3">

                {/* Gmail */}
                <ServiceCard
                  icon={<Mail size={22} className={gmailOk ? "text-red-400" : "text-red-500"} />}
                  title="Gmail"
                  description="Envoyer des emails de confirmation et de rappel aux clients"
                  connected={gmailOk}
                  detail={settings.gmail_user}
                  onConnect={() => setModal("gmail")}
                  onDisconnect={() => disconnect(["gmail_user", "gmail_app_password"])}
                  disabled={!tableReady && !gmailOk}
                  accentClass="bg-red-50"
                  connectBtnClass="bg-red-500 hover:bg-red-600"
                />

                {/* Stripe */}
                <ServiceCard
                  icon={<CreditCard size={22} className={stripeOk ? "text-violet-500" : "text-violet-600"} />}
                  title="Stripe"
                  description="Générer des liens de paiement et encaisser les prestations"
                  connected={stripeOk}
                  detail={
                    settings.stripe_publishable_key
                      ? `${settings.stripe_publishable_key.slice(0, 16)}…`
                      : "Clé secrète enregistrée"
                  }
                  onConnect={() => setModal("stripe")}
                  onDisconnect={() => disconnect(["stripe_secret_key", "stripe_publishable_key"])}
                  disabled={!tableReady && !stripeOk}
                  accentClass="bg-violet-50"
                  connectBtnClass="bg-violet-600 hover:bg-violet-700"
                />

              </div>
            </section>

            {/* Automatisations */}
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Automatisations
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">Demandes d&apos;avis</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {settings.avis_actif === "false"
                      ? "En pause — aucune demande d'avis ne sera envoyée, même à l'archivage."
                      : "Active — la demande d'avis peut être envoyée au client à l'archivage."}
                  </p>
                </div>
                {(() => {
                  const actif = settings.avis_actif !== "false";
                  return (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={actif}
                      onClick={async () => {
                        try {
                          await save({ avis_actif: actif ? "false" : "true" });
                          showToast(actif ? "Demandes d'avis mises en pause" : "Demandes d'avis réactivées");
                        } catch (e) { showToast(e instanceof Error ? e.message : "Erreur", "error"); }
                      }}
                      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${actif ? "bg-emerald-500" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${actif ? "translate-x-5" : ""}`} />
                    </button>
                  );
                })()}
              </div>
            </section>

            {/* Checklist état */}
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                État des services
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {[
                  {
                    label: "Supabase",
                    ok: settings._supabase === "true" || settings._supabase === true as unknown as string,
                    detail: "Base de données principale",
                    okLabel: "Connecté",
                  },
                  {
                    label: "Table settings",
                    ok: tableReady,
                    detail: tableReady ? "Stockage des connexions prêt" : "À créer via SQL (voir ci-dessus)",
                    okLabel: "Prête",
                  },
                  {
                    label: "Gmail",
                    ok: gmailOk,
                    detail: gmailOk ? (settings.gmail_user ?? "") : "Non configuré",
                    okLabel: "Bien configuré",
                  },
                  {
                    label: "Stripe",
                    ok: stripeOk,
                    detail: stripeOk ? "Clés API enregistrées" : "Non configuré",
                    okLabel: "Bien configuré",
                  },
                ].map(({ label, ok, detail, okLabel }) => (
                  <div key={label} className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${ok ? "bg-emerald-50/40" : ""}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ok ? "bg-emerald-100" : "bg-gray-100"}`}>
                      {ok
                        ? <CheckCircle2 size={16} className="text-emerald-600" />
                        : <Circle size={16} className="text-gray-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{label}</span>
                        {ok && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            ✓ {okLabel}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 truncate ${ok ? "text-emerald-600" : "text-amber-500"}`}>{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Modales */}
      {modal === "gmail" && (
        <GmailModal
          currentEmail={settings.gmail_user}
          onClose={() => setModal(null)}
          onSave={(user, pass) => save({ gmail_user: user, gmail_app_password: pass })}
        />
      )}
      {modal === "stripe" && (
        <StripeModal
          currentPubKey={settings.stripe_publishable_key}
          currentWebhookSecret={settings.stripe_webhook_secret}
          onClose={() => setModal(null)}
          onSave={(secret, pub, webhookSecret) => save({
            stripe_secret_key    : secret,
            stripe_publishable_key: pub,
            stripe_webhook_secret: webhookSecret,
          })}
        />
      )}
    </div>
  );
}
