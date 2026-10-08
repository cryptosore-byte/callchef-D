// Checks the keys in .env.local WITHOUT printing them: Apify token validity, plan usage, actor access.
// Run on the server: npx tsx scripts/check-keys.ts
import { readFileSync, existsSync } from "fs";
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const mask = (s?: string, prefix?: string) => (s ? `présente (${s.length} caractères${prefix ? (s.startsWith(prefix) ? `, format ${prefix}… correct` : `, ! ne commence pas par ${prefix}`) : ""})` : "ABSENT");
(async () => {
  const token = process.env.APIFY_API_TOKEN?.trim();
  console.log("APIFY_API_TOKEN :", mask(token, "apify_api_"));
  if (token && /\s/.test(process.env.APIFY_API_TOKEN!)) console.log("  ! espace ou retour à la ligne dans la clé : recollez-la");
  if (token) {
    const h = { Authorization: `Bearer ${token}` };
    const me = await fetch("https://api.apify.com/v2/users/me", { headers: h }).catch((e) => e as Error);
    if (me instanceof Error) console.log("  ✗ Apify injoignable :", me.message);
    else if (!me.ok) console.log(`  ✗ clé refusée par Apify (HTTP ${me.status}) : recréez-la sur console.apify.com > Settings > API & Integrations`);
    else {
      const u = (await me.json()).data;
      console.log(`  ✓ clé valide · plan ${u?.plan?.id ?? "?"}`);
      const lim = await fetch("https://api.apify.com/v2/users/me/limits", { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const used = lim?.data?.current?.monthlyUsageUsd, max = lim?.data?.limits?.maxMonthlyUsageUsd;
      if (used !== undefined) console.log(`  crédit du mois : ${Number(used).toFixed(2)} $ utilisés sur ${max ?? "?"} $${max !== undefined && used >= max ? "  ✗ CRÉDIT ÉPUISÉ" : ""}`);
      const actor = process.env.APIFY_GOOGLE_MAPS_ACTOR_ID || "compass~crawler-google-places";
      const a = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}`, { headers: h }).catch(() => null);
      console.log(a?.ok ? `  ✓ acteur ${actor} accessible` : `  ✗ acteur ${actor} inaccessible (HTTP ${a?.status ?? "réseau"})`);
    }
  }
  console.log("TYPESAFE_API_KEY :", mask(process.env.TYPESAFE_API_KEY?.trim()));
  console.log("SITE_PASSWORD :", process.env.SITE_PASSWORD ? "défini" : "ABSENT (n'importe qui peut lancer des scans payants)");
})();
