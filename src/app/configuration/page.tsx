"use client";
import { Settings, CheckCircle, AlertTriangle, ExternalLink, Copy } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useState } from "react";

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

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {num}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <div className="text-sm text-gray-600 space-y-2">{children}</div>
      </div>
    </div>
  );
}

const ENV_EXAMPLE = `GOOGLE_SPREADSHEET_ID=1AbCdEfGhIjKlMn...
GOOGLE_SERVICE_ACCOUNT_KEY=eyJhbGciOiJSUzI1NiIs...`;

export default function ConfigurationPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Topbar title="Configuration" subtitle="Connecter Google Sheets au Dashboard" />
      <div className="flex-1 p-6 max-w-3xl space-y-6">

        {/* Alerte */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-amber-800">Configuration requise</p>
            <p className="text-sm text-amber-700 mt-1">
              Le dashboard se connecte à votre Google Sheets via l&apos;API Google. Suivez ces étapes pour l&apos;activer.
            </p>
          </div>
        </div>

        {/* Étapes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-xl">
              <Settings size={20} className="text-blue-600" />
            </div>
            <h2 className="font-bold text-gray-900">Guide de configuration</h2>
          </div>

          <Step num={1} title="Créer un projet Google Cloud">
            <p>Allez sur{" "}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 underline inline-flex items-center gap-1">
                console.cloud.google.com <ExternalLink size={12} />
              </a>
            </p>
            <p>Créez un nouveau projet nommé <strong>kinouclean-dashboard</strong>.</p>
          </Step>

          <Step num={2} title="Activer l'API Google Sheets">
            <p>Dans le projet → <strong>API et services</strong> → <strong>Bibliothèque</strong></p>
            <p>Recherchez <strong>Google Sheets API</strong> et activez-la.</p>
          </Step>

          <Step num={3} title="Créer un compte de service">
            <p>API et services → <strong>Identifiants</strong> → <strong>Créer des identifiants</strong> → <strong>Compte de service</strong></p>
            <p>Donnez-lui un nom, puis créez une <strong>clé JSON</strong>.</p>
            <p>Téléchargez le fichier JSON — vous en aurez besoin à l&apos;étape suivante.</p>
          </Step>

          <Step num={4} title="Partager votre Google Sheets">
            <p>Ouvrez votre Google Spreadsheet KinouClean.</p>
            <p>Cliquez <strong>Partager</strong> et ajoutez l&apos;email du compte de service (format : <code className="bg-gray-100 px-1 rounded text-xs">nom@projet.iam.gserviceaccount.com</code>).</p>
            <p>Donnez-lui le rôle <strong>Lecteur</strong>.</p>
          </Step>

          <Step num={5} title="Créer le fichier .env.local">
            <p>À la racine du projet, créez un fichier <code className="bg-gray-100 px-1 rounded text-xs">.env.local</code> :</p>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-x-auto">
{ENV_EXAMPLE}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={ENV_EXAMPLE} />
              </div>
            </div>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>GOOGLE_SPREADSHEET_ID</strong> : l&apos;ID dans l&apos;URL de votre Sheets (<code className="bg-gray-100 px-1 rounded text-xs">/d/IDENTIFIANT/edit</code>)</li>
              <li><strong>GOOGLE_SERVICE_ACCOUNT_KEY</strong> : contenu du fichier JSON encodé en base64 (<code className="bg-gray-100 px-1 rounded text-xs">base64 -w0 fichier.json</code>)</li>
            </ul>
          </Step>

          <Step num={6} title="Redémarrer le serveur">
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 rounded-xl p-3 text-xs">npm run dev</pre>
              <div className="absolute top-2 right-2">
                <CopyButton text="npm run dev" />
              </div>
            </div>
            <p>Le dashboard chargera automatiquement vos données depuis Google Sheets.</p>
          </Step>
        </div>

        {/* Info noms de feuilles */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <h3 className="font-semibold text-blue-800 mb-3">Noms de feuilles attendus</h3>
          <div className="space-y-2 text-sm">
            {[
              { sheet: "Clients – Prestationss", desc: "Feuille principale des prestations" },
              { sheet: "Prestataires", desc: "Liste des prestataires" },
              { sheet: "Historique Prestations", desc: "Prestations archivées" },
            ].map(({ sheet, desc }) => (
              <div key={sheet} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-blue-500" />
                  <code className="bg-white px-2 py-0.5 rounded text-xs border border-blue-100">{sheet}</code>
                </div>
                <span className="text-blue-600 text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
