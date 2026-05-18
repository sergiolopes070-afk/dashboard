"use client";
import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface BanFeature {
  properties: { label: string; name: string; postcode: string; city: string };
}

function useAddressSearch(query: string) {
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.length < 4) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6`)
        .then(r => r.json())
        .then((d: { features: BanFeature[] }) => setSuggestions(d.features || []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);
  return { suggestions, loading };
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (adresse: string, cp: string, ville: string) => void;
  className?: string;
  placeholder?: string;
}

export default function AddressAutocomplete({ value, onChange, onSelect, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { suggestions, loading } = useAddressSearch(value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const defaultCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => value.length >= 4 && setOpen(true)}
        placeholder={placeholder ?? "12 rue de la Paix, Paris…"}
        autoComplete="off"
        className={className ?? defaultCls}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 size={14} className="animate-spin text-gray-400" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onSelect(s.properties.name, s.properties.postcode, s.properties.city);
                setOpen(false);
              }}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-start gap-2"
            >
              <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <span>{s.properties.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
