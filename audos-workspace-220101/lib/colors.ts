import type { CSSProperties } from 'react';

/**
 * Scout & Alma shared design system.
 * Components should consume these semantic tokens instead of hard-coded shell colors.
 */

export const brand = {
  primary: {
    50: 'var(--space-brand-primary-50)',
    100: 'var(--space-brand-primary-100)',
    200: 'var(--space-brand-primary-200)',
    500: 'var(--space-brand-primary-500)',
    600: 'var(--space-brand-primary-600)',
    700: 'var(--space-brand-primary-700)',
    900: 'var(--space-brand-primary-900)',
  },
  accent: {
    50: 'var(--space-brand-highlight-50)',
    100: 'var(--space-brand-highlight-100)',
    200: 'var(--space-brand-highlight-200)',
    500: 'var(--space-brand-highlight-500)',
    600: 'var(--space-brand-highlight-600)',
    700: 'var(--space-brand-highlight-700)',
    900: 'var(--space-brand-highlight-900)',
  },
  contrast: 'var(--space-brand-contrast)',
} as const;

export const semantic = {
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',
    600: 'var(--space-semantic-success)',
    700: '#15803d',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#f59e0b',
    600: 'var(--space-semantic-warning)',
    700: '#a16207',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: 'var(--space-semantic-danger)',
    700: '#b91c1c',
  },
} as const;

export const neutral = {
  0: '#ffffff',
  50: '#f7feff',
  100: '#eefbfe',
  200: '#d7f4fa',
  300: '#b7eaf4',
  400: '#7ccddd',
  500: '#487b84',
  600: '#075f6f',
  700: '#005061',
  800: '#003f4b',
  900: '#00343d',
  950: '#02272e',
} as const;

export const typography = {
  fontFamily: 'var(--space-font-family, "Space Grotesk", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',

  size: {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl',
  },

  weight: {
    light: 'font-light',
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  },

  color: {
    primary: 'text-[var(--space-text-primary)]',
    secondary: 'text-[var(--space-text-secondary)]',
    tertiary: 'text-[var(--space-text-muted)]',
    muted: 'text-[var(--space-text-muted)]',
    inverse: 'text-[var(--space-text-on-primary)]',
    brand: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    danger: 'text-[var(--space-semantic-danger)]',
    success: 'text-[var(--space-semantic-success)]',
  },
} as const;

export const colors = {
  primary: brand.primary,
  accent: brand.accent,
  contrast: brand.contrast,
  success: semantic.success,
  warning: semantic.warning,
  danger: semantic.danger,
  neutral,

  gradients: {
    default: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
    warm: 'from-[var(--space-brand-highlight-50)] via-[var(--space-surface-gradient-to)] to-[var(--space-brand-highlight-100)]',
    cool: 'from-[var(--space-brand-primary-50)] via-[var(--space-surface-gradient-from)] to-[var(--space-brand-primary-100)]',
    nature: 'from-[var(--space-surface-page-alt)] via-[var(--space-brand-primary-50)] to-[var(--space-surface-gradient-from)]',
    signature: 'from-[var(--space-brand-primary-50)] via-[var(--space-surface-page-alt)] to-[var(--space-brand-highlight-50)]',
  },

  glass: {
    background: 'bg-[var(--space-surface-panel)] backdrop-blur-xl',
    border: 'border-[var(--space-border-default)]',
  },
} as const;

export const tw = {
  button: {
    primary: 'bg-[var(--space-brand-primary)] hover:brightness-95 text-[var(--space-text-on-primary)] shadow-[0_10px_24px_var(--space-shell-shadow)] font-semibold transition-all',
    brand: 'bg-[var(--space-brand-primary)] hover:brightness-95 text-[var(--space-text-on-primary)] shadow-[0_10px_24px_var(--space-shell-shadow)] font-semibold transition-all',
    accent: 'bg-[var(--space-brand-highlight)] hover:brightness-95 text-[var(--space-text-on-highlight)] shadow-[0_10px_24px_var(--space-shell-shadow)] font-semibold transition-all',
    secondary: 'bg-[var(--space-surface-muted)] hover:bg-[var(--space-surface-card-hover)] text-[var(--space-text-primary)] ring-1 ring-[var(--space-border-default)] font-medium transition-all',
    danger: 'bg-[var(--space-semantic-danger)] hover:brightness-95 text-white font-medium transition-all',
    ghost: 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] transition-all',
    disabled: 'opacity-50 cursor-not-allowed shadow-none',
  },

  input: {
    base: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all',
    default: 'border-[var(--space-border-default)] bg-[var(--space-surface-card)] text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)] focus:ring-[var(--space-brand-primary)]',
    error: 'border-[var(--space-semantic-danger)] focus:ring-[var(--space-semantic-danger)]',
    disabled: 'bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] cursor-not-allowed',
  },

  dock: {
    active: 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] shadow-[0_10px_24px_var(--space-shell-shadow)]',
    inactive: 'bg-[var(--space-surface-card)] hover:bg-[var(--space-surface-card-hover)] text-[var(--space-text-primary)] ring-1 ring-[var(--space-border-default)]',
    glass: 'bg-[var(--space-surface-panel)] backdrop-blur-xl rounded-2xl border border-[var(--space-border-default)] shadow-[0_18px_44px_var(--space-shell-shadow)]',
  },

  message: {
    user: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-primary)]',
    assistant: 'bg-[var(--space-surface-panel)] text-[var(--space-text-primary)]',
  },

  icon: {
    primary: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    neutral: 'text-[var(--space-text-secondary)]',
    muted: 'text-[var(--space-text-muted)]',
    danger: 'text-[var(--space-semantic-danger)]',
    success: 'text-[var(--space-semantic-success)]',
  },

  card: {
    default: 'bg-[var(--space-surface-card)] border border-[var(--space-border-default)] rounded-lg shadow-sm hover:shadow-md transition-shadow',
    elevated: 'bg-[var(--space-surface-card)] rounded-2xl border border-[var(--space-border-default)] shadow-[0_22px_56px_var(--space-shell-shadow)]',
    glass: 'bg-[var(--space-surface-panel)] backdrop-blur-xl border border-[var(--space-border-default)] rounded-2xl shadow-[0_18px_44px_var(--space-shell-shadow)]',
    flat: 'bg-[var(--space-surface-muted)] rounded-lg border border-[var(--space-border-default)]',
  },

  badge: {
    default: 'px-2 py-0.5 text-xs font-medium rounded-full',
    primary: 'bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]',
    accent: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },

  layout: {
    centerScreen: 'min-h-screen flex items-center justify-center',
    container: 'max-w-md w-full mx-auto p-8',
  },

  bg: {
    page: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    gate: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    card: 'bg-[var(--space-surface-card)]',
    muted: 'bg-[var(--space-surface-muted)]',
    accent: 'bg-[var(--space-surface-accent-soft)]',
  },

  agent: {
    icon: 'text-[var(--space-shell-icon)]',
    fab: 'bg-[var(--space-brand-highlight)] hover:brightness-95 text-[var(--space-text-on-highlight)] shadow-[0_14px_34px_var(--space-shell-shadow-strong)]',
    headerIcon: 'text-[var(--space-shell-icon)]',
    dockActive: 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] shadow-[0_10px_24px_var(--space-shell-shadow)]',
    dockInactive: 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]',
  },

  appIcon: {
    default: 'text-[var(--space-text-brand)]',
    files: 'text-[var(--space-text-brand)]',
    settings: 'text-[var(--space-text-secondary)]',
    active: 'text-[var(--space-text-accent)]',
  },

  priority: {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  },

  category: {
    work: 'bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]',
    ideas: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    personal: 'bg-green-100 text-green-700',
    other: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },

  typography,
} as const;

export const authStyles = {
  container: `${tw.layout.centerScreen} ${tw.bg.gate} p-4 sm:p-8 safe-top safe-bottom`,
  card: `${tw.card.elevated} p-6 sm:p-8 max-w-md w-full mx-4 sm:mx-auto`,
  title: `text-xl sm:text-2xl ${typography.weight.semibold} ${typography.color.primary} text-center mb-2`,
  subtitle: `${typography.size.sm} ${typography.color.secondary} text-center`,
  inputWrapper: 'space-y-4',
  input: (hasError: boolean) =>
    `${tw.input.base} ${hasError ? tw.input.error : tw.input.default} text-base`,
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  submitButton: (disabled: boolean) =>
    `w-full px-4 py-3.5 sm:py-3 rounded-lg ${tw.button.primary} ${disabled ? tw.button.disabled : ''} text-base`,
  footerText: `${typography.size.xs} ${typography.color.tertiary} text-center mt-4`,
} as const;

export const settingsStyles = {
  container: 'h-full overflow-y-auto',
  innerContainer: 'max-w-md mx-auto p-8',
  section: 'space-y-6',
  label: `block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} mb-2`,
  input: (hasError: boolean) =>
    `${tw.input.base} ${hasError ? tw.input.error : tw.input.default}`,
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  saveButton: (disabled: boolean) =>
    `w-full px-4 py-2.5 rounded-lg ${tw.button.primary} flex items-center justify-center gap-2 ${disabled ? tw.button.disabled : ''}`,
} as const;

export function getGradientClass(gradient?: string): string {
  return gradient || tw.bg.page;
}

export function getFontFamily(): CSSProperties {
  return { fontFamily: typography.fontFamily };
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}