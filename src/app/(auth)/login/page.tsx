"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
        return;
      }

      router.push(data.role === "presta" ? "/espace-pro" : "/");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo + titre */}
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
            alt="KinouClean"
            className="w-16 h-16 rounded-2xl object-cover shadow-lg mb-4"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="text-2xl font-bold text-white">KinouClean</h1>
          <p className="text-blue-400 text-sm mt-1">Accès au tableau de bord</p>
        </div>

        {/* Carte de login */}
        <div className="bg-[#1e293b] rounded-2xl shadow-2xl p-8 border border-white/10">
          <h2 className="text-lg font-semibold text-white mb-6">Connexion</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Adresse mail ou identifiant
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="email (patron) ou identifiant (prestataire)"
                className="w-full bg-[#0f172a] border border-white/10 text-white placeholder-gray-500
                           rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                           focus:border-transparent transition"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Mot de passe ou code
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-[#0f172a] border border-white/10 text-white placeholder-gray-500
                             rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2
                             focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Bouton connexion */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed
                         text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2
                         transition-colors"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <LogIn size={18} />
              )}
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Accès réservé — KinouClean © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
