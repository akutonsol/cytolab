'use client';

import { useState } from 'react';
import {
  LayoutDashboard, Microscope, FileText, BarChart3,
  Search, Bell, Menu, X,
} from 'lucide-react';

// Premium CYTOLAB marketing navigation — Apple/Stripe/Linear feel.
// Standalone (not the app nav). Red primary, kept zero-orange: the avatar
// gradient uses a red→dark-red ramp (#E53A34 → #B71C1C) instead of the coral
// #FF6A5C, whose interpolation would land in the orange-detector range.

const NAV_ITEMS = [
  { label: 'Dashboard', Icon: LayoutDashboard },
  { label: 'Cases', Icon: Microscope },
  { label: 'Reports', Icon: FileText },
  { label: 'Analytics', Icon: BarChart3 },
];

export function PremiumNav() {
  const [active, setActive] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="pnav" aria-label="Primary">
      <style>{PNAV_CSS}</style>

      <div className="pnav-inner">
        {/* Left — logo */}
        <a className="pnav-logo" href="#">
          <span className="pnav-logo-mark">
            <Microscope size={18} strokeWidth={1.8} />
          </span>
          <span className="pnav-logo-text">
            <span className="pnav-logo-name">CYTOLAB</span>
            <span className="pnav-logo-sub">AI Pathology Platform</span>
          </span>
        </a>

        {/* Center — floating pill */}
        <div className="pnav-pill">
          {NAV_ITEMS.map(({ label, Icon }) => (
            <button
              key={label}
              className={`pnav-item ${active === label ? 'is-active' : ''}`}
              onClick={() => setActive(label)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Right — search, notification, avatar, CTA */}
        <div className="pnav-right">
          <label className="pnav-search">
            <Search size={18} strokeWidth={1.8} />
            <input placeholder="Search cases, patients…" aria-label="Search" />
          </label>

          <button className="pnav-icon-btn" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
            <span className="pnav-badge" />
          </button>

          <button className="pnav-avatar" aria-label="Account">
            NC
            <span className="pnav-online" />
          </button>

          <button className="pnav-cta">Request Demo</button>

          <button
            className="pnav-burger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={20} strokeWidth={1.8} /> : <Menu size={20} strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown (below 1200px) */}
      {menuOpen && (
        <div className="pnav-mobile">
          {NAV_ITEMS.map(({ label, Icon }) => (
            <button
              key={label}
              className={`pnav-mobile-item ${active === label ? 'is-active' : ''}`}
              onClick={() => { setActive(label); setMenuOpen(false); }}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

const PNAV_CSS = `
  .pnav {
    --primary: #E53A34;
    --surface: #FAFBFD;
    --text: #101828;
    --muted: #667085;
    --radius: 16px;
    --radius-pill: 999px;
    --spring: cubic-bezier(.22,.8,.2,1);
    --t: transform .35s var(--spring), background .35s var(--spring), box-shadow .35s var(--spring), color .35s var(--spring);

    position: fixed; inset: 0 0 auto 0; z-index: 100;
    height: 88px;
    background: rgba(255,255,255,.82);
    -webkit-backdrop-filter: blur(30px);
    backdrop-filter: blur(30px);
    border-bottom: 1px solid rgba(15,23,42,.05);
    box-shadow: 0 8px 40px rgba(15,23,42,.04);
    opacity: 0;
    transform: translateY(-20px);
    animation: pnav-in .8s var(--spring) forwards;
    font-family: Geist, ui-sans-serif, system-ui, sans-serif;
  }
  @keyframes pnav-in { to { opacity: 1; transform: translateY(0); } }

  .pnav-inner {
    max-width: 1680px; margin: auto; height: 100%;
    padding: 0 56px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px;
  }

  /* Logo */
  .pnav-logo { display: flex; align-items: center; gap: 16px; text-decoration: none; flex-shrink: 0; }
  .pnav-logo-mark {
    width: 32px; height: 32px; border-radius: 10px;
    display: grid; place-items: center; color: #fff;
    background: linear-gradient(180deg, #E53A34, #B71C1C);
    box-shadow: 0 8px 20px rgba(229,58,52,.28);
  }
  .pnav-logo-text { display: flex; flex-direction: column; line-height: 1.1; }
  .pnav-logo-name { font-size: 18px; font-weight: 700; letter-spacing: .02em; color: var(--text); }
  .pnav-logo-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* Center floating pill */
  .pnav-pill {
    display: flex; align-items: center; gap: 10px; padding: 8px;
    border-radius: var(--radius-pill);
    background: #fff;
    box-shadow: 0 20px 60px rgba(15,23,42,.05);
    border: 1px solid rgba(15,23,42,.05);
  }
  .pnav-item {
    display: inline-flex; align-items: center; gap: 8px;
    height: 48px; padding: 0 22px; border: none; cursor: pointer;
    border-radius: var(--radius);
    font-size: 15px; font-weight: 600; color: #465063;
    background: transparent;
    transition: var(--t);
  }
  .pnav-item:hover { background: #F6F8FC; color: var(--text); transform: translateY(-1px); }
  .pnav-item.is-active {
    background: var(--primary); color: #fff;
    box-shadow: 0 16px 40px rgba(229,58,52,.28);
    transform: none;
  }
  .pnav-item.is-active:hover { transform: translateY(-1px); box-shadow: 0 20px 48px rgba(229,58,52,.34); }

  /* Right cluster */
  .pnav-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }

  .pnav-search {
    display: flex; align-items: center; gap: 10px;
    width: 340px; height: 48px; padding: 0 18px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid rgba(15,23,42,.05);
    color: var(--muted);
    transition: var(--t);
  }
  .pnav-search:focus-within { background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.06); }
  .pnav-search input {
    border: none; outline: none; background: transparent; flex: 1;
    font-size: 15px; color: var(--text);
  }
  .pnav-search input::placeholder { color: var(--muted); }

  .pnav-icon-btn {
    position: relative; width: 44px; height: 44px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer;
    background: #fff; border: 1px solid rgba(15,23,42,.05); color: #465063;
    transition: var(--t);
  }
  .pnav-icon-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(15,23,42,.08); color: var(--text); }
  .pnav-badge {
    position: absolute; top: 9px; right: 9px; width: 8px; height: 8px;
    border-radius: 50%; background: var(--primary); border: 2px solid #fff;
  }

  .pnav-avatar {
    position: relative; width: 44px; height: 44px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer; border: none;
    color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .02em;
    background: linear-gradient(180deg, #E53A34, #B71C1C);
    box-shadow: 0 10px 26px rgba(229,58,52,.3);
    transition: var(--t);
  }
  .pnav-avatar:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(229,58,52,.4); }
  .pnav-online {
    position: absolute; bottom: 1px; right: 1px; width: 11px; height: 11px;
    border-radius: 50%; background: #22C55E; border: 2px solid #fff;
  }

  .pnav-cta {
    height: 48px; padding: 0 24px; border: none; cursor: pointer;
    border-radius: var(--radius-pill);
    background: var(--primary); color: #fff; font-size: 15px; font-weight: 600;
    box-shadow: 0 18px 50px rgba(229,58,52,.3);
    transition: var(--t);
  }
  .pnav-cta:hover { transform: translateY(-2px); box-shadow: 0 24px 70px rgba(229,58,52,.38); }

  /* Hamburger — hidden until mobile */
  .pnav-burger {
    display: none; width: 44px; height: 44px; border-radius: 12px;
    align-items: center; justify-content: center; cursor: pointer;
    background: #fff; border: 1px solid rgba(15,23,42,.05); color: var(--text);
    transition: var(--t);
  }
  .pnav-burger:hover { background: #F6F8FC; }

  /* Mobile dropdown */
  .pnav-mobile {
    display: flex; flex-direction: column; gap: 6px;
    padding: 12px 20px 20px;
    background: rgba(255,255,255,.96);
    -webkit-backdrop-filter: blur(30px); backdrop-filter: blur(30px);
    border-bottom: 1px solid rgba(15,23,42,.05);
  }
  .pnav-mobile-item {
    display: flex; align-items: center; gap: 12px;
    height: 52px; padding: 0 16px; border: none; cursor: pointer;
    border-radius: var(--radius);
    font-size: 16px; font-weight: 600; color: #465063; background: transparent;
    transition: var(--t);
  }
  .pnav-mobile-item:hover { background: #F6F8FC; color: var(--text); }
  .pnav-mobile-item.is-active { background: var(--primary); color: #fff; box-shadow: 0 12px 30px rgba(229,58,52,.28); }

  /* Below 1200px: collapse to hamburger; keep logo + CTA. */
  @media (max-width: 1200px) {
    .pnav-inner { padding: 0 24px; }
    .pnav-pill, .pnav-search, .pnav-icon-btn, .pnav-avatar { display: none; }
    .pnav-burger { display: inline-flex; }
  }
  @media (max-width: 560px) {
    .pnav-cta { display: none; }
  }
`;
