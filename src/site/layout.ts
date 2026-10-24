import '../styles/base.css';

/**
 * Shared page behaviour: theme toggle, current-page marking, mobile menu and section reveals.
 * Every page entry imports this first.
 */

type Theme = 'light' | 'dark' | 'contrast';
const KEY = 'morseye-theme';

function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark' || t === 'contrast') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: the theme still applies for this page view */
  }
  syncThemeButtons();
  window.dispatchEvent(new CustomEvent('morseye:theme', { detail: t }));
}

function syncThemeButtons(): void {
  const t = currentTheme();
  document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === t));
  });
}

/** Read a CSS custom property (charts and canvases use this so they follow the theme). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function markCurrentPage(): void {
  const path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll<HTMLAnchorElement>('.site-nav a').forEach((a) => {
    const href = new URL(a.href).pathname;
    if (href !== '/' && path.startsWith(href)) a.setAttribute('aria-current', 'page');
  });
}

function mobileMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    nav.dataset.open = String(open);
  });
}

/** Elements with .reveal play a short rise when they first scroll into view. They are visible before. */
function reveals(): void {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  document.querySelectorAll('.reveal').forEach((el) => {
    // Already on screen at load: leave as is, no animation.
    if (el.getBoundingClientRect().top < innerHeight) return;
    io.observe(el);
  });
}

export function initLayout(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => {
    b.addEventListener('click', () => setTheme(b.dataset.themeSet as Theme));
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeButtons);
  syncThemeButtons();
  markCurrentPage();
  mobileMenu();
  reveals();
}

initLayout();
