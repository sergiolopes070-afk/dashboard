import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ⚠️ Next.js met en cache les appels `fetch()` par défaut (Data Cache), et
// supabase-js utilise fetch en interne → les LECTURES étaient servies périmées
// après une écriture (cause des doublons d'import, fusions non enregistrées…).
// On force `cache: "no-store"` sur chaque requête Supabase pour toujours lire
// des données à jour. Les écritures ne sont pas affectées.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input as RequestInfo | URL, { ...(init as RequestInit), cache: "no-store" });

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: noStoreFetch },
      })
    : null;
