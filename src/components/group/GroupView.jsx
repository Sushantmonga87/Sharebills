import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Plus,
  Settings,
  Wallet,
  MessageSquare,
  Users,
  Copy,
  CircleDollarSign,
  X,
} from 'lucide-react';

import PrimaryNav from '../common/PrimaryNav';
import AddExpenseTab from './AddExpenseTab';
import BalancesTab from './BalancesTab';
import ExpensesTab from './ExpensesTab';
import MembersTab from './MembersTab';
import GroupRentPanel from './GroupRentPanel';
import ActiveDisputesPanel from '../common/ActiveDisputesPanel';
import ChatTab from './ChatTab';
import { calculateSettlements } from '../../utils/settlement';
import { formatCurrency } from '../../utils/currency';

export default function GroupView({
  group,
  initialTab = 'expenses',
  expenseDraft = null,
  onGroupTabChange,
  onActiveChatChange,
  unreadChatCount = 0,
  incomingChatMessage = null,
  onDismissIncomingChat,
  onMarkChatNotificationsRead,
  groups = [],
  expenses,
  monthlyRents = [],
  onSaveExpense,
  onCreateRent,
  onMarkRentPaid,
  onDeleteRent,
  onDeleteExpense,
  onRaiseExpenseDispute,
  onCancelExpenseDispute,
  onResolveExpenseDispute,
  onDeleteGroup,
  onUpdateGroup,
  onLeaveGroup,
  onSendNotification,
  users,
  currentUser,
  onBack,
  onNavigateDashboard,
  dashboardTab = 'groups',
  showToast,
}) {
  const activeTab = initialTab;
  const [rentPopupOpen, setRentPopupOpen] = useState(false);
  const [chatPreviewId, setChatPreviewId] = useState(null);

  const getUserName = (userId) => users.find((user) => user.id === userId)?.username || 'Unknown';
  const sortedExpenses = useMemo(
    () =>
      [...expenses].sort(
        (first, second) => new Date(second.createdAt) - new Date(first.createdAt)
      ),
    [expenses]
  );

  const { balances } = useMemo(
    () => calculateSettlements(expenses, group.members || []),
    [expenses, group.members]
  );
  const myBalance = balances[currentUser.id] || 0;
  const activeDisputes = useMemo(
    () => expenses.filter((expense) => expense.activeDisputeId),
    [expenses]
  );
  const unpaidRent = useMemo(
    () => monthlyRents
      .filter((rent) => (
        rent.groupId === group.id &&
        Number(rent.shares?.[currentUser.id]) > 0 &&
        !rent.payments?.[currentUser.id]?.paid
      ))
      .sort((first, second) => second.month.localeCompare(first.month))[0] || null,
    [monthlyRents, group.id, currentUser.id]
  );
  const totalRoomSpend = useMemo(
    () =>
      expenses
        .filter((e) => !e.isSettlement && e.category !== 'Settlement')
        .reduce((sum, e) => sum + (parseFloat(e.totalAmount) || 0), 0),
    [expenses]
  );

  useEffect(() => {
    window.history.pushState({ tab: activeTab }, '');

    const handleHardwareBack = (e) => {
      e.preventDefault();
      if (activeTab !== 'expenses') {
        onGroupTabChange?.('expenses');
      } else {
        onBack();
      }
    };

    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, [activeTab, onBack, onGroupTabChange]);

  useEffect(() => {
    onActiveChatChange?.(activeTab === 'chat' ? group.id : null);
    return () => onActiveChatChange?.(null);
  }, [activeTab, group.id, onActiveChatChange]);

  useEffect(() => {
    if (activeTab === 'chat') onMarkChatNotificationsRead?.(group.id);
  }, [activeTab, group.id, onMarkChatNotificationsRead]);

  useEffect(() => {
    if (!incomingChatMessage || incomingChatMessage.groupId !== group.id) return undefined;
    setChatPreviewId(incomingChatMessage.id);
    const timeout = window.setTimeout(() => setChatPreviewId(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [incomingChatMessage?.id, incomingChatMessage?.groupId, group.id]);

  const handleTabSelect = (tab) => {
    onGroupTabChange?.(tab);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white font-sans md:flex-row">

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* LIQUID GLASS HEADER */}
        <header className="group-view-header z-30 flex h-14 min-w-0 flex-shrink-0 items-center justify-between gap-1 border-b border-white/80 bg-white/75 px-2 sm:h-16 sm:gap-3 sm:px-5 backdrop-blur-2xl shadow-sm">
          {/* Left: Back + Group Identity */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 sm:mr-2">
            <button
              type="button"
              onClick={() => onNavigateDashboard(dashboardTab)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-white/80 hover:text-slate-900 sm:h-9 sm:w-9"
              title="Back to Dashboard"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={19} />
            </button>

            <div
              onClick={() => handleTabSelect('expenses')}
              className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 sm:gap-2.5"
              title="View Expenses"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-blue-600 to-blue-600 text-sm font-extrabold text-white shadow-sm sm:h-10 sm:w-10">
                {group.imageDataUrl ? (
                  <img src={group.imageDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (group.name || 'G').charAt(0).toUpperCase()
                )}
              </span>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <h1 className="text-sm sm:text-base leading-tight font-extrabold text-slate-900 truncate tracking-tight">
                  {group.name}
                </h1>
                <p className="text-xs leading-tight font-semibold text-slate-500 mt-0.5 truncate">
                  {group.members.length} members · {formatCurrency(totalRoomSpend, group.currency, 0)} spent
                </p>
              </div>
            </div>
          </div>

          {/* Right: Segmented Liquid Glass Tabs + Quick Add */}
          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <div className="group-view-tabbar flex items-center gap-0.5 rounded-2xl bg-slate-200/70 p-0.5 backdrop-blur-md sm:gap-1 sm:p-1">
              <button
                type="button"
                onClick={() => handleTabSelect('balances')}
                className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:gap-1.5 sm:px-3 ${
                  activeTab === 'balances'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Balances"
              >
                <Wallet size={18} />
                <span className="hidden sm:inline">Balances</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (chatPreviewId) onDismissIncomingChat?.();
                    setChatPreviewId(null);
                    handleTabSelect('chat');
                  }}
                  className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:gap-1.5 sm:px-3 ${
                    activeTab === 'chat'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={unreadChatCount > 0 && activeTab !== 'chat'
                    ? `Chat (${unreadChatCount} unread)`
                    : 'Chat'}
                  aria-label={unreadChatCount > 0 && activeTab !== 'chat'
                    ? `Chat, ${unreadChatCount} unread messages`
                    : 'Chat'}
                >
                  <span className="relative inline-flex">
                    <MessageSquare size={18} />
                    {unreadChatCount > 0 && activeTab !== 'chat' && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-600 shadow-sm"
                      />
                    )}
                  </span>
                  <span className="hidden sm:inline">Chat</span>
                </button>
                {chatPreviewId === incomingChatMessage?.id && activeTab !== 'chat' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="absolute left-1/2 top-full z-[60] mt-2 w-[min(18rem,calc(100vw-1.5rem))] -translate-x-1/2 animate-in slide-in-from-top-2 fade-in duration-200"
                  >
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_12px_36px_rgba(15,23,42,0.2)]">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-700">
                          {(incomingChatMessage.senderName || getUserName(incomingChatMessage.senderId) || 'R')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onDismissIncomingChat?.();
                            setChatPreviewId(null);
                            handleTabSelect('chat');
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[11px] font-extrabold text-slate-900">
                            {incomingChatMessage.senderName || getUserName(incomingChatMessage.senderId)}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-slate-600">
                            {incomingChatMessage.text?.trim() || (incomingChatMessage.attachmentName
                              ? `Sent ${incomingChatMessage.attachmentName}`
                              : 'Sent an attachment')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDismissIncomingChat?.();
                            setChatPreviewId(null);
                          }}
                          aria-label="Dismiss chat preview"
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] font-bold text-blue-700">Open chat</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleTabSelect('members')}
                className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:gap-1.5 sm:px-3 ${
                  activeTab === 'members'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Room Settings"
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleTabSelect('add')}
              className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-600 px-3.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:opacity-95"
            >
              <Plus size={14} />
              <span>Add Bill</span>
            </button>
          </div>
        </header>

        {/* MAIN VIEWPORT */}
        <main
          className={`relative min-w-0 min-h-0 flex-1 overscroll-y-contain ${
            activeTab === 'chat'
              ? 'flex flex-col overflow-hidden pb-0'
              : 'overflow-x-hidden overflow-y-auto pb-20 scrollbar-hide'
          }`}
        >
          {(activeTab === 'expenses' || !activeTab) && (
            <div className="mx-auto max-w-[1320px] p-3.5 sm:p-6 lg:p-8">
              <div className="grid grid-cols-12 gap-6 items-start">
                {/* Main Expense Ledger */}
                <div className="col-span-12 xl:col-span-8">
                  <ExpensesTab
                    expenses={sortedExpenses}
                    currency={group.currency}
                    currentUser={currentUser}
                    users={users}
                    getUserName={getUserName}
                    onDeleteExpense={onDeleteExpense}
                    onRaiseExpenseDispute={onRaiseExpenseDispute}
                    onCancelExpenseDispute={onCancelExpenseDispute}
                    onViewExpenseDispute={() => handleTabSelect('chat')}
                    showToast={showToast}
                  />
                </div>

                {/* Desktop Side Panel: Live Room Balances & Quick Info */}
                <aside className="sticky top-4 hidden self-start space-y-3 xl:col-span-4 xl:block">
                  <div className="liquid-glass rounded-2xl p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Your balance
                        </span>
                        <span
                          className={`mt-0.5 block truncate font-mono text-lg font-extrabold ${
                            myBalance > 0.01
                              ? 'text-emerald-600'
                              : myBalance < -0.01
                                ? 'text-rose-600'
                                : 'text-slate-900'
                          }`}
                        >
                          {myBalance > 0.01
                            ? `+${formatCurrency(myBalance, group.currency)}`
                            : myBalance < -0.01
                              ? `-${formatCurrency(Math.abs(myBalance), group.currency)}`
                              : formatCurrency(0, group.currency)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTabSelect('balances')}
                        className="flex-shrink-0 text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Settle up →
                      </button>
                    </div>
                  </div>

                  <div className="liquid-glass rounded-2xl p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        <Users size={13} className="text-blue-600" />
                        <span>Members · {group.members.length}</span>
                      </h3>
                      {group.inviteCode && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(group.inviteCode);
                            showToast?.('Invite code copied');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 hover:bg-white"
                        >
                          <Copy size={11} />
                          <span>{group.inviteCode}</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {group.members.slice(0, 4).map((mId) => {
                        const mNet = balances[mId] || 0;
                        return (
                          <div
                            key={mId}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate font-semibold text-slate-800">
                              {mId === currentUser.id ? 'You' : getUserName(mId)}
                            </span>
                            <span
                              className={`font-mono font-extrabold ${
                                mNet > 0.01
                                  ? 'text-emerald-600'
                                  : mNet < -0.01
                                    ? 'text-rose-600'
                                    : 'text-slate-400'
                              }`}
                            >
                              {mNet > 0.01
                                ? `+${formatCurrency(mNet, group.currency, 0)}`
                                : mNet < -0.01
                                  ? `-${formatCurrency(Math.abs(mNet), group.currency, 0)}`
                                  : formatCurrency(0, group.currency, 0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {group.members.length > 4 && (
                      <button
                        type="button"
                        onClick={() => handleTabSelect('members')}
                        className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline"
                      >
                        View all {group.members.length} members
                      </button>
                    )}
                  </div>

                  <GroupRentPanel
                    group={group}
                    rentRecords={monthlyRents}
                    currentUser={currentUser}
                    users={users}
                    onCreateRent={onCreateRent}
                    onMarkRentPaid={onMarkRentPaid}
                    onDeleteRent={onDeleteRent}
                    showToast={showToast}
                    compact
                    sidebar
                  />
                  {activeDisputes.length > 0 && (
                    <ActiveDisputesPanel
                      disputes={activeDisputes}
                      groups={[group]}
                      onOpenDispute={() => handleTabSelect('chat')}
                      compact
                    />
                  )}
                </aside>
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <AddExpenseTab
              key={group.members.join(':')}
              group={group}
              initialExpenseDraft={expenseDraft}
              currentUser={currentUser}
              users={users}
              getUserName={getUserName}
              onSaveExpense={onSaveExpense}
              onSendNotification={onSendNotification}
              onSaved={() => handleTabSelect('expenses')}
              showToast={showToast}
            />
          )}

          {activeTab === 'balances' && (
            <BalancesTab
              expenses={expenses}
              group={group}
              currentUser={currentUser}
              getUserName={getUserName}
              users={users}
              onSaveExpense={onSaveExpense}
              onSendNotification={onSendNotification}
              showToast={showToast}
            />
          )}

          {activeTab === 'chat' && (
            <ChatTab
              group={group}
              groups={groups}
              currentUser={currentUser}
              users={users}
              expenses={expenses}
              onSendNotification={onSendNotification}
              onResolveExpenseDispute={onResolveExpenseDispute}
              showToast={showToast}
            />
          )}

          {activeTab === 'members' && (
            <MembersTab
              group={group}
              users={users}
              currentUser={currentUser}
              expenses={expenses}
              monthlyRents={monthlyRents}
              onCreateRent={onCreateRent}
              onMarkRentPaid={onMarkRentPaid}
              onDeleteRent={onDeleteRent}
              onUpdateGroup={onUpdateGroup}
              onDeleteGroup={onDeleteGroup}
              onLeaveGroup={onLeaveGroup}
              showToast={showToast}
            />
          )}
        </main>

        {/* Mobile Floating Liquid Glass Add Expense Button */}
        {(activeTab === 'expenses' || !activeTab) && (
          <>
            {unpaidRent && (
              <button
                type="button"
                onClick={() => setRentPopupOpen(true)}
                aria-label={`View unpaid rent for ${group.name}`}
                className="fixed bottom-5 left-5 z-30 flex h-12 items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-100 px-4 text-xs font-bold text-amber-800 shadow-lg shadow-amber-900/10 transition-transform active:scale-95 sm:hidden"
                title="Rent is due"
              >
                <CircleDollarSign size={17} />
                <span>Rent</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTabSelect('add')}
              aria-label="Add expense"
              className="fixed bottom-5 right-5 z-30 flex h-12 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-600 px-4 text-xs font-bold text-white shadow-lg shadow-blue-600/30 border border-white/25 transition-transform active:scale-95 sm:hidden"
              title="Add Expense"
            >
              <Plus size={17} strokeWidth={2.5} />
              <span>Add Bill</span>
            </button>
          </>
        )}
      </div>

      {rentPopupOpen && unpaidRent &&
        createPortal(
          <div
            className="fixed inset-0 z-[155] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
            onClick={() => setRentPopupOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="group-rent-popup-title"
              className="app-modal-surface w-full max-w-md rounded-[28px] border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="mb-3 flex items-center justify-between gap-3 px-1">
                <h2 id="group-rent-popup-title" className="text-base font-bold text-slate-900">
                  Rent details
                </h2>
                <button
                  type="button"
                  onClick={() => setRentPopupOpen(false)}
                  aria-label="Close rent details"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X size={17} />
                </button>
              </header>
              <GroupRentPanel
                key={unpaidRent.id}
                group={group}
                rentRecords={monthlyRents}
                currentUser={currentUser}
                users={users}
                onCreateRent={onCreateRent}
                onMarkRentPaid={onMarkRentPaid}
                onDeleteRent={onDeleteRent}
                showToast={showToast}
                initialMonth={unpaidRent.month}
                compact
              />
            </section>
          </div>,
          document.body
        )}

      <PrimaryNav
        activeItem={dashboardTab}
        onNavigate={onNavigateDashboard}
        user={currentUser}
        desktopOnly
      />
    </div>
  );
}