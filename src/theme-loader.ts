const THEME_KEY = "app-theme";
const BASE_CSS = [
  { id: "variables", href: "./src/themes/variables.css" },
  { id: "reset", href: "./src/themes/reset.css" },
];
const THEMES = {
  default: {
    id: "default",
    name: "默认主题",
    css: "./src/themes/default.theme.css",
  },
  pixel: {
    id: "pixel",
    name: "Pixel 主题",
    css: "./src/themes/pixel.theme.css",
  },
};

let baseCssLoaded = false;
let currentThemeLink: HTMLLinkElement | null = null;
let loadedThemes: Map<string, HTMLLinkElement> = new Map();

export type ThemeId = keyof typeof THEMES;

export interface Theme {
  id: string;
  name: string;
  css: string;
}

export function getThemes(): Theme[] {
  return Object.values(THEMES);
}

export function getTheme(themeId: ThemeId): Theme {
  return THEMES[themeId] ?? THEMES.default;
}

export function getCurrentThemeId(): ThemeId {
  if (typeof localStorage === "undefined") return "default";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && stored in THEMES) {
    return stored as ThemeId;
  }
  return "default";
}

export function setTheme(themeId: ThemeId): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_KEY, themeId);
  void loadTheme(themeId);
}

async function ensureBaseCss(): Promise<void> {
  if (baseCssLoaded) return;

  const promises = BASE_CSS.map(
    (css) =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector(`link[data-css-id="${css.id}"]`);
        if (existing) {
          resolve();
          return;
        }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = css.href;
        link.dataset.cssId = css.id;
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
        setTimeout(resolve, 2000);
      }),
  );

  await Promise.all(promises);
  baseCssLoaded = true;
}

export async function loadTheme(themeId: ThemeId): Promise<void> {
  await ensureBaseCss();

  const theme = getTheme(themeId);

  let link = loadedThemes.get(theme.id);
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = theme.css;
    link.dataset.themeId = theme.id;
    document.head.appendChild(link);
    loadedThemes.set(theme.id, link);

    await new Promise<void>((resolve) => {
      link!.onload = () => resolve();
      link!.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });
  }

  if (currentThemeLink && currentThemeLink !== link) {
    currentThemeLink.disabled = true;
  }

  link.disabled = false;
  currentThemeLink = link;
}

export async function initTheme(): Promise<void> {
  const themeId = getCurrentThemeId();
  await loadTheme(themeId);
}
