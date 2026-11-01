import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Send,
  Copy,
  AlertTriangle,
  CheckCheck,
  ArrowRightLeft,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  Receipt,
  User,
  ArrowUpRight,
  ArrowDownLeft,
  X,
} from 'lucide-react';
import { calculateSettlements } from '../../utils/settlement';
import { Button } from '../common/UI';
import { triggerPushNotification } from '../../utils/notifications';
import { formatCurrency, getCurrencySymbol } from '../../utils/currency';

export default function BalancesTab({
  onBackActionChange,
  expenses,
  group,
  currentUser,
  getUserName,
  users = [],
  onSaveExpense,
  onSendNotification,
  showToast,
}) {
  const currency = group.currency || 'INR';
  const { balances, settlements: optimizedSettlements } = useMemo(
    () => calculateSettlements(expenses, group.members),
    [expenses, group.members]
  );
  const myBalance = balances[currentUser.id] || 0;

  const [copiedIndex, setCopiedIndex] = useState(null);
  const [confirmSettlement, setConfirmSettlement] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showOptimized, setShowOptimized] = useState(true);
  const confirmationInFlight = useRef(false);

  useEffect(() => {
    if (!onBackActionChange) return undefined;
    return onBackActionChange(() => {
      if (confirmSettlement) {
        setConfirmSettlement(null);
        return true;
      }
      if (breakdownData) {
        setBreakdownData(null);
        return true;
      }
      return false;
    });
  }, [breakdownData, confirmSettlement, onBackActionChange]);

  const [customPayee, setCustomPayee] = useState('');
  const [customAmount, setCustomAmount] = useState('');

  const rawSettlements = useMemo(() => {
    const debtMatrix = {};
    group.members.forEach((m1) => {
      debtMatrix[m1] = {};
      group.members.forEach((m2) => (debtMatrix[m1][m2] = 0));
    });

    expenses.forEach((exp) => {
      const payer = exp.paidBy;
      if (!payer || !exp.splits) return;
      Object.entries(exp.splits).forEach(([participant, shareAmount]) => {
        const share = parseFloat(shareAmount) || 0;
        if (exp.category === 'Settlement') {
          if (participant !== payer && debtMatrix[payer]?.[participant] !== undefined) {
            debtMatrix[payer][participant] -= share;
          }
          return;
        }
        if (participant !== payer && share > 0 && debtMatrix[participant]) {
          debtMatrix[participant][payer] += share;
        }
      });
    });

    const pairwise = [];
    const processed = new Set();

    group.members.forEach((m1) => {
      group.members.forEach((m2) => {
        if (m1 === m2) return;
        const pairKey = [m1, m2].sort().join('-');
        if (processed.has(pairKey)) return;
        processed.add(pairKey);

        const net = debtMatrix[m1][m2] - debtMatrix[m2][m1];
        if (net > 0.05) pairwise.push({ from: m1, to: m2, amount: net });
        else if (net < -0.05) pairwise.push({ from: m2, to: m1, amount: Math.abs(net) });
      });
    });
    return pairwise;
  }, [expenses, group.members]);

  const displayedSettlements = showOptimized ? optimizedSettlements : rawSettlements;
  const FALLBACK_DEFAULT_UPI = 'staranveer178@okicici';

  const getMemberUpi = (memberId) => {
    const member = users.find((u) => u.id === memberId);
    return member?.upiId?.trim() || null;
  };

  const sendPaymentNotification = async (recipientId, type, message) => {
    if (!onSendNotification || recipientId === currentUser.id) return;
    const createdAt = new Date().toISOString();
    const senderName = currentUser.username || getUserName(currentUser.id);
    await onSendNotification([
      {
        id: `notif_payment_${Date.now()}_${recipientId}`,
        recipientId,
        senderId: currentUser.id,
        createdBy: currentUser.id,
        createdByName: senderName,
        groupId: group.id,
        type,
        category: 'settlement',
        message,
        createdAt,
        read: false,
      },
    ]);
  };

  const handleCopyUPI = (upiToCopy, idx) => {
    navigator.clipboard.writeText(upiToCopy);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const recordSettlement = async (fromId, toId, amountStr, titlePrefix = 'Settlement') => {
    if (!onSaveExpense) throw new Error('Save handler missing');

    const toName = getUserName(toId);
    const fromName = getUserName(fromId);

    const settlementSplits = {};
    group.members.forEach((m) => (settlementSplits[m] = '0'));
    settlementSplits[toId] = parseFloat(amountStr).toFixed(2);

    const settlementContext = [
      group.id,
      fromId,
      toId,
      parseFloat(amountStr).toFixed(2),
      ...expenses.map((expense) => expense.id).sort(),
    ].join('|');
    let settlementHash = 2166136261;
    for (let index = 0; index < settlementContext.length; index += 1) {
      settlementHash = Math.imul(
        settlementHash ^ settlementContext.charCodeAt(index),
        16777619
      );
    }

    const settlementTransaction = {
      id: `exp_settle_${(settlementHash >>> 0).toString(36)}`,
      groupId: group.id,
      title: `${titlePrefix}: ${fromName} → ${toName}`,
      settlementFrom: fromId,
      settlementTo: toId,
      settlementTitlePrefix: titlePrefix,
      totalAmount: parseFloat(amountStr).toFixed(2),
      paidBy: fromId,
      paymentMethod: 'UPI',
      category: 'Settlement',
      date: new Date().toISOString().split('T')[0],
      splits: settlementSplits,
      isSettlement: true,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };

    await onSaveExpense(settlementTransaction);
  };

  const handleConfirmReceived = async () => {
    if (!confirmSettlement || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setLoading(true);
    try {
      await recordSettlement(
        confirmSettlement.from,
        confirmSettlement.to,
        confirmSettlement.amount
      );
      setConfirmSettlement(null);
      setExpandedId(null);
      const receiverName = currentUser.username || getUserName(currentUser.id);
      const message = `${receiverName} confirmed receiving ${formatCurrency(confirmSettlement.amount, currency)} from you.`;

      try {
        await sendPaymentNotification(confirmSettlement.from, 'SETTLEMENT_CONFIRMED', message);
        await triggerPushNotification({
          senderId: currentUser.id,
          recipientId: confirmSettlement.from,
          title: 'Payment Confirmed',
          message,
          groupId: group.id,
        });
      } catch (notificationError) {
        console.error('Settlement notification failed:', notificationError);
      }

      if (typeof showToast === 'function') showToast('Payment received and balance cleared!');
    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') showToast('Failed to record settlement', 'error');
    } finally {
      confirmationInFlight.current = false;
      setLoading(false);
    }
  };

  const handleCustomPayment = async (isRecordingOnly) => {
    const amt = parseFloat(customAmount);
    if (!customPayee || isNaN(amt) || amt <= 0) {
      if (typeof showToast === 'function')
        showToast('Select a roommate and valid amount', 'error');
      return;
    }

    if (!isRecordingOnly) {
      if (currency !== 'INR') {
        if (typeof showToast === 'function') {
          showToast('UPI payments are only supported for INR spaces. You can record the payment instead.', 'error');
        }
        return;
      }
      const payeeName = getUserName(customPayee);
      const payeeUpi = getMemberUpi(customPayee) || FALLBACK_DEFAULT_UPI;
      const amountStr = amt.toFixed(2);
      const note = encodeURIComponent('Sharebills Payment');
      const gpayDirectUrl = `gpay://upi/pay?pa=${payeeUpi}&pn=${encodeURIComponent(
        payeeName
      )}&am=${amountStr}&cu=INR&tn=${note}`;
      const androidGPayIntent = `intent://upi/pay?pa=${payeeUpi}&pn=${encodeURIComponent(
        payeeName
      )}&am=${amountStr}&cu=INR&tn=${note}#Intent;scheme=gpay;package=com.google.android.apps.nbu.paisa.user;end`;

      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        window.location.href = androidGPayIntent;
        setTimeout(() => (window.location.href = gpayDirectUrl), 500);
      } else {
        window.location.href = gpayDirectUrl;
      }
    } else {
      setLoading(true);
      try {
        await recordSettlement(currentUser.id, customPayee, amt.toFixed(2), 'Quick Pay');
        const payerName = currentUser.username || getUserName(currentUser.id);
        const message = `${payerName} recorded a payment of ${formatCurrency(amt, currency)} to you.`;

        await sendPaymentNotification(customPayee, 'PAYMENT_RECORDED', message);

        await triggerPushNotification({
          senderId: currentUser.id,
          recipientId: customPayee,
          title: 'Payment Received',
          message,
          groupId: group.id,
        });

        if (typeof showToast === 'function') showToast('Payment recorded successfully!');
        setCustomPayee('');
        setCustomAmount('');
      } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast('Failed to record custom payment', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const getBreakdownForPair = (userA, userB) => {
    return expenses.filter((exp) => {
      if (exp.category === 'Settlement') return false;
      const aPaid = exp.paidBy === userA;
      const bPaid = exp.paidBy === userB;
      const aShare = parseFloat(exp.splits?.[userA]) || 0;
      const bShare = parseFloat(exp.splits?.[userB]) || 0;
      return (aPaid && bShare > 0) || (bPaid && aShare > 0);
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8 pb-20">
      {/* Net Position Header Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Your Net Room Position
          </span>
          <div
            className={`mt-1 font-mono text-3xl sm:text-4xl font-bold tracking-tight ${
              myBalance > 0.01
                ? 'text-emerald-600'
                : myBalance < -0.01
                  ? 'text-rose-600'
                  : 'text-slate-900'
            }`}
          >
            {myBalance < 0 ? '-' : myBalance > 0 ? '+' : ''}{formatCurrency(Math.abs(myBalance), currency)}
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold self-start sm:self-auto ${
            myBalance > 0.01
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : myBalance < -0.01
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}
        >
          {myBalance > 0.01 ? (
            <>
              <ArrowDownLeft size={15} />
              <span>You need to receive overall</span>
            </>
          ) : myBalance < -0.01 ? (
            <>
              <ArrowUpRight size={15} />
              <span>You need to pay overall</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={15} />
              <span>All settled up</span>
            </>
          )}
        </div>
      </div>

      {/* SETTLEMENTS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">Settlement Plan</h3>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setShowOptimized(true);
                setExpandedId(null);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                showOptimized ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              Smart
            </button>
            <button
              type="button"
              onClick={() => {
                setShowOptimized(false);
                setExpandedId(null);
              }}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                !showOptimized ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              <ArrowRightLeft size={12} /> Exact
            </button>
          </div>
        </div>

        {displayedSettlements.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center border border-slate-200/90 shadow-xs">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl flex items-center justify-center mx-auto mb-2.5">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-bold text-slate-900">All Settled Up</p>
            <p className="text-xs text-slate-500 mt-0.5">
              No outstanding dues remaining across this space.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedSettlements.map((settlement, index) => {
              const iAmFrom = settlement.from === currentUser.id;
              const iAmTo = settlement.to === currentUser.id;
              const isMySettlement = iAmFrom || iAmTo;
              const isExpanded = expandedId === index;

              const fromName = iAmFrom ? 'You' : getUserName(settlement.from);
              const toName = iAmTo ? 'You' : getUserName(settlement.to);
              const payeeUpi = getMemberUpi(settlement.to) || FALLBACK_DEFAULT_UPI;
              const hasCustomUpi = Boolean(getMemberUpi(settlement.to));

              let statusText = `${fromName} pays ${toName}`;
              let amountBadge = 'text-slate-800 bg-slate-100';

              if (iAmFrom) {
                statusText = `You need to pay ${toName}`;
                amountBadge = 'text-rose-700 bg-rose-50 border border-rose-200/70';
              } else if (iAmTo) {
                statusText = `You need to receive from ${fromName}`;
                amountBadge = 'text-emerald-700 bg-emerald-50 border border-emerald-200/70';
              }
              const avatarMemberId = iAmFrom ? settlement.to : settlement.from;
              const avatarMember = users.find((member) => member.id === avatarMemberId);
              const avatarName = getUserName(avatarMemberId) || 'Roommate';

              return (
                <div
                  key={index}
                  className="rounded-xl bg-white border border-slate-200/90 shadow-xs overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : index)}
                    className="p-3.5 sm:p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      {avatarMember?.photoDataUrl ? (
                        <img
                          src={avatarMember.photoDataUrl}
                          alt={`${avatarName} profile`}
                          className="h-10 w-10 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center font-bold text-white text-sm">
                          {avatarName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-slate-900">{statusText}</p>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold mt-1 ${amountBadge}`}
                        >
                          {formatCurrency(settlement.amount, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2.5 bg-slate-50/70 border-t border-slate-100">
                      {!showOptimized && (
                        <div className="flex justify-center mb-3">
                          <button
                            type="button"
                            onClick={() =>
                              setBreakdownData({
                                from: settlement.from,
                                to: settlement.to,
                                amount: settlement.amount,
                                fromName,
                                toName,
                              })
                            }
                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                          >
                            <Receipt size={13} /> View expense breakdown
                          </button>
                        </div>
                      )}

                      {iAmFrom && (
                        <div className="space-y-2.5">
                          {!hasCustomUpi && (
                            <div className="text-[11px] text-amber-800 flex items-start gap-1.5 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                              <span>
                                {toName} hasn’t linked a UPI ID yet. Using default fallback.
                              </span>
                            </div>
                          )}
                          {currency === 'INR' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const note = encodeURIComponent(`Sharebills to ${toName}`);
                                window.location.href = `gpay://upi/pay?pa=${payeeUpi}&pn=${encodeURIComponent(
                                  toName
                                )}&am=${settlement.amount.toFixed(2)}&cu=INR&tn=${note}`;
                              }}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800"
                            >
                              <Send size={13} /> Pay via UPI
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyUPI(payeeUpi, index)}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50"
                            >
                              <Copy size={13} />{' '}
                              {copiedIndex === index ? 'Copied!' : 'Copy UPI ID'}
                            </button>
                          </div>
                          ) : (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                              UPI payments are only supported for INR spaces. Record the payment after paying another way.
                            </p>
                          )}
                        </div>
                      )}

                      {iAmTo && (
                        <button
                          type="button"
                          onClick={() => setConfirmSettlement(settlement)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700"
                        >
                          <CheckCheck size={15} /> Confirm Payment Received
                        </button>
                      )}

                      {!isMySettlement && (
                        <div className="text-center text-xs text-slate-400 py-1">
                          You are not involved in this settlement.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QUICK PAY & RECORD MODULE */}
      <div className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <PlusCircle size={14} className="text-slate-700" /> Record Direct Payment
        </h3>

        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="relative flex-1">
            <User
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <select
              value={customPayee}
              onChange={(e) => setCustomPayee(e.target.value)}
              className="w-full h-10 pl-9 pr-3 text-xs sm:text-sm font-semibold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:border-slate-900"
            >
              <option value="">Select roommate...</option>
              {group.members
                .filter((m) => m !== currentUser.id)
                .map((memberId) => (
                  <option key={memberId} value={memberId}>
                    {getUserName(memberId)}
                  </option>
                ))}
            </select>
          </div>

          <div className="relative w-full sm:w-36 flex-shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              {getCurrencySymbol(currency)}
            </span>
            <input
              type="number"
              placeholder="0.00"
              min="1"
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full h-10 pl-8 pr-3 text-sm font-mono font-bold border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => handleCustomPayment(false)}
            className="h-10 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 flex items-center justify-center gap-1.5"
          >
            <Send size={13} />
            <span>Open UPI App</span>
          </button>
          <button
            type="button"
            onClick={() => handleCustomPayment(true)}
            disabled={loading}
            className="h-10 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            <span>{loading ? 'Saving...' : 'Record Paid'}</span>
          </button>
        </div>
      </div>

      {breakdownData &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-md sm:items-center sm:p-4"
            onClick={() => setBreakdownData(null)}
          >
            <div
              className="w-full max-w-md rounded-t-[32px] border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl sm:rounded-[32px] sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
                    <Receipt size={18} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-slate-900">Expense Breakdown</h3>
                    <p className="truncate text-xs text-slate-500">
                      {breakdownData.from === currentUser.id
                        ? `You need to pay ${breakdownData.toName}`
                        : breakdownData.to === currentUser.id
                          ? `You need to receive from ${breakdownData.fromName}`
                          : `${breakdownData.fromName} pays ${breakdownData.toName}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBreakdownData(null)}
                  aria-label="Close expense breakdown"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                <span className="text-xs font-semibold text-slate-600">Total owed</span>
                <span className="font-mono text-base font-extrabold text-blue-700">
                  {formatCurrency(breakdownData.amount, currency)}
                </span>
              </div>

              <div className="mb-4 max-h-[50vh] space-y-2 overflow-y-auto scrollbar-hide">
                {getBreakdownForPair(breakdownData.from, breakdownData.to).map((exp) => {
                  const isFromPaid = exp.paidBy === breakdownData.from;
                  const payerName = isFromPaid ? breakdownData.fromName : breakdownData.toName;
                  const borrowerName = isFromPaid ? breakdownData.toName : breakdownData.fromName;
                  const shareAmt = isFromPaid
                    ? exp.splits[breakdownData.to]
                    : exp.splits[breakdownData.from];

                  return (
                    <div
                      key={exp.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm"
                    >
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <span className="min-w-0 text-sm font-bold text-slate-900">{exp.title}</span>
                        <span className="flex-shrink-0 font-mono text-sm font-extrabold text-slate-900">
                          {formatCurrency(shareAmt, currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>
                          {payerName} paid {formatCurrency(exp.totalAmount, currency)}
                        </span>
                        <span>({borrowerName}’s share)</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setBreakdownData(null)}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition-transform active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}

      {confirmSettlement &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xs rounded-2xl p-5 bg-white border border-slate-200 shadow-xl text-center">
              <div className="w-11 h-11 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Confirm Receipt</h3>
              <p className="text-slate-500 text-xs mb-4">
                Confirm you received{' '}
                <strong className="text-slate-900 font-mono">
                  {formatCurrency(confirmSettlement.amount, currency)}
                </strong>{' '}
                from <strong className="text-slate-800">{getUserName(confirmSettlement.from)}</strong>.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmSettlement(null)}
                  disabled={loading}
                  className="py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  onClick={handleConfirmReceived}
                  disabled={loading}
                  className="py-2 text-xs"
                >
                  {loading ? 'Confirming...' : 'Received'}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}