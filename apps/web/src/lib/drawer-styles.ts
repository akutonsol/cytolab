import type { CSSProperties } from 'react';

// Shared premium drawer / modal / form design system.
// Avelon panel shell + legacy form field language. Zero-orange: the reference
// "locked/alert" banner was amber — recolored to indigo to honour the rule.
export const DS = {
  // Drawer/Modal shell
  drawerBg: '#EEF2F8',
  drawerWidth: 860,
  drawerPadding: '32px',

  // Typography
  drawerTitle: {
    fontFamily: 'Geist, sans-serif',
    fontSize: 28,
    fontWeight: 700,
    fontStyle: 'italic',
    color: '#1E3A8A',
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
  } as CSSProperties,
  drawerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: 500,
    marginTop: 4,
  } as CSSProperties,

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 24,
  } as CSSProperties,

  // Form field — text input (solid border)
  input: {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 12,
    padding: '11px 14px',
    fontSize: 14,
    color: '#0F172A',
    width: '100%',
    outline: 'none',
    fontFamily: 'Inter, sans-serif',
  } as CSSProperties,
  inputFocus: {
    border: '1.5px solid #4F46E5',
    boxShadow: '0 0 0 3px rgba(79,70,229,0.08)',
  } as CSSProperties,

  // Form field — select/search (dashed border)
  selectInput: {
    background: '#F8FAFC',
    border: '1.5px dashed #CBD5E1',
    borderRadius: 12,
    padding: '11px 14px',
    fontSize: 14,
    color: '#64748B',
    width: '100%',
  } as CSSProperties,

  // Form label
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
    display: 'block',
    fontFamily: 'Geist, sans-serif',
  } as CSSProperties,

  // Primary button
  btnPrimary: {
    background: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 12,
    padding: '11px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Geist, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,

  // Outline button (Avelon style)
  btnOutline: {
    background: 'transparent',
    color: '#4F46E5',
    border: '1.5px solid #4F46E5',
    borderRadius: 999,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Geist, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,

  // Secondary/ghost button
  btnSecondary: {
    background: '#F1F5F9',
    color: '#475569',
    border: '1px solid #E2E8F0',
    borderRadius: 12,
    padding: '11px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Geist, sans-serif',
  } as CSSProperties,

  // Footer cancel button (white, bordered — centered-modal pattern)
  btnFooterCancel: {
    background: '#FFFFFF',
    color: '#64748B',
    border: '1px solid #E2E8F0',
    borderRadius: 12,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Geist, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  } as CSSProperties,

  // Danger button
  btnDanger: {
    background: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FECACA',
    borderRadius: 12,
    padding: '11px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,

  // Close button (rounded square, Avelon style)
  btnClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    color: '#64748B',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    fontSize: 16,
  } as CSSProperties,

  // Card section inside drawer
  section: {
    background: '#FFFFFF',
    borderRadius: 16,
    border: '1px solid #E2E8F0',
    padding: '20px 24px',
    marginBottom: 16,
  } as CSSProperties,

  // Divider
  divider: {
    height: 1,
    background: '#E2E8F0',
    margin: '20px 0',
  } as CSSProperties,

  // Specimen chip (dark pill, legacy style)
  specimenChip: {
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    border: '2px solid transparent',
  } as CSSProperties,
  specimenChipActive: {
    background: '#4F46E5',
    color: '#FFFFFF',
    border: '2px solid #4F46E5',
  } as CSSProperties,
  specimenChipInactive: {
    background: '#F1F5F9',
    color: '#475569',
    border: '2px solid #E2E8F0',
  } as CSSProperties,

  // Toggle/Switch label row
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: '#F8FAFC',
    borderRadius: 10,
    border: '1px solid #E2E8F0',
    marginBottom: 8,
  } as CSSProperties,

  // Locked/alert banner (de-ambered → indigo, zero-orange rule)
  lockedBanner: {
    background: '#EEF2FF',
    border: '1px solid #C7D2FE',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 13,
    color: '#3730A3',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
} as const;
