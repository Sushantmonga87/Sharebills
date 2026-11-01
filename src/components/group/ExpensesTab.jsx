import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt,
  Trash2,
  Check,
  AlertCircle,
  X,
  Calendar,
  CreditCard,
  User,
  Users,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  SlidersHorizontal,
  Utensils,
  Car,
  Home,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import { Button } from '../common/UI';
import { formatCurrency } from '../../utils/currency';
import ExpenseLongPressActions from './ExpenseLongPressActions';
import EmptyState from '../common/EmptyState';

const getCategoryMeta = (category = '') => {
  const cat = category.toLowerCase();
  if (cat.includes('food') || cat.includes('dinner') || cat.includes('snack') || cat.includes('grocer')) {
    return {
      bg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      icon: <Utensils size={14} />,
    };
  }
  if (cat.includes('travel') || cat.includes('petrol') || cat.includes('fuel') || cat.includes('cab')) {
    return {
      bg: 'bg-sky-50 text-sky-700 border-sky-200/80',
      icon: <Car size={14} />,
    };
  }
  if (cat.includes('rent') || cat.includes('wifi') || cat.includes('bill') || cat.includes('electricity')) {
    return {
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: <Home size={14} />,
    };
  }
  if (cat.includes('shop') || cat.includes('cloth') || cat.includes('mart')) {
    return {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      icon: <ShoppingBag size={14} />,
    };
  }
  return {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: <Zap size={14} />,
  };
};

const parseExpenseDate = (value) => {
  if (!value) return null;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsedDate = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getDateKey = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export default function ExpensesTab({
  expenses,
  currency = 'INR',
  currentUser,
  users = [],
  getUserName,
  onDeleteExpense,
  onRaiseExpenseDispute,
  onCancelExpenseDispute,
  onViewExpenseDispute,
  showToast,
}) {
  const [payerFilter, setPayerFilter] = useState('ALL');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [detailExpense, setDetailExpense] = useState(null);

  const uniquePayers = Array.from(new Set(expenses.map((e) => e.paidBy).filter(Boolean)));
  const totalGroupMembers = new Set([...users.map(u => u.id), currentUser.id]).size;

  const filtered = expenses.filter((exp) => {
    if (payerFilter === 'ALL') return true;
    return exp.paidBy === payerFilter;
  });

  const expenseDateGroups = Array.from(
    filtered.reduce((groups, expense) => {
      const date = parseExpenseDate(expense.date) || parseExpenseDate(expense.createdAt);
      const dateKey = date ? getDateKey(date) : 'undated';
      if (!groups.has(dateKey)) groups.set(dateKey, { date, expenses: [] });
      groups.get(dateKey).expenses.push(expense);
      return groups;
    }, new Map())
  )
    .sort(([firstKey], [secondKey]) => {
      if (firstKey === 'undated') return 1;
      if (secondKey === 'undated') return -1;
      return secondKey.localeCompare(firstKey);
    })
    .map(([dateKey, group]) => {
      const today = new Date();
      const todayKey = getDateKey(today);
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const yesterdayKey = getDateKey(yesterday);
      const label = dateKey === 'undated'
        ? 'Date not set'
        : dateKey === todayKey
          ? 'Today'
          : dateKey === yesterdayKey
            ? 'Yesterday'
            : group.date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });

      return { dateKey, label, expenses: group.expenses };
    });

  const canDeleteExpense = (exp) => {
    return exp.createdBy === currentUser.id || exp.paidBy === currentUser.id;
  };

  const toggleSelectMode = () => {
    if (isSelectMode) {
      setSelectedIds([]);
      setIsSelectMode(false);
    } else {
      setIsSelectMode(true);
    }
  };

  const handleCardClick = (exp) => {
    if (isSelectMode) {
      if (!canDeleteExpense(exp)) {
        showToast('Only the expense creator or payer can delete it.', 'error');
        return;
      }
      setSelectedIds((prev) =>
        prev.includes(exp.id) ? prev.filter((id) => id !== exp.id) : [...prev, exp.id]
      );
    } else {
      setDetailExpense(exp);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      for (const id of selectedIds) {
        await onDeleteExpense(id);
      }
      showToast(`Removed ${selectedIds.length} expense(s)`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setShowConfirmModal(false);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to delete selected expenses', 'error');
    }
  };

  const getParticipantsList = (exp) => {
    if (!exp.splits) return [];
    return Object.keys(exp.splits).filter((id) => parseFloat(exp.splits[id]) > 0);
  };

  const getMemberName = (memberId) => (
    users.find((member) => member.id === memberId)?.username ||
    (memberId === currentUser.id ? currentUser.username : getUserName(memberId)) ||
    'Roommate'
  );

  const getExpenseTitle = (exp) => {
    if (exp.category !== 'Settlement') return exp.title;

    const fromId = exp.settlementFrom || exp.paidBy;
    const toId =
      exp.settlementTo ||
      Object.entries(exp.splits || {}).find(
        ([memberId, amount]) => memberId !== fromId && parseFloat(amount) > 0
      )?.[0];
    if (!fromId || !toId) return exp.title;

    const prefix = exp.settlementTitlePrefix || exp.title?.split(':')[0] || 'Settlement';
    const fromName = fromId === currentUser.id ? 'You' : getUserName(fromId);
    const toName = toId === currentUser.id ? 'You' : getUserName(toId);
    return `${prefix}: ${fromName} → ${toName}`;
  };

  return (
    <div className="w-full space-y-3">
      {/* Top Filter and Select Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs flex-1 scrollbar-hide">
          <button
            type="button"
            onClick={() => setPayerFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex-shrink-0 text-xs ${
              payerFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All ({expenses.length})
          </button>

          {uniquePayers.map((payerId) => {
            const isMe = payerId === currentUser.id;
            const name = isMe ? 'You' : getUserName(payerId);
            const payer = users.find((member) => member.id === payerId);
            const isSelected = payerFilter === payerId;

            return (
              <button
                key={payerId}
                type="button"
                onClick={() => setPayerFilter(payerId)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all flex-shrink-0 text-xs border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-4 h-4 overflow-hidden rounded-full flex items-center justify-center text-[9px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {payer?.photoDataUrl ? (
                    <img src={payer.photoDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                </span>
                <span>{name}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleSelectMode}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border flex-shrink-0 ${
            isSelectMode
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Select multiple expenses"
        >
          {isSelectMode ? (
            <>
              <X size={13} />
              <span>Done</span>
            </>
          ) : (
            <>
              <SlidersHorizontal size={13} />
              <span>Select</span>
            </>
          )}
        </button>
      </div>

      {/* Expenses Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={payerFilter !== 'ALL' ? 'No matching bills' : 'No transactions recorded'}
          description={payerFilter !== 'ALL'
            ? 'No bills match this roommate filter.'
            : 'Add a shared bill to start tracking balances.'}
        />
      ) : (
        <div className="space-y-4">
          {expenseDateGroups.map((dateGroup) => (
            <section key={dateGroup.dateKey} aria-label={`Expenses for ${dateGroup.label}`}>
              <h2 className="mb-2 px-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
                {dateGroup.label}
              </h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
                {dateGroup.expenses.map((exp) => {
                  const iPaid = exp.paidBy === currentUser.id;
                  const hasAccess = canDeleteExpense(exp);
                  const isSelected = selectedIds.includes(exp.id);
                  const myShare = exp.splits ? exp.splits[currentUser.id] : 0;
                  const participants = getParticipantsList(exp);
                  const catMeta = getCategoryMeta(exp.category);

                  let statusAmount = null;
                  let isPositive = false;
                  let isInvolved = false;

                  if (iPaid) {
                    const totalOthersOwe =
                      parseFloat(exp.totalAmount) - (myShare ? parseFloat(myShare) : 0);
                    if (totalOthersOwe > 0) {
                      statusAmount = `+${formatCurrency(totalOthersOwe, currency)}`;
                      isPositive = true;
                      isInvolved = true;
                    } else {
                      statusAmount = formatCurrency(exp.totalAmount, currency);
                    }
                  } else if (myShare && parseFloat(myShare) > 0) {
                    statusAmount = `-${formatCurrency(myShare, currency)}`;
                    isPositive = false;
                    isInvolved = true;
                  }

                  // Split Pill Logic
                  let splitPills = [];
                  if (participants.length === totalGroupMembers && totalGroupMembers > 1) {
                    splitPills.push(
                      <span key="all" className="inline-block px-1.5 py-[2px] rounded md text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                        All
                      </span>
                    );
                  } else {
                    const showCount = participants.length > 3 ? 2 : participants.length;
                    const visibleParticipants = participants.slice(0, showCount);
                    const remainingCount = participants.length - showCount;

                    splitPills = visibleParticipants.map((memberId) => {
                      const isMe = memberId === currentUser.id;
                      const name = isMe ? 'You' : getMemberName(memberId);
                      return (
                        <span
                          key={memberId}
                          className={`inline-block px-1.5 py-[2px] rounded-md text-[9px] font-semibold border ${
                            isMe
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                              : 'bg-slate-100 text-slate-600 border-slate-200/60'
                          }`}
                        >
                          {name}
                        </span>
                      );
                    });

                    if (remainingCount > 0) {
                      splitPills.push(
                        <span key="more" className="inline-block px-1.5 py-[2px] rounded-md text-[9px] font-semibold bg-slate-100 text-slate-500 border border-slate-200/60">
                          +{remainingCount}
                        </span>
                      );
                    }
                  }

                  return (
                    <ExpenseLongPressActions
                      key={exp.id}
                      expenseTitle={exp.title}
                      canDelete={hasAccess}
                      canDispute={!isSelectMode && !exp.activeDisputeId}
                      hasActiveDispute={!isSelectMode && Boolean(exp.activeDisputeId)}
                      canCancelDispute={
                        !isSelectMode &&
                        Boolean(exp.activeDisputeId) &&
                        (!exp.activeDisputeBy || exp.activeDisputeBy === currentUser.id)
                      }
                      enabled={!isSelectMode}
                      onDelete={() => onDeleteExpense(exp.id)}
                      onRaiseDispute={(message) => onRaiseExpenseDispute?.(exp, message)}
                      onCancelDispute={() => onCancelExpenseDispute?.(exp)}
                      onViewDispute={() => onViewExpenseDispute?.(exp)}
                      showToast={showToast}
                    >
                      <div
                        onClick={() => handleCardClick(exp)}
                        className={`group flex items-center justify-between gap-3 p-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 mt-1 ${catMeta.bg}`}
                          >
                            {catMeta.icon}
                          </div>

                          <div className="min-w-0 flex flex-col justify-center py-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-[13px] truncate">
                                {getExpenseTitle(exp)}
                              </h3>
                              {exp.activeDisputeId && (
                                <span className="inline-flex items-center rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold text-amber-700 uppercase tracking-wide">
                                  Disputed
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-500 mt-0.5">
                              <span className="font-semibold text-slate-700">
                                {iPaid ? 'You' : getUserName(exp.paidBy)}
                              </span>{' '}
                              paid <span className="font-semibold text-slate-800">{formatCurrency(exp.totalAmount, currency)}</span>
                            </p>
                            
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-medium">Split:</span>
                              <div className="flex items-center gap-1">
                                {splitPills}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            {statusAmount ? (
                              <div
                                className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-bold font-mono ${
                                  isInvolved
                                    ? isPositive
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                      : 'bg-rose-50 text-rose-600 border border-rose-200/80'
                                    : 'text-slate-500 bg-slate-100 border border-transparent'
                                }`}
                              >
                                {isInvolved &&
                                  (isPositive ? (
                                    <ArrowUpRight size={11} className="text-emerald-600" />
                                  ) : (
                                    <ArrowDownLeft size={11} className="text-rose-600" />
                                  ))}
                                <span>{statusAmount}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400">Not involved</span>
                            )}
                          </div>

                          {isSelectMode ? (
                            hasAccess ? (
                              <div
                                className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-slate-900 border-slate-900 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center opacity-40">
                                <span className="text-[10px] text-slate-400">✕</span>
                              </div>
                            )
                          ) : (
                            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600" />
                          )}
                        </div>
                      </div>
                    </ExpenseLongPressActions>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Expense Details Modal */}
      {detailExpense &&
        createPortal(
          <div
            className="app-modal-overlay fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
            onClick={() => setDetailExpense(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="expense-detail-title"
              onClick={(e) => e.stopPropagation()}
              className="app-modal-surface relative z-[151] max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${
                      getCategoryMeta(detailExpense.category).bg
                    }`}
                  >
                    {getCategoryMeta(detailExpense.category).icon}
                  </div>
                  <div className="min-w-0">
                    <h3 id="expense-detail-title" className="truncate text-sm font-bold leading-tight text-slate-900">
                      {getExpenseTitle(detailExpense)}
                    </h3>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {detailExpense.category || 'General'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailExpense(null)}
                  aria-label="Close expense details"
                  className="popup-close-button flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-rose-600 bg-rose-600 text-white transition-colors hover:border-rose-700 hover:bg-rose-700"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-center text-slate-900 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.16)]">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Bill
                </span>
                <div className="mt-1 font-mono text-2xl font-bold">
                  {formatCurrency(detailExpense.totalAmount, currency)}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                    <User size={12} />
                    <span>Paid By</span>
                  </div>
                  <div className="font-bold text-slate-900 truncate">
                    {detailExpense.paidBy === currentUser.id
                      ? 'You'
                      : getUserName(detailExpense.paidBy)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                    <CreditCard size={12} />
                    <span>Method</span>
                  </div>
                  <div className="font-bold text-slate-900">
                    {detailExpense.paymentMethod || 'UPI'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                    <Calendar size={12} />
                    <span>Date</span>
                  </div>
                  <div className="font-bold text-slate-900">{detailExpense.date}</div>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                    <Users size={12} />
                    <span>Split</span>
                  </div>
                  <div className="font-bold text-slate-900">
                    Split · {getParticipantsList(detailExpense).length} members
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Member Shares
                </span>
                <div className="max-h-48 space-y-1.5 overflow-y-auto scrollbar-hide">
                  {Object.entries(detailExpense.splits || {}).map(([memberId, shareAmount]) => {
                    const numShare = parseFloat(shareAmount);
                    if (numShare <= 0) return null;
                    const isUser = memberId === currentUser.id;
                    const member = users.find((item) => item.id === memberId);
                    const memberName = getMemberName(memberId);
                    return (
                      <div
                        key={memberId}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-blue-100 to-blue-100 text-[11px] font-extrabold text-blue-700 shadow-sm">
                            {member?.photoDataUrl || (isUser && currentUser.photoDataUrl) ? (
                              <img
                                src={member?.photoDataUrl || currentUser.photoDataUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              memberName.charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800">
                              {memberName}
                            </span>
                            {isUser && <span className="block text-[10px] text-slate-400">You</span>}
                          </span>
                        </span>
                        <span className="font-bold font-mono text-slate-900">
                          {formatCurrency(numShare, currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </section>
          </div>,
          document.body
        )}

      {/* Selection Bar */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-16 left-4 right-4 max-w-sm mx-auto z-40">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center justify-between">
            <span className="text-xs font-semibold">{selectedIds.length} selected</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 font-semibold"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xs w-full p-5 shadow-xl border border-slate-200 text-center">
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-3 border border-rose-200">
                <AlertCircle size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Delete {selectedIds.length} bill(s)?
              </h3>
              <p className="text-slate-500 text-xs mb-4">
                This will recalculate balances for all group members.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowConfirmModal(false)}
                  className="py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleConfirmDelete} className="py-2 text-xs">
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}