import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import OolongLogo from '../assets/Oolong.png';

const WORKER_LINKS = [
  { to: '/worker/dashboard', label: 'Dashboard',  icon: '⊞' },
  { to: '/worker/sales',     label: 'Log Sales',   icon: '☕' },
  { to: '/worker/inventory', label: 'Inventory',   icon: '📦' },
];

const OWNER_LINKS = [
  { to: '/owner/dashboard',  label: 'Dashboard',       icon: '⊞' },
  { to: '/worker/inventory', label: 'Inventory',        icon: '📦' },
  { to: '/owner/reorders',   label: 'Reorders',         icon: '🛒' },
  { to: '/owner/assistant',  label: 'Smart Assistant',  icon: '✦'  },
  { to: '/owner/audit',      label: 'Audit Log',        icon: '📋' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = user?.role === 'owner' ? OWNER_LINKS : WORKER_LINKS;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        {/* Cream logo strip — echoes the login card's left panel */}
        <div className="sidebar-logo-area">
          <img src={OolongLogo} alt="Oolong" />
        </div>

        <div className="sidebar-role">{user?.role}</div>

        <div className="sidebar-nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span>{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.username}</div>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      <main className="main-content">{children}</main>
    </div>
  );
}
