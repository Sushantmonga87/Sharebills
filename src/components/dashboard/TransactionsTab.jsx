import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Calendar, ChevronDown, CreditCard, Download, Receipt, User, Users, X } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import ExpenseLongPressActions from '../group/ExpenseLongPressActions';
import RentSettlementsTab from './RentSettlementsTab';
import EmptyState from '../common/EmptyState';

const getExpenseDate = (expense) => {
  const value = expense.date || expense.createdAt;
  if (value?.toDate) return value.toDate();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateGroupLabel = (date) => {
  if (!date) return 'Date unavailable';
  const today = new Date();
  const isSameDay = (first, second) => (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
  if (isSameDay(date, today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
};

export default function TransactionsTab({
  transactions,
  groups,
  user,
  users = [],
  getUserName,
  preview = false,
  onSeeAll,
  ledgerFilter = 'all',
  onLedgerFilterChange,
  onOpenExport,
  onDeleteExpense,
  onRaiseExpenseDispute,
  onCancelExpenseDispute,
  showToast,
  mobilePreview = false,
  rents = [],
  settlements = [],
  disputes = [],
  onOpenGroup,
  onOpenDispute,
}) {
  const [detailExpense, setDetailExpense] = useState(null);
  const [disputesOpen, setDisputesOpen] = useState(false);
  const visibleTransactions = preview ? transactions.slice(0, 4) : transactions;
  const transactionGroups = [];
  const groupedByDate = new Map();

  visibleTransactions.forEach((expense) => {
    const date = getExpenseDate(expense);
    const key = date
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      : 'unknown';
    let dateGroup = groupedByDate.get(key);
    if (!dateGroup) {
      dateGroup = { key, date, label: getDateGroupLabel(date), transactions: [] };
      groupedByDate.set(key, dateGroup);
      transactionGroups.push(dateGroup);
    }
    dateGroup.transactions.push(expense);
  });

  useEffect(() => {
    if (!detailExpense && !disputesOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDetailExpense(null);
        setDisputesOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailExpense, disputesOpen]);

  return (
    <section>
      {!preview && (
        <div className="page-heading-bar transaction-heading-bar mb-4 flex items-center justify-between gap-2.5">
          <div className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
              {user?.photoDataUrl ? (
                <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (user?.username || 'U').charAt(0).toUpperCase()
              )}
            </span>
            <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">
              Transactions
            </h1>
          </div>
          <div className="flex items-center gap-2">
          <div className={`page-heading-controls hidden items-center gap-0.5 rounded-full p-1 ${mobilePreview ? '' : 'md:flex'}`}>
            {[
              { id: 'all', label: 'All' },
              { id: 'mine', label: 'Paid by Me' },
              { id: 'settlements', label: 'Settlements' },
              { id: 'dues', label: 'Rent & Dues' },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onLedgerFilterChange?.(filter.id)}
                aria-pressed={ledgerFilter === filter.id}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                  ledgerFilter === filter.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className={`page-heading-controls relative flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold text-slate-700 ${mobilePreview ? '' : 'md:hidden'}`}>
            <span className="pointer-events-none">{ledgerFilter === 'mine' ? 'Paid by Me' : ledgerFilter === 'settlements' ? 'Settlements' : ledgerFilter === 'dues' ? 'Rent & Dues' : 'All'}</span>
            <ChevronDown size={14} className="pointer-events-none text-slate-400" />
            <select
              aria-label="Filter transactions"
              value={ledgerFilter}
              onChange={(event) => onLedgerFilterChange?.(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="all">All</option>
              <option value="mine">Paid by Me</option>
              <option value="settlements">Settlements</option>
              <option value="dues">Rent &amp; Dues</option>
            </select>
          </label>
          <button type="button" onClick={onOpenExport} aria-label="Export transactions" title="Export transactions" className="page-heading-controls flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-blue-600">
            <Download size={16} />
          </button>
          </div>
        </div>
      )}
      {preview && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
          <h2 className="text-base font-extrabold tracking-tight text-slate-900">
            Recent Ledger Activity
          </h2>
          {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded-xl px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50"
          >
            See all transactions
            <span aria-hidden="true"> →</span>
          </button>
          )}
        </div>
      )}

      {!preview && (
        <button
          type="button"
          onClick={() => setDisputesOpen(true)}
          aria-haspopup="dialog"
          className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-[70] flex h-11 items-center gap-2 rounded-full border border-amber-200 bg-white/95 px-4 text-xs font-bold text-amber-800 shadow-lg shadow-amber-900/10 backdrop-blur transition-transform ${
            mobilePreview ? 'dispute-nudge' : 'dispute-nudge md:hidden'
          }`}
        >
          <AlertTriangle size={15} />
          Disputes
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold">
            {disputes.length}
          </span>
        </button>
      )}

      <div className={preview ? '' : 'grid grid-cols-1 gap-6 md:grid-cols-12'}>
        <div
          className={
            preview
              ? ''
              : `min-w-0 md:col-span-8 ${
                  mobilePreview ? '' : 'liquid-glass rounded-3xl p-5'
                }`
          }
        >
      {ledgerFilter === 'dues' ? (
        <RentSettlementsTab
          rents={rents}
          settlements={settlements}
          disputes={[]}
          groups={groups}
          user={user}
          getUserName={getUserName}
          onOpenGroup={onOpenGroup}
          onOpenDispute={onOpenDispute}
          mobilePreview={mobilePreview}
          showSettlements={false}
          showDisputes={false}
        />
      ) : visibleTransactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Your shared bills and payments will appear here."
        />
      ) : (
        <div className="space-y-5">
          {transactionGroups.map((dateGroup) => (
            <section key={dateGroup.key} aria-label={dateGroup.label}>
              <h3 className="mb-1.5 border-b border-slate-200/70 pb-2 text-xs font-bold text-slate-500">
                {dateGroup.label}
              </h3>
              <div className="divide-y divide-slate-200/60">
                {dateGroup.transactions.map((expense) => {
                  const group = groups.find((item) => item.id === expense.groupId);
                  const total = parseFloat(expense.totalAmount) || 0;
                  const payerName = expense.paidBy === user.id
                    ? 'You'
                    : getUserName(expense.paidBy) || 'Roommate';

                  return (
                    <ExpenseLongPressActions
                      key={expense.id}
                      expenseTitle={expense.title}
                      canDelete={expense.createdBy === user.id || expense.paidBy === user.id}
                      canDispute={Boolean(
                        group
                        && group.members?.includes(user.id)
                        && !expense.isSettlement
                        && expense.category !== 'Settlement'
                        && !expense.activeDisputeId
                      )}
                      canCancelDispute={Boolean(
                        expense.activeDisputeId
                        && (!expense.activeDisputeBy || expense.activeDisputeBy === user.id)
                      )}
                      onDelete={() => onDeleteExpense?.(expense.id)}
                      onRaiseDispute={(message) => onRaiseExpenseDispute?.(expense, message)}
                      onCancelDispute={() => onCancelExpenseDispute?.(expense)}
                      showToast={showToast}
                    >
                    <button
                      key={expense.id}
                      type="button"
                      onClick={() => setDetailExpense(expense)}
                      className="transaction-item flex w-full items-center justify-between gap-4 px-1 py-3 text-left transition-colors hover:bg-white/70"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
                          <Receipt size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{expense.title}</span>
                          {expense.activeDisputeId && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle size={11} />
                              Dispute open
                            </span>
                          )}
                          {expense.wasEdited && (
                            <span className="mt-1 inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              Edited
                            </span>
                          )}
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {payerName} · {group?.name || 'Room'}
                          </span>
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-right font-mono text-sm font-bold text-slate-900">
                        {formatCurrency(total, group?.currency)}
                      </span>
                    </button>
                    </ExpenseLongPressActions>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
        </div>

        {!preview && !mobilePreview && (
          <aside className="hidden md:sticky md:top-4 md:col-span-4 md:block md:self-start">
            <section className="liquid-glass rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Active disputes</h2>
                  <p className="text-[11px] text-slate-500">Open disputes across your spaces</p>
                </div>
                <span className="rounded-lg bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">{disputes.length}</span>
              </div>
              {disputes.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {disputes.map((expense) => {
                    const group = groups.find((item) => item.id === expense.groupId);
                    return (
                      <button
                        key={expense.id}
                        type="button"
                        onClick={() => onOpenDispute?.(expense)}
                        className="dues-list-row mx-1 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-amber-50/70"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                            <AlertTriangle size={17} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">{expense.title || 'Expense'}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {group?.name || 'Group'}{expense.activeDisputeByName ? ` · raised by ${expense.activeDisputeByName}` : ''}
                            </span>
                          </span>
                        </span>
                        <span className="flex-shrink-0 font-mono text-xs font-bold text-slate-800">
                          {formatCurrency(expense.totalAmount, group?.currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <AlertTriangle size={20} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700">No active disputes</p>
                  <p className="mt-1 text-[11px] text-slate-500">New disputes will appear here.</p>
                </div>
              )}
            </section>
          </aside>
        )}
      </div>

      {disputesOpen && createPortal(
        <div
          className="app-modal-overlay fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDisputesOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-disputes-title"
            className="app-modal-surface max-h-[min(80dvh,42rem)] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <h2 id="transaction-disputes-title" className="text-sm font-extrabold text-slate-900">
                Disputes
              </h2>
              <button
                type="button"
                onClick={() => setDisputesOpen(false)}
                aria-label="Close disputes"
                className="popup-close-button flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-600 text-white transition-colors hover:border-rose-700 hover:bg-rose-700"
              >
                <X size={16} />
              </button>
            </div>
            {disputes.length > 0 ? (
              <RentSettlementsTab
                rents={[]}
                settlements={[]}
                disputes={disputes}
                groups={groups}
                user={user}
                getUserName={getUserName}
                onOpenGroup={onOpenGroup}
                onOpenDispute={(expense) => {
                  setDisputesOpen(false);
                  onOpenDispute?.(expense);
                }}
                preview
                showSettlements={false}
              />
            ) : (
              <div className="py-10 text-center">
                <AlertTriangle size={22} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-bold text-slate-700">No active disputes</p>
                <p className="mt-1 text-xs text-slate-500">Open disputes across your spaces will appear here.</p>
              </div>
            )}
          </section>
        </div>,
        document.body
      )}

      {detailExpense && createPortal(
        <div
          className="app-modal-overlay fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onClick={() => setDetailExpense(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-detail-title"
            onClick={(event) => event.stopPropagation()}
            className="app-modal-surface max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
          >
            {(() => {
              const group = groups.find((item) => item.id === detailExpense.groupId);
              const currency = group?.currency;
              const splits = Object.entries(detailExpense.splits || {}).filter(([, amount]) => parseFloat(amount) > 0);
              const payerName = detailExpense.paidBy === user.id
                ? 'You'
                : getUserName(detailExpense.paidBy) || 'Roommate';

              return (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600"><Receipt size={18} /></span>
                      <span className="min-w-0">
                        <h3 id="transaction-detail-title" className="truncate text-sm font-bold text-slate-900">{detailExpense.title}</h3>
                        <span className="block truncate text-xs text-slate-500">{detailExpense.category || 'General'} · {group?.name || 'Room'}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailExpense(null)}
                      aria-label="Close transaction details"
                      className="popup-close-button flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-600 text-white transition-colors hover:border-rose-700 hover:bg-rose-700"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-center">
                    <span className="block text-[10px] font-semibold uppercase text-slate-500">Total bill</span>
                    <span className="mt-1 block font-mono text-2xl font-bold text-slate-900">{formatCurrency(detailExpense.totalAmount, currency)}</span>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><User size={12} />Paid by</span>
                      <span className="block truncate font-bold text-slate-900">{payerName}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><CreditCard size={12} />Method</span>
                      <span className="block truncate font-bold text-slate-900">{detailExpense.paymentMethod || 'UPI'}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><Calendar size={12} />Date</span>
                      <span className="block truncate font-bold text-slate-900">{detailExpense.date || getDateGroupLabel(getExpenseDate(detailExpense))}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><Users size={12} />Split</span>
                      <span className="block truncate font-bold text-slate-900">{splits.length} members</span>
                    </div>
                  </div>

                  <h4 className="mb-2 text-[11px] font-bold uppercase text-slate-500">Member shares</h4>
                  <div className="mb-5 max-h-48 space-y-1.5 overflow-y-auto">
                    {splits.map(([memberId, amount]) => {
                      const member = users.find((item) => item.id === memberId);
                      const memberName = member?.username || (memberId === user.id ? user.username : getUserName(memberId)) || 'Roommate';
                      const photo = member?.photoDataUrl || (memberId === user.id ? user.photoDataUrl : null);
                      return (
                        <div key={memberId} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-bold text-blue-700">
                              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : memberName.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate font-semibold text-slate-800">{memberName}</span>
                          </span>
                          <span className="font-mono font-bold text-slate-900">{formatCurrency(amount, currency)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}
