import React, { useState, useEffect } from 'react';


import { AlertCircle, Target } from 'lucide-react';
import { createRoot } from 'react-dom/client';
const Fallback = (props: any) => <section data-stub-component="Fallback">{props.children}</section>;


// Fallback wrapper to prevent crashes from missing icons
const IconFallback = ({ icon: Icon, fallback: Fallback = AlertCircle, ...props }) => {
  if (!Icon) {
    console.warn('Icon component is undefined, using fallback');
    return <Fallback {...props} />;
  }
  try {
    return <Icon {...props} />;
  } catch (e) {
    console.error('Icon render failed:', e);
    return <Fallback {...props} />;
  }
};

// Create safe icon components for potentially non-existent icons
const createSafeIcon = (IconComponent, iconName) => {
  if (typeof IconComponent === 'undefined') {
    console.warn(`Icon "${iconName}" not found, using AlertCircle as fallback`);
    return AlertCircle;
  }
  return IconComponent;
};

// Capture the four LCP phases in production so PageSpeed regressions can be
// attributed to hosting, resource discovery/download, or client rendering.
type LcpPerformanceEntry = PerformanceEntry & {
  element?: Element;
  renderTime?: number;
  loadTime?: number;
  size?: number;
  url?: string;
};

type LcpBreakdown = {
  total: number;
  ttfb: number;
  resourceLoadDelay: number;
  resourceLoadDuration: number;
  elementRenderDelay: number;
  bottleneck: 'ttfb' | 'resource-load-delay' | 'resource-load-duration' | 'element-render-delay';
  element: string | null;
  resourceUrl: string | null;
};

declare global {
  interface Window {
    __scoutAlmaLcpBreakdown?: LcpBreakdown;
    __scoutAlmaLcpObserverInstalled?: boolean;
  }
}

function installLcpBreakdownObserver() {
  if (
    typeof window === 'undefined' ||
    window.__scoutAlmaLcpObserverInstalled ||
    !('PerformanceObserver' in window)
  ) {
    return;
  }

  window.__scoutAlmaLcpObserverInstalled = true;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const ttfb = Math.max(0, navigation?.responseStart ?? 0);

  const publish = (entry: LcpPerformanceEntry) => {
    const lcpTime = entry.renderTime || entry.loadTime || entry.startTime;
    const resource = entry.url
      ? (performance
          .getEntriesByName(entry.url, 'resource')
          .at(-1) as PerformanceResourceTiming | undefined)
      : undefined;
    const resourceStart = resource?.startTime ?? ttfb;
    const resourceEnd = resource?.responseEnd ?? resourceStart;
    const phases = {
      ttfb,
      resourceLoadDelay: entry.url ? Math.max(0, resourceStart - ttfb) : 0,
      resourceLoadDuration: entry.url ? Math.max(0, resourceEnd - resourceStart) : 0,
      elementRenderDelay: Math.max(0, lcpTime - (entry.url ? resourceEnd : ttfb)),
    };
    const bottleneck = (Object.entries(phases).reduce((largest, current) =>
      current[1] > largest[1] ? current : largest
    )[0]) as LcpBreakdown['bottleneck'];
    const element = entry.element;
    const breakdown: LcpBreakdown = {
      total: Math.max(0, lcpTime),
      ...phases,
      bottleneck,
      element: element
        ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`
        : null,
      resourceUrl: entry.url || null,
    };

    window.__scoutAlmaLcpBreakdown = breakdown;
    window.dispatchEvent(new CustomEvent<LcpBreakdown>('scout-alma:lcp-breakdown', { detail: breakdown }));
    console.info('[Scout & Alma] LCP breakdown (ms)', breakdown);
    if (breakdown.ttfb > 600) {
      console.warn('[Scout & Alma] LCP TTFB exceeds 600ms; inspect HTML caching and edge response time.');
    }
  };

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as LcpPerformanceEntry[];
      const latest = entries.at(-1);
      if (latest) publish(latest);
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Older browsers can omit Largest Contentful Paint observer support.
  }
}

installLcpBreakdownObserver();

// Guarantee the Chakra Petch brand font actually loads. The stylesheets below
// also declare it via an `@import`, but that rule lives inside a <style> block
// React injects into the <body>; browsers (and some content-security policies)
// can ignore a dynamically-injected `@import`, at which point the page silently
// falls back to system-ui and the distinctive Chakra typography is lost. A real
// <link> in <head> — with preconnects — is the reliable delivery path, so we add
// it once at module load for every route (landing page and privacy policy).
function ensureBrandFontLoaded(): void {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById('sa-brand-font')) return;

  const preconnectGoogle = document.createElement('link');
  preconnectGoogle.rel = 'preconnect';
  preconnectGoogle.href = 'https://fonts.googleapis.com';

  const preconnectStatic = document.createElement('link');
  preconnectStatic.rel = 'preconnect';
  preconnectStatic.href = 'https://fonts.gstatic.com';
  preconnectStatic.crossOrigin = 'anonymous';

  const fontStylesheet = document.createElement('link');
  fontStylesheet.id = 'sa-brand-font';
  fontStylesheet.rel = 'stylesheet';
  fontStylesheet.href =
    'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap';

  document.head.appendChild(preconnectGoogle);
  document.head.appendChild(preconnectStatic);
  document.head.appendChild(fontStylesheet);
}

ensureBrandFontLoaded();

/**
 * Scout & Alma landing page.
 *
 * Single-file React app. Bare imports below resolve through the page importmap
 * to esm.sh at runtime; the app self-mounts into #root via createRoot and also
 * exports the root component as default so the platform renderer can mount it
 * either way.
 */


// === CONFIGURATION ===
const WORKSPACE_BRAND_NAME = 'Scout & Alma';
const WORKSPACE_TAGLINE = 'Talk to Scout. Recruit with Alma. Match for life.';
// Dedicated 96px logo variant: 4.3KB instead of the 145KB, 1024px source.
const WORKSPACE_LOGO_URL =
  'https://storage.googleapis.com/audos-images/chat-attachments/8e8874c3-8ca0-4043-ad99-87e4dd177c41.png';
const WORKSPACE_LOGO_SRCSET = 'data:image/webp;base64,UklGRkADAABXRUJQVlA4WAoAAAAgAAAAHwAAHwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggUgEAAFAHAJ0BKiAAIAA+SRyLQ6KhoRgEACgEhLYAXy6AE0aqwBjHv8ROH/GJqAfqV/sU9VY4uQF4pnC+etZLB23xJFTDmAAA/v/+lCtueOh42rH3rA+I4b9i/mL1yp1CDizHNt+PGPNU8UXr/f8M55hXamsOyVxs35YB55FFova+S1Xq/9+/P/h93gaJe32W/Z+wRvUoIOz/qkZz90/oWwfCuA0g+YSrdx9WjUdONh6sdY8/NHC2+WDHaYXVfmmqw4F7AJb0g9XU17vja46PaCbnO/n/hn/vPJUL0Ah8Wv7YMg+lje/95zz6t9wju8gv13VrNxh+3MEBxaXlo8qe4UYUX1xPM8EwksZfrtciZp94PPf3/b326xlOxlwwzsUmR9iK+riCNJV+9OKGrTfwyoPrgNQme4/unDhZ0aqicz6LQmwp3lzqWN0/+OpLAwYCmiJeAAAA 32w, data:image/webp;base64,UklGRvIEAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggBAMAAHARAJ0BKkAAQAA+SSCMRKKiIRQGACgEhLMAaTbohb7R4TWEB+QN4B/APQB+qvUQ/1XpGdQpz4P7d/Bb+5fpH0vAR9S//hK4HQ3/TPeSdcGL3f7PlQ+h/+v7gv6u/8HpSfZQ/aM7NyBScjrUMoxP/5FhoFDYSsMT6mgiLKoYFkihwRm/UWcfDx8Y/GVc4842/R343UAA/v5N4cqfzLtG9c2TBHZYSAMxFoZFsHKkcT5ZHFfomf93kPv2UsV7Aafjm2hNNgX9OUraW/jmkqPSlzHjMLBta2HaFJ6N7CoBoGwH18z1HyDQQweA1V+aau7YSlZ+UCoB4QN3YlD+LQsPExERCI6cSzPtd+gLuGTz0aKrFVA1nTvK/gWzP7v8ReFw3ztDi0eMYdknzOJb65tMwVvaczr/gX5SDTG9bVqG07e23N8mr5J29dfgmm4LNbdxKsMGUuxZd9QcZ2RDkSiG0HQy299Gr/65T0euTziCNzKSvxGY/K6VP4adcK8BfExUEDlRb8TDkCKkj35R0nfbc8/ysPZKEqQUBWq/qL/6Afi6V/D/XQyCKJ+PFotoglVg+iPLMRn2eqaiDR5hogyGr58iatPVC/4DhM1z+YPyqxKddS1SkBFnnsItNsLvF04nxmjdQ67VoQYgi9487C90u9M63O7b37//D5Cd58fdi+NMjtcEjXVtHuFv5CeVQtr4/1LajEtXL2bzxmOwt1UXXy5cQPfHUec+O5BdlEwgF1BDs7ftcARX1vjKriC56bpjkp6MP+AMYnfuV/DAjdZ8uwu/Xqqzls3MZO7m9/J17Ms18AkjMRs3DSGRq3MrfxDV5Gii/SaJGxluJotB3LlvmmFx0vzP2da7fqUC8SxD0fq2xYmaTlFitt1k0pSzfpeUo8+sDJNdl2G+sKVrDsySP/icxfQkLTKv56qCpAkOH8t2wY8nRX3Y7XVuB8OzMMKKeI77xFxZ1t2Rm96c+RCQF2gf3FZO0Xiy5+Ktav7QNa88mKNrpMEOO0fL7v/xRireAAAAAAA= 64w';
const SCOUT_DEMO_VIDEO_URL =
  'https://storage.googleapis.com/remotioncloudrun-29i6x7bt7e/renders/demo-1787769500024-mup4bznz/out.mp4';
const WORKSPACE_PRIMARY_COLOR = '#31a1b4';
const WORKSPACE_HIGHLIGHT_COLOR = '#e32626';
const WORKSPACE_DARK_SURFACE_PRIMARY_BADGE_TEXT = '#7dd8e8';
const WORKSPACE_STEP_BADGE_TEXT = '#7dd8e8';
const WORKSPACE_DARK_SURFACE_HIGHLIGHT_BADGE_TEXT = '#ff6b6b';
const WORKSPACE_ALMA_STEP_BADGE_TEXT = '#ff6b6b';
const WORKSPACE_CONTRAST_COLOR = '#07bb8e';
const WORKSPACE_FONT_FAMILY =
  '"Chakra Petch", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const WORKSPACE_SURFACE_PAGE = '#f5fafb';
const WORKSPACE_BORDER_COLOR = '#d2eaef';
// The page and its sections render on the dark teal editorial surface
// (WORKSPACE_EDITORIAL_BG / the section backgrounds), so the primary text tokens
// must be light to stay legible against the teal. The footer sits on a light
// surface and pins its own dark text values below.
const WORKSPACE_TEXT_PRIMARY = '#f1fafc';
const WORKSPACE_TEXT_SECONDARY = '#c3e5ec';
const WORKSPACE_TEXT_MUTED = '#93c2cd';
// Dark-surface footer text (footer background is the light WORKSPACE_SURFACE_PAGE).
const WORKSPACE_FOOTER_TEXT_PRIMARY = '#0e2d32';
const WORKSPACE_FOOTER_TEXT_MUTED = '#22717e';
const WORKSPACE_TEXT_ON_PRIMARY = '#111827';
const WORKSPACE_TEXT_ON_HIGHLIGHT = '#ffffff';
const WORKSPACE_EDITORIAL_BG = '#063039';

// The marketing host serves this landing page for every pathname, so a
// same-origin /space link there loops straight back here instead of opening
// the product. On the live site the space is its own subdomain; everywhere
// else (audos.com previews) it is same-origin and the subdomain would be a
// pointless cross-site hop.
const SPACE_APP_ORIGIN = 'https://app.scoutandalma.com';
const SPACE_SAME_ORIGIN_PATH = '/space/workspace-220101';

function spaceBase(): string {
  const host = typeof location === 'undefined' ? '' : location.hostname;
  const onLiveSite = host === 'scoutandalma.com' || host.endsWith('.scoutandalma.com');
  return onLiveSite ? SPACE_APP_ORIGIN + '/' : SPACE_SAME_ORIGIN_PATH;
}

function spacePath(path: string): string {
  const base = spaceBase().replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  return suffix ? `${base}/${suffix}` : base;
}

function spaceUrl(query: string): string {
  return query ? spacePath('') + '?' + query : spacePath('');
}

const STUDENT_SIGNUP_URL = spacePath('/student/signup');
const UNIVERSITY_SIGNUP_URL = spacePath('/university/signup');
const STUDENT_SURVEY_URL = spaceUrl('app=student-survey');
const UNIVERSITY_SURVEY_URL = spaceUrl('app=university-survey');
const LOGIN_URL = spacePath('/auth');
const SIGNUP_URL = spacePath('/auth') + '?auth=signup';

// === HELPERS ===
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function scrollToSection(id: string): void {
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

// === ICONS ===
type IconProps = { className?: string; style?: React.CSSProperties };

function SvgIcon({
  className = '',
  style,
  children,
}: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      className={`sa-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {children}
    </svg>
  );
}

const ArrowRightIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </SvgIcon>
);

const CheckCircleIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 2.5 2.5L16 9" />
  </SvgIcon>
);

const GraduationCapIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <path d="m2 10 10-5 10 5-10 5Z" />
    <path d="M6 12v5c3 2 9 2 12 0v-5" />
    <path d="M22 10v6" />
  </SvgIcon>
);

const RadarIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <path d="m12 12 6-6" />
    <circle cx="12" cy="12" r="1" />
  </SvgIcon>
);

const MenuIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </SvgIcon>
);

const CloseIcon = (p: IconProps) => (
  <SvgIcon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </SvgIcon>
);

function BrandMark({ size }: { size: number }): JSX.Element {
  return (
    <svg
      className="sa-brandmark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={`${WORKSPACE_BRAND_NAME} logo`}
    >
      <path
        d="M16 18 32 12l16 6v2c0 2-2 4-6 6l-2-2c-2 4-4 6-8 8-4-2-6-4-8-8l-2 2c-4-2-6-4-6-6Zm28 4 2 2v6l-2-2Z"
        fill={WORKSPACE_PRIMARY_COLOR}
        stroke={WORKSPACE_PRIMARY_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 30q4-4 8 0l2 12c0 4-4 5-7 3-2-1-3-3-3-5m8-2q-2 2-6 0"
        stroke={WORKSPACE_HIGHLIGHT_COLOR}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 38q4-6 10-2c4 3 4 8 2 12-2 5-8 8-13 5-5-3-4-9-1-11"
        stroke={WORKSPACE_CONTRAST_COLOR}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// === STYLES ===
// The first rules mirror what a CSS reset would apply so the page looks
// consistent and nothing shifts as content mounts.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap');
.sa-page *, .sa-page *::before, .sa-page *::after { box-sizing: border-box; }
:where(.sa-page) :where(h1, h2, h3, p, ul, ol) { margin: 0; padding: 0; }
:where(.sa-page) :where(ul, ol) { list-style: none; }
:where(.sa-page) :where(button) { margin: 0; padding: 0; border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer; }
:where(.sa-page) :where(a) { color: inherit; text-decoration: none; }
:where(.sa-page) :where(svg) { display: block; }
:where(.sa-page) :where(summary)::-webkit-details-marker { display: none; }

html { scroll-behavior: smooth; }
html, body, #root { margin: 0; min-height: 100%; }
.sa-page {
  min-height: 100vh;
  background: ${WORKSPACE_EDITORIAL_BG};
  color: ${WORKSPACE_TEXT_PRIMARY};
  font-family: ${WORKSPACE_FONT_FAMILY};
  font-feature-settings: "cv11", "ss01";
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* --- scroll-triggered entrance animations --- */
.sa-reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); will-change: opacity, transform; }
.sa-reveal.is-visible { opacity: 1; transform: none; }
.sa-reveal--delay-1 { transition-delay: .08s; }
.sa-reveal--delay-2 { transition-delay: .16s; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .sa-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
  .sa-hero-inner { animation: none !important; }
}

.sa-icon { width: 1rem; height: 1rem; flex-shrink: 0; }
.sa-icon--xs { width: .875rem; height: .875rem; }
.sa-icon--nav { width: 1.25rem; height: 1.25rem; }
.sa-brandmark { flex-shrink: 0; }
.sa-logo { display: block; object-fit: contain; flex-shrink: 0; }
.sa-logo--header { width: 2rem; height: 2rem; }
.sa-logo--footer { width: 1.75rem; height: 1.75rem; }

.sa-skip { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.sa-skip:focus { position: absolute; width: auto; height: auto; overflow: visible; clip: auto; z-index: 60; padding: 1rem; background: #04222b; color: ${WORKSPACE_TEXT_PRIMARY}; }

/* --- header --- */
.sa-header { position: sticky; top: 0; z-index: 50; background: #063039; border-bottom: 1px solid ${WORKSPACE_BORDER_COLOR}; }
.sa-header-inner { max-width: 72rem; height: 4rem; margin: 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between; }
.sa-brand { display: flex; align-items: center; gap: .625rem; }
.sa-brand-name { font-size: 1rem; font-weight: 600; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-nav, .sa-header-actions { display: none; }
.sa-mobile-auth { display: flex; gap: .5rem; padding: 0 1rem .75rem; }
.sa-mobile-auth > a { flex: 1; padding: .625rem 1rem; }
.sa-nav-link { font-size: .875rem; font-weight: 500; color: ${WORKSPACE_TEXT_MUTED}; transition: opacity .15s; }
.sa-nav-link:hover { opacity: .7; }
.sa-btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; text-align: center; }
.sa-btn--ghost { padding: .5rem 1rem; font-size: .875rem; font-weight: 500; border: 1px solid ${WORKSPACE_BORDER_COLOR}; border-radius: .625rem; color: ${WORKSPACE_TEXT_PRIMARY}; transition: border-color .2s ease, background-color .2s ease; }
.sa-btn--ghost:hover { border-color: ${WORKSPACE_PRIMARY_COLOR}; background: rgba(255, 255, 255, 0.12); }
.sa-btn--solid { padding: .5rem 1rem; font-size: .875rem; font-weight: 600; border-radius: .625rem; background: ${WORKSPACE_PRIMARY_COLOR}; color: ${WORKSPACE_TEXT_ON_PRIMARY}; transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease; }
.sa-btn--solid:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -12px ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.75)}; }
.sa-menu-toggle { display: flex; align-items: center; padding: .5rem; border-radius: .5rem; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-mobile-nav { display: none; padding: 1rem; background: #063039; border-top: 1px solid ${WORKSPACE_BORDER_COLOR}; }
.sa-mobile-nav[data-open="true"] { display: block; }
.sa-mobile-nav > * + * { margin-top: .75rem; }
.sa-mobile-link { display: block; width: 100%; padding: .5rem 0; font-size: .875rem; font-weight: 500; text-align: left; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-mobile-actions { display: flex; gap: .5rem; padding-top: .5rem; }
.sa-mobile-actions > a { flex: 1; padding: .625rem 1rem; }

/* --- hero --- */
.sa-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 4rem);
  padding: 5rem 1rem 6rem;
  overflow: hidden;
  color: #ffffff;
  background:
    radial-gradient(120% 120% at 50% -10%, ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.32)} 0%, ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0)} 55%),
    radial-gradient(90% 90% at 88% 12%, ${colorWithAlpha(WORKSPACE_CONTRAST_COLOR, 0.2)} 0%, ${colorWithAlpha(WORKSPACE_CONTRAST_COLOR, 0)} 50%),
    linear-gradient(155deg, #063039 0%, #04222b 46%, #01161c 100%);
}
/* subtle vignette + top-edge highlight so the gradient reads as premium, not flat */
.sa-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(130% 90% at 50% 120%, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0) 60%);
}
.sa-hero::after {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.55)}, transparent);
}
.sa-hero-inner {
  position: relative;
  z-index: 2;
  max-width: 56rem;
  margin: 0 auto;
  text-align: center;
  animation: sa-hero-in .85s cubic-bezier(.16,1,.3,1) both;
}
@keyframes sa-hero-in { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.sa-hero-title { font-size: 2.375rem; font-weight: 700; letter-spacing: -.03em; line-height: 1.05; color: #ffffff; text-wrap: balance; }
.sa-hero-copy { max-width: 42rem; margin: 1.5rem auto 0; font-size: 1.125rem; font-weight: 400; line-height: 1.6; letter-spacing: -.005em; color: rgba(233, 246, 248, 0.82); text-wrap: balance; }
.sa-hero-actions { margin-top: 2.75rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }
.sa-hero-actions > a { width: 100%; padding: 1rem 2rem; font-size: 1rem; font-weight: 600; letter-spacing: -.01em; border-radius: .875rem; transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, background-color .2s ease, opacity .2s ease; }
.sa-cta--primary { background: ${WORKSPACE_PRIMARY_COLOR}; color: ${WORKSPACE_TEXT_ON_PRIMARY}; box-shadow: 0 10px 30px -10px ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.7)}; }
.sa-cta--primary:hover { transform: translateY(-2px); box-shadow: 0 16px 36px -12px ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.85)}; }
.sa-cta--outline { background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.55); backdrop-filter: blur(4px); }
.sa-cta--outline:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.85); }
/* outline button for use on light section backgrounds */
.sa-cta--outline-solid { background: rgba(255, 255, 255, 0.08); color: ${WORKSPACE_TEXT_PRIMARY}; border: 1px solid ${WORKSPACE_BORDER_COLOR}; transition: transform .2s cubic-bezier(.16,1,.3,1), border-color .2s ease, background-color .2s ease; }
.sa-cta--outline-solid:hover { transform: translateY(-2px); border-color: ${WORKSPACE_PRIMARY_COLOR}; background: rgba(255, 255, 255, 0.14); }

/* --- click-to-play product walkthrough --- */
.sa-demo-section { padding: 5rem 1rem 5.5rem; background: #063039; scroll-margin-top: 4.5rem; }
.sa-demo-shell { max-width: 64rem; margin: 0 auto; text-align: center; }
.sa-demo-copy { max-width: 42rem; margin: 1rem auto 0; font-size: 1.0625rem; line-height: 1.65; color: ${WORKSPACE_TEXT_SECONDARY}; }
.sa-demo-frame { margin-top: 2.25rem; padding: .5rem; border: 1px solid ${WORKSPACE_BORDER_COLOR}; border-radius: 1.25rem; background: rgba(255, 255, 255, 0.06); box-shadow: 0 28px 70px -36px rgba(0, 0, 0, 0.75); }
.sa-demo-video { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: .875rem; background: #04222b; }

/* --- shared section furniture --- */
.sa-section { padding: 5.5rem 1rem; scroll-margin-top: 4.5rem; }
.sa-section--white { background: #063039; }
.sa-section--tinted { background: #04222b; }
.sa-shell { max-width: 72rem; margin: 0 auto; }
.sa-split { display: grid; gap: 3rem; align-items: center; }
/* Narrow screens read copy first; the wide layout puts Alma’s transcript on the left. */
.sa-split--flip > .sa-copy { order: 1; }
.sa-split--flip > .sa-card { order: 2; }
.sa-badge { display: inline-flex; align-items: center; gap: .5rem; margin-bottom: 1rem; padding: .25rem .75rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
.sa-h2 { font-size: 1.875rem; font-weight: 700; letter-spacing: -.03em; line-height: 1.12; color: ${WORKSPACE_TEXT_PRIMARY}; text-wrap: balance; }
.sa-lead { margin-top: 1.125rem; font-size: 1.0625rem; line-height: 1.65; letter-spacing: -.005em; color: ${WORKSPACE_TEXT_SECONDARY}; }
.sa-checklist { margin-top: 1.75rem; display: flex; flex-direction: column; gap: .875rem; }
.sa-checklist li { display: flex; align-items: flex-start; gap: .5rem; font-size: .9375rem; line-height: 1.4rem; color: ${WORKSPACE_TEXT_MUTED}; }
.sa-checklist .sa-icon { margin-top: .125rem; }
.sa-section-actions { margin-top: 2.25rem; display: flex; flex-direction: column; gap: .75rem; }
.sa-section-actions > a { padding: .8125rem 1.5rem; font-size: .9375rem; font-weight: 600; letter-spacing: -.01em; border-radius: .875rem; transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, opacity .2s ease; }
.sa-section-actions > a:hover { transform: translateY(-2px); }
.sa-section-actions > a.sa-cta--primary:hover { box-shadow: 0 14px 30px -12px ${colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.7)}; }
.sa-card { padding: 1.75rem; border: 1px solid ${WORKSPACE_BORDER_COLOR}; border-radius: 1.125rem; box-shadow: 0 1px 2px 0 rgba(0,0,0,.05); transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s ease; }
.sa-card:hover { transform: translateY(-3px); box-shadow: 0 22px 45px -28px rgba(0, 40, 48, 0.35); }
.sa-chat { display: flex; flex-direction: column; gap: .75rem; }
.sa-bubble { padding: .75rem 1rem; font-size: .875rem; line-height: 1.25rem; border-radius: 1rem; }
.sa-bubble--them { border-top-left-radius: .125rem; background: rgba(255, 255, 255, 0.08); border: 1px solid ${WORKSPACE_BORDER_COLOR}; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-bubble--me { border-top-right-radius: .125rem; margin-left: 2rem; }

/* --- social proof --- */

/* --- how it works --- */
.sa-section-head { margin-bottom: 3.5rem; text-align: center; }
.sa-section-head .sa-lead { max-width: 42rem; margin-left: auto; margin-right: auto; color: ${WORKSPACE_TEXT_MUTED}; }
.sa-h2.sa-h2--plain { font-size: 1.875rem; font-weight: 700; letter-spacing: normal; }
.sa-columns { display: grid; gap: 2rem; }
.sa-steps { display: flex; flex-direction: column; gap: 1rem; }
.sa-step { display: flex; gap: .75rem; }
.sa-step-num { flex-shrink: 0; width: 1.75rem; height: 1.75rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; font-size: .75rem; font-weight: 700; }
.sa-step-title { font-size: .875rem; font-weight: 600; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-step-desc { margin-top: .25rem; font-size: .75rem; line-height: 1.625; color: ${WORKSPACE_TEXT_MUTED}; }

/* --- faq --- */
.sa-faq-shell { max-width: 48rem; margin: 0 auto; }
.sa-faq-title { margin-bottom: 2.5rem; text-align: center; }
.sa-faq-group-title { margin-bottom: 1rem; font-size: .875rem; font-weight: 600; text-transform: uppercase; letter-spacing: .025em; color: ${WORKSPACE_TEXT_MUTED}; }
.sa-faq-list { display: flex; flex-direction: column; gap: 1rem; }
.sa-faq-list--students { margin-bottom: 2.5rem; }
.sa-faq-item { padding: 1.25rem; border: 1px solid ${WORKSPACE_BORDER_COLOR}; border-radius: .75rem; }
.sa-faq-q { display: flex; align-items: center; justify-content: space-between; gap: 1rem; list-style: none; cursor: pointer; font-size: .875rem; font-weight: 600; color: ${WORKSPACE_TEXT_PRIMARY}; }
.sa-faq-sign { min-width: 1rem; font-size: 1.125rem; line-height: 1; text-align: center; color: ${WORKSPACE_TEXT_MUTED}; }
.sa-faq-a { margin-top: .75rem; font-size: .875rem; line-height: 1.625; color: ${WORKSPACE_TEXT_MUTED}; }

/* --- footer --- */
.sa-footer { padding: 3rem 1rem; border-top: 1px solid ${WORKSPACE_BORDER_COLOR}; background: ${WORKSPACE_SURFACE_PAGE}; }
.sa-footer-top { display: flex; flex-direction: column; gap: 2rem; }
.sa-footer-brand { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; font-weight: 600; color: ${WORKSPACE_FOOTER_TEXT_PRIMARY}; }
.sa-footer-tagline { max-width: 20rem; font-size: .875rem; color: ${WORKSPACE_FOOTER_TEXT_MUTED}; }
.sa-footer-links { display: flex; flex-wrap: wrap; gap: .75rem 2rem; font-size: .875rem; color: ${WORKSPACE_FOOTER_TEXT_MUTED}; }
.sa-footer-links button:hover { opacity: .7; }
.sa-copyright { margin-top: 2rem; font-size: .75rem; color: ${WORKSPACE_FOOTER_TEXT_MUTED}; }

@media (min-width: 640px) {
  .sa-header-inner { padding: 0 1.5rem; }
  .sa-mobile-auth { padding-left: 1.5rem; padding-right: 1.5rem; }
  .sa-hero { padding: 6rem 1.5rem 7rem; }
  .sa-hero-title { font-size: 3.125rem; }
  .sa-hero-copy { font-size: 1.25rem; }
  .sa-hero-actions { flex-direction: row; }
  .sa-hero-actions > a { width: auto; }
  .sa-section { padding: 6.5rem 1.5rem; }
  .sa-h2 { font-size: 2.25rem; }
  .sa-section-actions { flex-direction: row; }
}

@media (min-width: 768px) {
  .sa-nav { display: flex; align-items: center; gap: 2rem; }
  .sa-header-actions { display: flex; align-items: center; gap: .75rem; }
  .sa-menu-toggle, .sa-mobile-nav[data-open="true"], .sa-mobile-auth { display: none; }
  .sa-split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sa-split--flip > .sa-card { order: 1; }
  .sa-split--flip > .sa-copy { order: 2; }
  .sa-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sa-footer-top { flex-direction: row; align-items: flex-start; justify-content: space-between; }
}

/* Skip layout and paint for below-fold sections until they approach the viewport. */
.sa-page main > section:not(.sa-hero) {
  content-visibility: auto;
  contain-intrinsic-size: auto 720px;
}

@media (min-width: 1024px) {
  .sa-hero-title { font-size: 3.75rem; }
}
`;

// === DATA ===
const NAV_ITEMS: Array<[string, string]> = [
  ['demo-section', 'Demo'],
  ['students-section', 'Students'],
  ['universities-section', 'Universities & Apprenticeships'],
  ['how-it-works', 'How it works'],
  ['faq-section', 'FAQ'],
];

const SCOUT_STEPS = [
  {
    title: 'Tell Scout what matters',
    desc: 'A short conversational intake about your goals, budget, locations, and priorities — not a long form.',
  },
  {
    title: 'Get a ranked shortlist',
    desc: 'Universities and apprenticeships matched to your profile with honest reasoning behind each recommendation.',
  },
  {
    title: 'Refine and decide',
    desc: 'Keep chatting with Scout to compare options until you are confident in your choice.',
  },
];

const ALMA_STEPS = [
  {
    title: 'Share your recruiting brief',
    desc: 'Tell Alma which degree or apprenticeship programmes you are filling, target regions, and enrollment priorities.',
  },
  {
    title: 'Review matched prospects',
    desc: 'Access student profiles aligned to your programs — with fit scores and clear reasoning.',
  },
  {
    title: 'Connect with confidence',
    desc: 'Reach out to intent-qualified students with personalised outreach, consent built in.',
  },
];

const STUDENT_FAQ = [
  {
    q: 'What is Scout?',
    a: 'Scout is a conversational AI — like ChatGPT, but built specifically for university and apprenticeship search. You tell Scout your goals, budget, location preferences, program interests, and must-haves. It builds you a personalised shortlist of universities and apprenticeships that genuinely fit — including ones you’ve never heard of that might be the best match for your specific path.',
  },
  {
    q: 'Is Scout free?',
    a: 'Yes — completely free for every student, everywhere, always. No subscriptions, no unlocks, no hidden fees.',
  },
  {
    q: 'How is this different from rankings and university directories?',
    a: 'Rankings tell you who’s well-known. Scout tells you who’s the best fit for YOU — including universities and apprenticeships that are world-class for a specific program but not globally famous. It also surfaces your profile strengths and weaknesses so you know where you stand.',
  },
  {
    q: 'What if I already have universities or apprenticeships in mind?',
    a: 'Great — Scout works with your existing list. Mark universities and apprenticeships as Dream, Target, or Safe and Scout will help you build around them, filling gaps and flagging better-fit options you might have missed.',
  },
];

const UNIVERSITY_FAQ = [
  {
    q: 'What is Alma?',
    a: 'Alma gives universities and apprenticeship providers access to students who are actively searching right now. Instead of broad recruitment campaigns, you see matched profiles of students whose goals, program interests, budget, and preferences genuinely align with what you offer.',
  },
  {
    q: 'How do universities and apprenticeship providers pay?',
    a: 'Universities and companies offering apprenticeship programmes pay a monthly or annual subscription for access to matched student profiles. You can start with departmental access (one programme or department) or go full-organisation (all programmes, at a discount).',
  },
  {
    q: 'What makes this different from university fairs or social ads?',
    a: 'University and careers fairs are expensive and broad. Social ads can’t target students at the moment of decision — students don’t publicly signal intent on LinkedIn or Instagram. Every student on Scout is actively deciding right now. That intent signal is something no other channel can replicate.',
  },
  {
    q: 'Is student data handled with consent?',
    a: 'Yes. Students explicitly opt in for their profiles to be visible to universities. No student data is shared without their permission.',
  },
];

// === COMPONENTS ===
function Header(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleScroll = (id: string) => {
    setMenuOpen(false);
    scrollToSection(id);
  };

  return (
    <header className="sa-header">
      <div className="sa-header-inner">
        <a className="sa-brand" href="#main-content">
          <img
            src={WORKSPACE_LOGO_URL}
              srcSet={WORKSPACE_LOGO_SRCSET}
              sizes="32px"
            alt="Scout & Alma"
            width={32}
            height={32}
            className="sa-logo sa-logo--header"
            decoding="async"
          />
          <span className="sa-brand-name">{WORKSPACE_BRAND_NAME}</span>
        </a>
        <nav className="sa-nav" aria-label="Primary">
          {NAV_ITEMS.map(([id, label]) => (
            <button key={id} type="button" className="sa-nav-link" onClick={() => handleScroll(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sa-header-actions">
          <a className="sa-btn sa-btn--ghost" href={LOGIN_URL}>
            Log in
          </a>
          <a className="sa-btn sa-btn--solid" href={SIGNUP_URL}>
            Sign up
          </a>
        </div>
        <button
          type="button"
          className="sa-menu-toggle"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="sa-mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <CloseIcon className="sa-icon--nav" /> : <MenuIcon className="sa-icon--nav" />}
        </button>
      </div>
      <div className="sa-mobile-auth" aria-label="Account actions">
        <a className="sa-btn sa-btn--ghost" href={LOGIN_URL} data-testid="mobile-login">
          Log in
        </a>
        <a className="sa-btn sa-btn--solid" href={SIGNUP_URL} data-testid="mobile-signup">
          Sign up
        </a>
      </div>
      <div className="sa-mobile-nav" id="sa-mobile-nav" data-open={menuOpen ? 'true' : 'false'}>
        {NAV_ITEMS.map(([id, label]) => (
          <button key={id} type="button" className="sa-mobile-link" onClick={() => handleScroll(id)}>
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}

function Hero(): JSX.Element {
  return (
    <section className="sa-hero">
      <div className="sa-hero-inner">
        <h1 className="sa-hero-title">Find the university or apprenticeship that&rsquo;s genuinely right for you</h1>
        <p className="sa-hero-copy">
          Conversational AI that understands your goals, budget, and priorities &mdash; then matches
          you with universities and apprenticeships that actually fit.
        </p>
        <div className="sa-hero-actions">
          <a className="sa-btn sa-cta--primary" href={STUDENT_SIGNUP_URL}>
            I&rsquo;m a Student <ArrowRightIcon />
          </a>
          <a className="sa-btn sa-cta--outline" href={UNIVERSITY_SIGNUP_URL}>
            I&rsquo;m a University <ArrowRightIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

function ProductDemo(): JSX.Element {
  return (
    <section id="demo-section" className="sa-demo-section" aria-labelledby="scout-demo-title">
      <div className="sa-demo-shell sa-reveal">
        <h2 id="scout-demo-title" className="sa-h2">Demo</h2>
        <p className="sa-demo-copy">
          A walkthrough of both sides of the platform &mdash; Scout, where students turn one
          conversation into a ranked shortlist of universities and apprenticeships, and Alma, where
          universities and apprenticeship providers reach the students who genuinely fit.
        </p>
        <div className="sa-demo-frame">
          <video
            className="sa-demo-video"
            src={SCOUT_DEMO_VIDEO_URL}
            muted
            loop
            controls
            preload="none"
            playsInline
            aria-label="Scout and Alma product walkthrough: student matching and university recruiting"
          >
            Your browser does not support embedded video.
          </video>
        </div>
      </div>
    </section>
  );
}

function Checklist({ items, color }: { items: string[]; color: string }): JSX.Element {
  return (
    <ul className="sa-checklist">
      {items.map((item) => (
        <li key={item}>
          <CheckCircleIcon style={{ color }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ScoutSection(): JSX.Element {
  return (
    <section id="students-section" className="sa-section sa-section--white">
      <div className="sa-shell sa-split">
        <div className="sa-copy sa-reveal">
          <div
            className="sa-badge"
            style={{
              background: colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.1),
              color: WORKSPACE_DARK_SURFACE_PRIMARY_BADGE_TEXT,
            }}
          >
            <GraduationCapIcon className="sa-icon--xs" /> For Students
          </div>
          <h2 className="sa-h2">Meet Scout &mdash; conversational AI for university and apprenticeship research</h2>
          <p className="sa-lead">
            Personalised university and apprenticeship matching with Dream, Target, and Safe tiering.
            Conversational &mdash; not forms. A persistent chat that learns what matters to you.
          </p>
          <Checklist
            items={[
              'Personalised university & apprenticeship matching',
              'Dream / Target / Safe tiering',
              'Conversational intake — not forms',
              'Persistent chat that remembers your goals',
            ]}
            color={WORKSPACE_PRIMARY_COLOR}
          />
          <div className="sa-section-actions">
            <a className="sa-btn sa-cta--outline-solid" href={STUDENT_SURVEY_URL}>
              Take the student survey
            </a>
            <a className="sa-btn sa-cta--primary" href={STUDENT_SIGNUP_URL}>
              I&rsquo;m a Student <ArrowRightIcon />
            </a>
          </div>
        </div>
        <div className="sa-card sa-reveal sa-reveal--delay-1" style={{ background: 'rgba(255, 255, 255, 0.08)' }}>
          <div className="sa-chat">
            <div className="sa-bubble sa-bubble--them">
              Hi there &mdash; I&rsquo;m Scout. What subjects or fields excite you most?
            </div>
            <div
              className="sa-bubble sa-bubble--me"
              style={{ background: WORKSPACE_PRIMARY_COLOR, color: WORKSPACE_TEXT_ON_PRIMARY }}
            >
              Computer science and environmental studies &mdash; ideally somewhere with strong
              research opportunities.
            </div>
            <div className="sa-bubble sa-bubble--them">
              Great choices. I&rsquo;m building your shortlist &mdash; 3 universities and apprenticeships
              matched so far&hellip;
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AlmaSection(): JSX.Element {
  return (
    <section id="universities-section" className="sa-section sa-section--tinted">
      <div className="sa-shell sa-split sa-split--flip">
        <div className="sa-card sa-reveal" style={{ background: 'rgba(255, 255, 255, 0.08)' }}>
          <div className="sa-chat">
            <div className="sa-bubble sa-bubble--them">
              Hi &mdash; I&rsquo;m Alma. Which programs are you actively trying to fill?
            </div>
            <div
              className="sa-bubble sa-bubble--me"
              style={{ background: WORKSPACE_HIGHLIGHT_COLOR, color: WORKSPACE_TEXT_ON_HIGHLIGHT }}
            >
              Postgraduate STEM programmes and degree apprenticeships &mdash; targeting students from
              Southeast Asia and India.
            </div>
            <div className="sa-bubble sa-bubble--them">
              I&rsquo;ve found 5 intent-qualified prospects matched to your programs&hellip;
            </div>
          </div>
        </div>
        <div className="sa-copy sa-reveal sa-reveal--delay-1">
          <div
            className="sa-badge"
            style={{
              background: colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12),
              color: WORKSPACE_DARK_SURFACE_HIGHLIGHT_BADGE_TEXT,
            }}
          >
            <RadarIcon className="sa-icon--xs" /> For Universities &amp; Apprenticeships
          </div>
          <h2 className="sa-h2">Meet Alma &mdash; reach students who are actively deciding</h2>
          <p className="sa-lead">
            Whether you&rsquo;re a university or a company offering apprenticeship programmes, access
            intent-qualified student profiles matched to what you offer. Data consent built in from day one.
          </p>
          <Checklist
            items={[
              'Intent-qualified student profiles',
              'Matched to your degrees or apprenticeship programmes',
              'Built for universities and apprenticeship providers',
              'Data consent built in',
              'Personalised outreach strategies',
            ]}
            color={WORKSPACE_HIGHLIGHT_COLOR}
          />
          <div className="sa-section-actions">
            <a className="sa-btn sa-cta--outline-solid" href={UNIVERSITY_SURVEY_URL}>
              Take the university survey
            </a>
            <a
              className="sa-btn"
              style={{ background: WORKSPACE_HIGHLIGHT_COLOR, color: WORKSPACE_TEXT_ON_HIGHLIGHT }}
              href={UNIVERSITY_SIGNUP_URL}
            >
              I&rsquo;m a University <ArrowRightIcon />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Steps({
  steps,
  background,
  color,
}: {
  steps: typeof SCOUT_STEPS;
  background: string;
  color: string;
}): JSX.Element {
  return (
    <ol className="sa-steps">
      {steps.map((step, i) => (
        <li className="sa-step" key={step.title}>
          <span className="sa-step-num" style={{ background, color }}>
            {i + 1}
          </span>
          <div>
            <p className="sa-step-title">{step.title}</p>
            <p className="sa-step-desc">{step.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function HowItWorks(): JSX.Element {
  return (
    <section id="how-it-works" className="sa-section sa-section--tinted">
      <div className="sa-shell">
        <div className="sa-section-head sa-reveal">
          <h2 className="sa-h2 sa-h2--plain">How it works</h2>
          <p className="sa-lead">
            One platform, two experiences &mdash; Scout for students discovering their fit, Alma for
            universities and apprenticeship providers reaching aligned prospects.
          </p>
        </div>
        <div className="sa-columns">
          <div className="sa-card sa-reveal" style={{ background: 'rgba(255, 255, 255, 0.08)', boxShadow: 'none' }}>
            <div
              className="sa-badge"
              style={{
                background: colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.1),
                color: WORKSPACE_DARK_SURFACE_PRIMARY_BADGE_TEXT,
              }}
            >
              <GraduationCapIcon className="sa-icon--xs" /> Scout &mdash; for students
            </div>
            <Steps
              steps={SCOUT_STEPS}
              background={colorWithAlpha(WORKSPACE_PRIMARY_COLOR, 0.12)}
              color={WORKSPACE_STEP_BADGE_TEXT}
            />
          </div>
          <div className="sa-card sa-reveal sa-reveal--delay-1" style={{ background: 'rgba(255, 255, 255, 0.08)', boxShadow: 'none' }}>
            <div
              className="sa-badge"
              style={{
                background: colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12),
                color: WORKSPACE_DARK_SURFACE_HIGHLIGHT_BADGE_TEXT,
              }}
            >
              <RadarIcon className="sa-icon--xs" /> Alma &mdash; for universities &amp; apprenticeships
            </div>
            <Steps
              steps={ALMA_STEPS}
              background={colorWithAlpha(WORKSPACE_HIGHLIGHT_COLOR, 0.12)}
              color={WORKSPACE_ALMA_STEP_BADGE_TEXT}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqList({
  items,
  extraClass,
}: {
  items: typeof STUDENT_FAQ;
  extraClass: string;
}): JSX.Element {
  const [openItems, setOpenItems] = useState<Set<string>>(() => new Set());

  const handleToggle = (question: string, isOpen: boolean) => {
    setOpenItems((current) => {
      const next = new Set(current);
      if (isOpen) next.add(question);
      else next.delete(question);
      return next;
    });
  };

  return (
    <div className={`sa-faq-list ${extraClass}`.trim()}>
      {items.map((item) => {
        const isOpen = openItems.has(item.q);
        return (
          <details
            className="sa-faq-item"
            key={item.q}
            open={isOpen}
            onToggle={(event) => handleToggle(item.q, event.currentTarget.open)}
          >
            <summary className="sa-faq-q" aria-expanded={isOpen}>
              {item.q}
              <span className="sa-faq-sign" aria-label={isOpen ? 'Collapse answer' : 'Expand answer'}>
                {isOpen ? '−' : '+'}
              </span>
            </summary>
            <p className="sa-faq-a">{item.a}</p>
          </details>
        );
      })}
    </div>
  );
}

function FaqSection(): JSX.Element {
  return (
    <section id="faq-section" className="sa-section sa-section--white">
      <div className="sa-faq-shell sa-reveal">
        <h2 className="sa-h2 sa-h2--plain sa-faq-title">Frequently asked questions</h2>
        <h3 className="sa-faq-group-title">FAQ: For Students</h3>
        <FaqList items={STUDENT_FAQ} extraClass="sa-faq-list--students" />
        <h3 className="sa-faq-group-title">FAQ: For Universities &amp; Apprenticeships</h3>
        <FaqList items={UNIVERSITY_FAQ} extraClass="" />
      </div>
    </section>
  );
}

function Footer(): JSX.Element {
  return (
    <footer className="sa-footer">
      <div className="sa-shell">
        <div className="sa-footer-top">
          <div>
            <div className="sa-footer-brand">
              <img
                src={WORKSPACE_LOGO_URL}
              srcSet={WORKSPACE_LOGO_SRCSET}
              sizes="32px"
                alt="Scout & Alma"
                width={28}
                height={28}
                className="sa-logo sa-logo--footer"
                loading="lazy"
                decoding="async"
              />
              <span>{WORKSPACE_BRAND_NAME}</span>
            </div>
            <p className="sa-footer-tagline">{WORKSPACE_TAGLINE}</p>
          </div>
          <div className="sa-footer-links">
            {NAV_ITEMS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => scrollToSection(id)}>
                {label}
              </button>
            ))}
            <a href="/privacy">Privacy</a>
            <span>Terms</span>
          </div>
        </div>
        <p className="sa-copyright">
          &copy; {new Date().getFullYear()} {WORKSPACE_BRAND_NAME}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function App(): JSX.Element {
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = WORKSPACE_BRAND_NAME;
    const root = document.getElementById('root');
    if (root) root.removeAttribute('aria-busy');
    try {
      const hide = (window as unknown as { hidePreviewLoading?: () => void }).hidePreviewLoading;
      if (typeof hide === 'function') hide();
    } catch {
      /* the platform shell hides its own loader shortly after; nothing to do */
    }
  }, []);

  // Lightweight scroll-triggered entrance animations. Elements tagged with
  // `.sa-reveal` fade/slide up once as they scroll into view. Respects reduced
  // motion and degrades gracefully where IntersectionObserver is unavailable.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.sa-reveal'));
    if (els.length === 0) return;

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sa-page">
      <style>{STYLES}</style>
      <a className="sa-skip" href="#main-content">
        Skip to main content
      </a>
      <Header />
      <main id="main-content">
        <Hero />
        <ProductDemo />
        <ScoutSection />
        <AlmaSection />
        <HowItWorks />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}

// === PRIVACY POLICY (/privacy) ===
// This view is defined in this file rather than imported from
// ../components/PrivacyPolicy because the landing page is compiled as a single
// standalone module: only bare specifiers resolve (through the page importmap),
// so a relative workspace import fails the build with "Could not resolve".
const PRIVACY_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap');
.sa-privacy { min-height: 100vh; background: #f5fafb; color: #0e2d32; font-family: ${WORKSPACE_FONT_FAMILY}; -webkit-font-smoothing: antialiased; }
.sa-privacy *, .sa-privacy *::before, .sa-privacy *::after { box-sizing: border-box; }
:where(.sa-privacy) :where(h1, h2, p, ul) { margin: 0; padding: 0; }
.sa-privacy-shell { width: 100%; max-width: 860px; margin: 0 auto; padding: 0 20px; }
.sa-privacy-header { position: sticky; top: 0; z-index: 20; background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(10px); border-bottom: 1px solid #d2eaef; }
.sa-privacy-header-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.sa-privacy-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #0e2d32; text-decoration: none; }
.sa-privacy-home { padding: 9px 16px; border: 1px solid #d2eaef; border-radius: 10px; background: #ffffff; font-size: 14px; font-weight: 500; color: #0e2d32; text-decoration: none; }
.sa-privacy-home:hover { opacity: 0.7; }
.sa-privacy-hero { padding: 56px 0 48px; background: #ffffff; border-bottom: 1px solid #d2eaef; }
.sa-privacy-eyebrow { margin-bottom: 14px; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #22717e; }
.sa-privacy-hero h1 { font-size: clamp(32px, 5vw, 44px); font-weight: 700; letter-spacing: -0.02em; }
.sa-privacy-lede { margin-top: 18px; font-size: 17px; line-height: 1.65; color: #1a5761; }
.sa-privacy-updated { margin-top: 14px; font-size: 14px; font-weight: 500; color: #22717e; }
.sa-privacy-body { padding: 36px 0 64px; }
.sa-privacy-toc { margin-bottom: 24px; padding: 20px 22px; background: #ffffff; border: 1px solid #d2eaef; border-radius: 16px; }
.sa-privacy-toc-title { margin-bottom: 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #22717e; }
.sa-privacy-toc-links { display: flex; flex-wrap: wrap; gap: 10px 22px; }
.sa-privacy-toc-links a { font-size: 14px; color: #1a5761; text-decoration: none; }
.sa-privacy-toc-links a:hover { opacity: 0.7; text-decoration: underline; }
.sa-privacy-card { padding: 8px 28px; background: #ffffff; border: 1px solid #d2eaef; border-radius: 16px; box-shadow: 0 1px 2px rgba(6, 48, 57, 0.06); }
.sa-privacy-section { padding: 30px 0; border-bottom: 1px solid #d2eaef; scroll-margin-top: 88px; }
.sa-privacy-section:last-child { border-bottom: 0; }
.sa-privacy-section h2 { margin-bottom: 14px; font-size: 21px; font-weight: 700; letter-spacing: -0.01em; }
.sa-privacy-copy { font-size: 15.5px; line-height: 1.72; color: #1a5761; }
.sa-privacy-copy p + p, .sa-privacy-copy ul, .sa-privacy-copy ul + p { margin-top: 14px; }
.sa-privacy-copy ul { list-style: disc; padding-left: 20px; }
.sa-privacy-copy li + li { margin-top: 10px; }
.sa-privacy-copy strong { font-weight: 600; color: #0e2d32; }
.sa-privacy-copy a { font-weight: 600; color: #22717e; text-decoration: underline; text-underline-offset: 2px; }
.sa-privacy-footer { padding: 28px 0; background: #fbfdfe; border-top: 1px solid #d2eaef; }
.sa-privacy-footer-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; color: #1a5761; }
.sa-privacy-footer-links { display: flex; gap: 22px; }
.sa-privacy-footer-links a { color: #1a5761; text-decoration: none; }
.sa-privacy-footer-links a:hover { opacity: 0.7; }
@media (max-width: 640px) {
  .sa-privacy-hero { padding: 40px 0 34px; }
  .sa-privacy-card { padding: 4px 18px; }
}
`;

// Build the privacy-only JSX on demand instead of allocating the whole policy
// during every landing-page startup.
function getPrivacySections(): Array<{ id: string; title: string; body: JSX.Element }> {
  return [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    body: (
      <>
        <p>
          Scout &amp; Alma collects information you provide when using Scout (student-facing) or Alma
          (institution-facing), including:
        </p>
        <ul>
          <li>Name and email address</li>
          <li>Citizenship and permanent residency status</li>
          <li>Academic background &mdash; current level of study, subjects, grades</li>
          <li>Programme preferences &mdash; universities, apprenticeships, or both</li>
          <li>Countries of interest</li>
          <li>Conversation history within the app</li>
        </ul>
        <p>
          We also collect standard usage data (pages visited, features used, timestamps) and
          device/browser information.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: '2. How We Use Your Information',
    body: (
      <>
        <p>We use your information to:</p>
        <ul>
          <li>Power Scout’s AI-driven programme recommendations</li>
          <li>
            Match students with university programmes and apprenticeship opportunities that fit their
            profile
          </li>
          <li>
            Provide Alma with access to anonymised and opted-in student profile data for institutional
            recruitment
          </li>
          <li>Improve the accuracy and relevance of our recommendations over time</li>
          <li>Send daily programme updates and notifications (where you have opted in)</li>
          <li>Communicate with you about your account and our service</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-share-information',
    title: '3. How We Share Your Information',
    body: (
      <>
        <p>
          <strong>We do not sell your personal data.</strong> We share data in the following
          circumstances:
        </p>
        <ul>
          <li>
            With universities and apprenticeship companies via Alma, only where you have explicitly
            opted in to being discoverable
          </li>
          <li>
            With trusted service providers who help us operate the platform (e.g. cloud hosting,
            analytics) under strict data processing agreements
          </li>
          <li>When required by law or to protect the rights and safety of our users</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: '4. Data Retention',
    body: (
      <p>
        We retain your personal data for as long as your account is active or as needed to provide
        our services. You may request deletion of your account and associated data at any time by
        contacting us at <a href="mailto:privacy@scoutandalma.com">privacy@scoutandalma.com</a>.
        Programme interaction data may be retained in anonymised, aggregated form after deletion.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: '5. Your Rights',
    body: (
      <>
        <p>Depending on your location, you may have rights to:</p>
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to or restrict certain processing</li>
          <li>Data portability</li>
        </ul>
        <p>
          To exercise any of these rights, contact{' '}
          <a href="mailto:privacy@scoutandalma.com">privacy@scoutandalma.com</a>.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '6. Security',
    body: (
      <p>
        We use industry-standard security measures to protect your data, including encryption in
        transit (HTTPS) and at rest. Access to personal data is restricted to authorised personnel
        only. No method of transmission or storage is 100% secure; we encourage you to use a strong
        password and keep your login credentials confidential.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: '7. Cookies',
    body: (
      <p>
        We use essential cookies to keep you logged in and maintain your session. We may use
        analytics cookies to understand how users interact with our platform and improve the
        experience. You can control cookie preferences through your browser settings.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '8. Contact Us',
    body: (
      <>
        <p>
          If you have questions about this Privacy Policy or how we handle your data, contact us at:{' '}
          <a href="mailto:privacy@scoutandalma.com">privacy@scoutandalma.com</a>.
        </p>
        <p>
          Scout &amp; Alma &mdash; <a href="https://www.scoutandalma.com">scoutandalma.com</a> /{' '}
          <a href="https://app.scoutandalma.com">app.scoutandalma.com</a>
        </p>
      </>
    ),
  },
  ];
}

function PrivacyPolicy(): JSX.Element {
  const privacySections = getPrivacySections();

  // The host shell can leave the document scroll-locked for the app view, which
  // would trap this long document at one viewport height.
  useEffect(() => {
    const previousTitle = document.title;
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      rootOverflow: root ? root.style.overflow : '',
      rootHeight: root ? root.style.height : '',
      rootMaxHeight: root ? root.style.maxHeight : '',
    };

    document.title = `Privacy Policy | ${WORKSPACE_BRAND_NAME}`;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    body.style.position = 'static';
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
      root.style.maxHeight = 'none';
    }

    return () => {
      document.title = previousTitle;
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      if (root) {
        root.style.overflow = previous.rootOverflow;
        root.style.height = previous.rootHeight;
        root.style.maxHeight = previous.rootMaxHeight;
      }
    };
  }, []);

  return (
    <div className="sa-privacy">
      <style>{PRIVACY_STYLES}</style>

      <header className="sa-privacy-header">
        <div className="sa-privacy-shell sa-privacy-header-inner">
          <a href="/" className="sa-privacy-brand" aria-label={`${WORKSPACE_BRAND_NAME} home`}>
            <BrandMark size={28} />
            <span>{WORKSPACE_BRAND_NAME}</span>
          </a>
          <a href="https://www.scoutandalma.com" className="sa-privacy-home">Back to home</a>
        </div>
      </header>

      <main>
        <section className="sa-privacy-hero">
          <div className="sa-privacy-shell">
            <p className="sa-privacy-eyebrow">{WORKSPACE_BRAND_NAME}</p>
            <h1>Privacy Policy</h1>
            <p className="sa-privacy-lede">Scout &amp; Alma (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the Scout &amp; Alma platform, accessible at scoutandalma.com and app.scoutandalma.com. This Privacy Policy explains how we collect, use, and protect your information.</p>
            <p className="sa-privacy-updated">Last updated: August 2026</p>
          </div>
        </section>

        <div className="sa-privacy-shell sa-privacy-body">
          <nav className="sa-privacy-toc" aria-label="Privacy policy sections">
            <p className="sa-privacy-toc-title">On this page</p>
            <div className="sa-privacy-toc-links">
              {privacySections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>{section.title}</a>
              ))}
            </div>
          </nav>

          <article className="sa-privacy-card">
            {privacySections.map((section) => (
              <section key={section.id} id={section.id} className="sa-privacy-section">
                <h2>{section.title}</h2>
                <div className="sa-privacy-copy">{section.body}</div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="sa-privacy-footer">
        <div className="sa-privacy-shell sa-privacy-footer-inner">
          <p>&copy; {new Date().getFullYear()} {WORKSPACE_BRAND_NAME}. All rights reserved.</p>
          <div className="sa-privacy-footer-links">
            <a href="/">Home</a>
            <a href="/privacy">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// === ROUTING ===
// The marketing host serves this bundle for every pathname, so the /privacy
// view is selected client-side. Hash form (#/privacy) is accepted too, and a
// host that mounts the page under a path prefix still matches on the suffix.
function currentRoute(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  const raw = hash.startsWith('/') ? hash : window.location.pathname;
  const clean = raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean || '/';
}

function isPrivacyRoute(route: string): boolean {
  return route === '/privacy' || route.endsWith('/privacy');
}

export default function RoutedLandingPage(): JSX.Element {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const sync = () => setRoute(currentRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  if (isPrivacyRoute(route)) return <PrivacyPolicy />;
  return <LandingPageComponent />;
}

const LandingPageComponent = App;

// === MOUNT ===
// ReactDOM is the largest dependency the workspace controls. Keep it out of the
// initial module graph, yield one frame to the browser, then fetch and evaluate
// it asynchronously before mounting the router. This gives the platform’s
// lightweight loading shell a chance to paint and accept input first.
function mountLandingPage(): void {
  void import('react-dom/client')
    .then(({ createRoot }) => {
      const container = document.getElementById('root');
      if (container) createRoot(container).render(<RoutedLandingPage />);
    })
    .catch((error) => {
      console.error('[Scout & Alma] Unable to load the landing page renderer', error);
    });
}

if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(mountLandingPage);
} else {
  mountLandingPage();
}
