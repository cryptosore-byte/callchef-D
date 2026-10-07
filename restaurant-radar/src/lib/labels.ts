export const human = (s: string) => {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const km = (m: number, locale = "en") => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`.replace(".", locale === "fr" ? "," : "."));
export const priceSigns = (n: number) => "€".repeat(n);
export const radiusLabel = (m: number) => (m < 1000 ? `${m} m` : `${m / 1000} km`);
