'use client';

import type { ReactNode } from 'react';
import { DS } from '@/lib/drawer-styles';

/**
 * Premium drawer/modal chrome shared across every slide-out panel and modal.
 * Styling only — no logic. Pair with `<Drawer styles={{ header:{display:'none'},
 * body:{ background: DS.drawerBg, padding: DS.drawerPadding } }}>` (or the Modal
 * equivalent) and add `className="ds-form"` to the inner AntD Form.
 */
export function DrawerHeader({ title, subtitle, onClose, actions }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: actions ? 20 : 28 }}>
        <div>
          <h2 style={DS.drawerTitle}>{title}</h2>
          {subtitle != null && subtitle !== '' && <p style={DS.drawerSubtitle}>{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={DS.btnClose}>✕</button>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>{actions}</div>}
    </>
  );
}

// Scoped CSS that translates AntD form controls into the DS field language:
// solid white text inputs, dashed select/search inputs, indigo focus, Geist
// labels. Scoped to `.ds-form` so it never leaks to the rest of the app.
export function PremiumFormStyles() {
  return (
    <style>{`
      .ds-form .ant-form-item-label > label { font-family: Geist, sans-serif; font-weight: 600; color: #374151; font-size: 13px; }
      .ds-form .ant-input,
      .ds-form .ant-input-number,
      .ds-form .ant-input-affix-wrapper,
      .ds-form textarea.ant-input,
      .ds-form .ant-picker {
        background: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
      }
      .ds-form .ant-input-number { width: 100%; }
      .ds-form .ant-input:focus,
      .ds-form .ant-input-affix-wrapper-focused,
      .ds-form .ant-input-number-focused,
      .ds-form .ant-picker-focused {
        border-color: #4F46E5 !important;
        box-shadow: 0 0 0 3px rgba(79,70,229,0.08) !important;
      }
      /* Select / search inputs → dashed border language */
      .ds-form .ant-select .ant-select-selector {
        background: #F8FAFC !important;
        border: 1.5px dashed #CBD5E1 !important;
        border-radius: 12px !important;
      }
      .ds-form .ant-select-focused .ant-select-selector {
        border-color: #4F46E5 !important;
        border-style: solid !important;
        box-shadow: 0 0 0 3px rgba(79,70,229,0.08) !important;
      }
    `}</style>
  );
}
