import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canCreateOffer, canApprove, canAccessAdmin, ROLE_LABELS } from '../../utils/roles';
import {
  LayoutDashboard, FileText, CheckSquare, ClipboardList, BarChart2, Settings, LogOut, ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const nav = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, always: true },
  { label: 'Requisitions', href: '/requisitions', icon: ClipboardList, always: true },
  { label: 'Offers', href: '/offers', icon: FileText, always: true },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare, check: canApprove },
  { label: 'Analytics', href: '/analytics', icon: BarChart2, always: true },
  { label: 'Admin', href: '/admin', icon: Settings, check: canAccessAdmin },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 bg-brand-700 flex flex-col">
        <div className="px-6 py-5 border-b border-brand-600">
          <span className="text-white text-xl font-bold tracking-tight">dotpe</span>
          <span className="text-brand-300 text-xs block mt-0.5">OfferOps</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ label, href, icon: Icon, always, check }) => {
            const visible = always || (check ? check(user.role) : true);
            if (!visible) return null;
            const active = href === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-brand-200 hover:bg-brand-600 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User menu */}
        <div className="p-3 border-t border-brand-600 relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-brand-200 hover:bg-brand-600 hover:text-white transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="truncate text-white text-sm font-medium">{user.firstName} {user.lastName}</div>
              <div className="truncate text-brand-300 text-xs">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
            <ChevronDown size={14} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
