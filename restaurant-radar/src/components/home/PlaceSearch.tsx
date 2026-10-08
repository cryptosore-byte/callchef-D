"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/i18n/client";
import type { PlaceSuggestion } from "@/providers/PlaceSuggestProvider";

/** Free text typed without picking a suggestion: "Name, City" -> name + address. */
export function fromText(text: string): { name: string; address: string } {
  const [name, ...rest] = text.split(",");
  return { name: name.trim(), address: rest.join(",").trim() };
}

/**
 * One field, search-as-you-type. Debounced (300 ms), min 2 characters, server-cached, never a paid provider.
 * `onPick` receives the confirmed identity; typing again clears it.
 */
export function PlaceSearch({ id, label, placeholder, value, onText, picked, onPick, demo, near = "", scope = "target", big = false }: {
  id: string; label: string; placeholder: string; value: string; onText: (v: string) => void;
  picked: PlaceSuggestion | null; onPick: (s: PlaceSuggestion | null) => void; demo: boolean;
  /** City or address typed next to the name: narrows the suggestions. */
  near?: string; scope?: "target" | "compare"; big?: boolean;
}) {
  const { t, locale } = useLocale();
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    const q = value.trim();
    const full = near.trim() && !demo ? `${q} ${near.trim()}` : q;
    if (picked || q.length < 2) { setItems([]); setLoading(false); return; }
    const n = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places/suggest?q=${encodeURIComponent(full)}&lang=${locale}&scope=${scope}${demo ? "&demo=1" : ""}`);
        const d = await r.json();
        if (n === seq.current) { setItems(d.suggestions ?? []); setActive(-1); setOpen(true); }
      } catch { if (n === seq.current) setItems([]); }
      finally { if (n === seq.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, near, picked, locale, scope, demo]);

  const choose = (s: PlaceSuggestion) => { onPick(s); onText(s.name); setOpen(false); };
  const showList = open && !picked && value.trim().length >= 2 && (items.length > 0 || !loading);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className={`flex items-center gap-3 border-b-2 transition-colors ${picked ? "border-fennel" : "border-ink/80 focus-within:border-ink"}`}>
        <svg width={big ? 22 : 18} height={big ? 22 : 18} viewBox="0 0 24 24" aria-hidden className="shrink-0 text-mist">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          id={id} value={value} autoComplete="off" spellCheck={false} placeholder={placeholder}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { onText(e.target.value); if (picked) onPick(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList || !items.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
            else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className={`w-full bg-transparent py-3 outline-none focus-visible:outline-none placeholder:text-mist/70 ${big ? "font-display text-xl md:text-2xl" : "text-base"}`}
        />
        {loading && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-mist/40 border-t-ink" aria-hidden />}
      </div>

      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-paper shadow-[0_12px_32px_-12px_rgba(20,34,30,.35)]">
          {items.map((s, i) => (
            <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-linen" : ""}`}>
              <span className="block font-semibold">{s.name}</span>
              <span className="block text-sm text-mist">{[s.kind && t("kind." + s.kind), s.address].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
          {!items.length && <li className="px-4 py-3 text-sm text-mist">{t("hs.noMatch")}</li>}
          <li className="border-t border-line px-4 py-1.5 text-[11px] text-mist">{demo ? t("hs.srcDemo") : t("hs.srcOsm")}</li>
        </ul>
      )}
    </div>
  );
}

/** Business identity confirmation: shown once a suggestion is picked, before anything paid runs. */
export function Identity({ s, onClear }: { s: PlaceSuggestion; onClear: () => void }) {
  const { t } = useLocale();
  return (
    <div className="rise mt-3 flex items-start gap-3 rounded-xl bg-fennel/[.07] px-4 py-3">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0 text-fennel"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{s.name}</p>
        <p className="truncate text-sm text-mist">{[s.kind && t("kind." + s.kind), s.address].filter(Boolean).join(" · ")}</p>
      </div>
      <button type="button" onClick={onClear} className="shrink-0 text-sm font-semibold text-mist underline hover:text-ink">{t("hs.change")}</button>
    </div>
  );
}

/** City or street address, next to the name: needed to find the right restaurant on Google Maps. */
export function AddressField({ id, label, placeholder, value, onChange, big = false, icon = "pin" }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void; big?: boolean; icon?: "pin" | "city" }) {
  return (
    <div className="flex items-center gap-3 border-b-2 border-ink/80 focus-within:border-ink">
      <label htmlFor={id} className="sr-only">{label}</label>
      <svg width={big ? 20 : 17} height={big ? 20 : 17} viewBox="0 0 24 24" aria-hidden className="shrink-0 text-mist">
        {icon === "pin"
          ? <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" /></>
          : <path d="M3 21h18M5 21V9l5-3v15M10 21V4l9 4v13M13 10h3M13 14h3M7 12h1M7 16h1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={icon === "city" ? "address-level2" : "street-address"}
        className={`w-full bg-transparent py-3 outline-none placeholder:text-mist/70 focus-visible:outline-none ${big ? "font-display text-xl md:text-2xl" : "text-base"}`} />
    </div>
  );
}
