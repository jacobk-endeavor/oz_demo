import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import {
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ArrowRightStartOnRectangleIcon,
  IdentificationIcon,
  CurrencyDollarIcon,
  PlayCircleIcon,
  PhoneIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  EnvelopeIcon,
  InboxIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/solid';

const AE_VISIBLE_PATHS = new Set(['/companies', '/sales-reps', '/deals', '/settings']);

const topLevelItems = [
  { to: '/companies', label: 'Companies', icon: BuildingOffice2Icon },
  { to: '/leads', label: 'Leads', icon: ClipboardDocumentListIcon },
  { to: '/sales-reps', label: 'Sales Reps', icon: IdentificationIcon },
  { to: '/deals', label: 'Deals', icon: CurrencyDollarIcon },
  { to: '/meeting-recordings', label: 'Recordings', icon: PlayCircleIcon, adminOnly: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDaysIcon, adminOnly: true },
  { to: '/dialer', label: 'Dialer', icon: PhoneIcon },
  { to: '/emails', label: 'Emails', icon: EnvelopeIcon, adminOnly: true },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Cog6ToothIcon },
];

export default function Layout() {
  const { user, role, isAdmin, logout, canAccessLeads } = useAuth();
  const location = useLocation();
  const routeAnimationKey = location.pathname.split('/')[1] || 'root';
  const isLeadsPage = location.pathname.startsWith('/leads');
  const isChatPage = location.pathname.startsWith('/chat');
  const useCompactSidebar = isLeadsPage || isChatPage;
  const isAe = role === 'ae';
  const isBdr = role === 'bdr';
  const isBasic = role === 'basic';
  const isExec = role === 'exec';
  const visibleTopLevelItems = topLevelItems.filter((item) => {
    if (isBasic) {
      return item.to === '/settings';
    }

    if (isAe) {
      return AE_VISIBLE_PATHS.has(item.to) || (canAccessLeads && item.to === '/leads');
    }

    if (isBdr) {
      return item.to === '/leads' || item.to === '/settings' || item.to === '/dialer';
    }

    if (item.adminOnly) return isAdmin;
    if (item.privileged) return isAdmin || isExec;
    return true;
  });

  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[url('/background.jpg')] bg-cover bg-center bg-no-repeat" />

      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <nav
          className={[
            'z-20 min-h-screen border-r border-white/5 bg-transparent transition-[width] duration-200',
            useCompactSidebar ? 'w-20' : 'w-60',
          ].join(' ')}
        >
          <div className="flex min-h-screen flex-col">
            <div className={useCompactSidebar ? 'px-2' : 'px-3'}>
              <div
                className={`flex items-center px-2 pt-5 ${useCompactSidebar ? 'justify-center pb-5' : 'gap-2 pb-6'}`}
              >
                {useCompactSidebar ? (
                  <img src="/endeavor-signet-zinc.png" alt="Endeavor" className="w-9 h-auto" />
                ) : (
                  <img src="/endeavor-logo.svg" alt="Endeavor" className="h-8" />
                )}
              </div>

              <NavLink
                to="/chat"
                title="New chat"
                className={[
                  'mb-4 flex w-full items-center rounded-xl bg-white/15 py-1.5 text-sm font-semibold text-white shadow-lg border border-white/30 backdrop-blur-sm transition-all hover:bg-white/25',
                  useCompactSidebar ? 'justify-center px-2' : 'justify-center gap-2 px-4',
                ].join(' ')}
              >
                <PlusIcon className="h-4 w-4" />
                {!useCompactSidebar && 'New chat'}
              </NavLink>

              <div className="flex flex-col gap-2">
                {visibleTopLevelItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      [
                        'flex w-full items-center rounded-lg p-2 text-sm font-medium transition-colors',
                        useCompactSidebar ? 'justify-center' : 'gap-2',
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white',
                      ].join(' ')
                    }
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0 text-zinc-300/80" />
                    {!useCompactSidebar && <span className="ml-1 truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2 border-t border-zinc-700 p-3">
              {!useCompactSidebar && <p className="truncate px-2 text-xs text-zinc-400">{user}</p>}
              <button
                onClick={logout}
                title="Sign out"
                className={[
                  'flex w-full items-center rounded-lg px-2 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10',
                  useCompactSidebar ? 'justify-center' : 'justify-start gap-2',
                ].join(' ')}
              >
                <ArrowRightStartOnRectangleIcon className="h-5 w-5 flex-shrink-0 text-zinc-300/80" />
                {!useCompactSidebar && <span className="ml-2">Sign out</span>}
              </button>
            </div>
          </div>
        </nav>

        <main className="relative flex-1 overflow-hidden p-3">
          <div className="h-full w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm">
            <div
              key={routeAnimationKey}
              id="main-scroll"
              className="h-full overflow-auto p-4 md:p-6 animate-fade-in no-scrollbar"
            >
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
