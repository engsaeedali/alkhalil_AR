export type KhalilTheme = "sovereign-dark" | "oatmeal";

export const THEME_STORAGE_KEY = "khalil-theme";

export const DEFAULT_THEME: KhalilTheme = "sovereign-dark";

export function isKhalilTheme(value: string | null | undefined): value is KhalilTheme {
  return value === "sovereign-dark" || value === "oatmeal";
}

export function readStoredTheme(): KhalilTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isKhalilTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyThemeToDocument(theme: KhalilTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "oatmeal" ? "light" : "dark";
}

export const THEME_LABELS: Record<KhalilTheme, string> = {
  "sovereign-dark": "داكن",
  oatmeal: "Oatmeal فاتح",
};
