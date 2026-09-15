import { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../../api/client";
import type { SearchResult } from "../../api/types";
import { useAppStore } from "../../store/useAppStore";

const DEBOUNCE_MS = 400;

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const destination = useAppStore((s) => s.destination);
  const setDestination = useAppStore((s) => s.setDestination);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setLoading(true);
      searchPlaces(query)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectResult(result: SearchResult) {
    setDestination(result);
    setQuery(result.label);
    setOpen(false);
    requestFlyTo([result.longitude, result.latitude], 16);
  }

  function clearDestination() {
    setDestination(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-full bg-white/95 backdrop-blur px-4 py-3 shadow-panel border border-ink-200">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink-700">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a destination, address or landmark…"
          className="flex-1 bg-transparent outline-none text-sm text-ink-900 placeholder:text-slate-400"
        />
        {destination && (
          <button
            onClick={clearDestination}
            aria-label="Clear destination"
            className="text-slate-400 hover:text-ink-700 shrink-0"
          >
            ✕
          </button>
        )}
      </div>

      {open && (loading || results.length > 0) && (
        <div className="absolute mt-2 w-full rounded-2xl bg-white shadow-panel border border-ink-200 overflow-hidden z-20">
          {loading && <div className="px-4 py-3 text-sm text-slate-400">Searching…</div>}
          {!loading &&
            results.map((r, i) => (
              <button
                key={`${r.latitude}-${r.longitude}-${i}`}
                onClick={() => selectResult(r)}
                className="w-full text-left px-4 py-3 hover:bg-ink-50 border-b border-ink-100 last:border-0"
              >
                <div className="text-sm font-medium text-ink-900 truncate">{r.label}</div>
                {r.type && <div className="text-xs text-slate-400 capitalize">{r.type.replace(/_/g, " ")}</div>}
              </button>
            ))}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
