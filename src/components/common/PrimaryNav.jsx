import { useState } from 'react';
import {
  ArrowLeftRight,
  LayoutGrid,
  LogOut,
  Download,
  PieChart,
  Plus,
  ReceiptIndianRupee,
  UserPlus,
  User,
  Users,
} from 'lucide-react';
import sharebillsIcon from '../../assets/sharebills-icon.webp';

const ITEMS = [
  { id: 'groups', label: 'Overview', mobileLabel: 'Overview', icon: LayoutGrid },
  { id: 'spaces', label: 'Spaces', mobileLabel: 'Spaces', icon: Users },
  { id: 'transactions', label: 'Transactions', mobileLabel: 'Transactions', icon: ArrowLeftRight },
  { id: 'monthly', label: 'Analytics', mobileLabel: 'Monthly', icon: PieChart },
  { id: 'profile', label: 'Profile', mobileLabel: 'Profile', icon: User },
];

const MOBILE_ITEMS = ITEMS.filter(({ id }) => id !== 'spaces');

export default function PrimaryNav({
  activeItem,
  onNavigate,
  onQuickAction,
  onCreateGroup,
  onJoinGroup,
  onLogout,
  user,
  unreadSpacesCount = 0,
  onInstallApp,
  isAppInstalled = false,
  desktopOnly = false,
  mobilePreview = false,
}) {
  const [isSpaceActionsOpen, setIsSpaceActionsOpen] = useState(false);

  return (
    <>
      {/* ===================================================================== */}
      {/* MOBILE NATIVE LIQUID GLASS DOCK (< md)                                */}
      {/* ===================================================================== */}
      {!desktopOnly && (
        <>
          {activeItem === 'groups' && (onCreateGroup || onJoinGroup) && (
            <div className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[51] ${mobilePreview ? '' : 'md:hidden'}`}>
              {isSpaceActionsOpen && (
                <div
                  id="mobile-space-actions"
                  className="mb-3 flex min-w-[11rem] flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-xl"
                >
                  {onJoinGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSpaceActionsOpen(false);
                        onJoinGroup();
                      }}
                      className="flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <UserPlus size={17} className="text-blue-600" />
                      Join a space
                    </button>
                  )}
                  {onCreateGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSpaceActionsOpen(false);
                        onCreateGroup();
                      }}
                      className="flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <Plus size={18} className="text-blue-600" />
                      Create a space
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsSpaceActionsOpen((open) => !open)}
                aria-label={isSpaceActionsOpen ? 'Close space actions' : 'Join or create a space'}
                aria-expanded={isSpaceActionsOpen}
                aria-controls="mobile-space-actions"
                className="ml-auto flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-700/30 transition-transform active:scale-95"
              >
                <Plus size={22} strokeWidth={2.75} className={isSpaceActionsOpen ? 'rotate-45 transition-transform' : 'transition-transform'} />
              </button>
            </div>
          )}

          <nav
            aria-label="Mobile navigation"
            className={`fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 pointer-events-none ${mobilePreview ? '' : 'md:hidden'}`}
          >
            <div className="liquid-nav-dock pointer-events-auto mx-auto grid h-16 w-full max-w-[25rem] grid-cols-5 items-center gap-0 rounded-[28px] p-1.5 shadow-xl bg-white/80 backdrop-blur-xl border border-white/40">
            {/* Left 2 items: Overview & Transactions */}
            {MOBILE_ITEMS.slice(0, 2).map(({ id, mobileLabel, icon: Icon }) => {
              const isActive = activeItem === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setIsSpaceActionsOpen(false);
                    onNavigate(id);
                  }}
                  aria-label={mobileLabel}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex h-full min-w-0 items-center justify-center rounded-[22px] text-slate-700 transition-all duration-200 active:scale-95"
                >
                  <span
                    className={`relative inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
                      isActive
                        ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/30'
                        : 'hover:bg-slate-200/60 hover:text-slate-950'
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 3 : 2.5} />
                  </span>
                  <span className="sr-only">{mobileLabel}</span>
                </button>
              );
            })}

            {/* Center Quick-Add Action Button */}
            {onQuickAction && (
              <button
                type="button"
                onClick={onQuickAction}
                aria-label="Add expense"
                className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-tr from-slate-950 via-slate-900 to-blue-900 text-white shadow-lg shadow-slate-900/30 border border-white/30 transition-transform active:scale-90"
              >
                <ReceiptIndianRupee size={23} strokeWidth={2.5} />
              </button>
            )}

            {/* Right 2 items: Analytics & Profile */}
            {MOBILE_ITEMS.slice(2).map(({ id, mobileLabel, icon: Icon }) => {
              const isActive = activeItem === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setIsSpaceActionsOpen(false);
                    onNavigate(id);
                  }}
                  aria-label={mobileLabel}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex h-full min-w-0 items-center justify-center rounded-[22px] text-slate-700 transition-all duration-200 active:scale-95"
                >
                  <span
                    className={`relative inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
                      isActive
                        ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/30'
                        : 'hover:bg-slate-200/60 hover:text-slate-950'
                    }`}
                  >
                    {id === 'profile' ? (
                      <span className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ${isActive ? 'bg-white text-blue-700' : 'bg-gradient-to-tr from-blue-600 to-blue-700 text-white'} text-[11px] font-extrabold ring-2 ring-white/90 shadow-sm`}>
                        {user?.photoDataUrl ? (
                          <img
                            src={user.photoDataUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (user?.username || 'U').charAt(0).toUpperCase()
                        )}
                      </span>
                    ) : (
                      <Icon size={20} strokeWidth={isActive ? 3 : 2.5} />
                    )}
                  </span>
                  <span className="sr-only">{mobileLabel}</span>
                </button>
              );
            })}
            </div>
          </nav>
        </>
      )}

      {/* ===================================================================== */}
      {/* DESKTOP LIQUID GLASS SIDEBAR (md+)                                    */}
      {/* ===================================================================== */}
      <aside
        aria-label="Desktop navigation"
        className={mobilePreview ? 'hidden' : 'hidden md:flex md:order-first md:h-full md:w-60 lg:w-64 md:flex-shrink-0 md:flex-col md:justify-between bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-[4px_0_24px_rgba(15,23,42,0.03)] px-4 py-6 z-30'}
      >
        <div>
          {/* Brand Header */}
          <button
            type="button"
            onClick={() => onNavigate('groups')}
            aria-label="Go to Sharebills home"
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-opacity hover:opacity-90"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm border border-slate-200/70">
              <img
                src={sharebillsIcon}
                alt="Sharebills"
                className="h-full w-full rounded-full object-cover"
              />
            </span>
            <div>
              <span className="block text-base font-extrabold tracking-tight text-slate-900 leading-none">
                Sharebills
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-blue-600 leading-none">
                Shared Ledger
              </span>
            </div>
          </button>

          <div className="mt-7 mb-2 px-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Workspace
            </span>
          </div>

          {/* Desktop Navigation Items */}
          <div className="space-y-1.5">
            {ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeItem === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'text-slate-600 font-semibold hover:bg-white/80 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-600'}
                  />
                  <span>{label}</span>
                  {id === 'spaces' && unreadSpacesCount > 0 && (
                    <span
                      aria-label={`${unreadSpacesCount} unread items`}
                      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-extrabold leading-none text-white shadow-sm"
                    >
                      {unreadSpacesCount > 99 ? '99+' : unreadSpacesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop User Footer Card */}
        <div className="space-y-2 border-t border-slate-200/60 pt-4">
          {!isAppInstalled && onInstallApp && (
            <button
              type="button"
              onClick={onInstallApp}
              className="desktop-install-card flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-blue-50 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:from-blue-100 hover:to-blue-100 hover:shadow-md active:translate-y-0"
            >
              <span className="desktop-install-card__icon flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <Download size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="desktop-install-card__title block text-xs font-bold text-slate-900">Install Sharebills</span>
                <span className="desktop-install-card__description mt-0.5 block text-[10px] text-slate-500">
                  Add the app to your device
                </span>
              </span>
            </button>
          )}
          {user && (
            <div
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-3 rounded-2xl bg-white/70 border border-white/90 p-2.5 shadow-sm hover:bg-white cursor-pointer transition-all"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
                {user.photoDataUrl ? (
                  <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user.username || 'U').charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{user.username}</p>
                <p className="truncate text-[11px] text-slate-500 font-mono">
                  {user.upiId || user.email || 'Set up UPI'}
                </p>
              </div>
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="flex h-10 w-full items-center gap-2.5 rounded-2xl border border-rose-200/80 bg-rose-50 px-3.5 text-xs font-bold text-rose-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 hover:shadow-md active:translate-y-0"
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}