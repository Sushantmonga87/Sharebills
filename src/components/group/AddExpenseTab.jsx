import { useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CreditCard,
  Tag,
  User,
  Users,
  Check,
  ArrowLeft,
  LoaderCircle,
} from 'lucide-react';
import { CATEGORIES, PAYMENT_METHODS } from '../../utils/constants';
import { triggerPushNotification } from '../../utils/notifications';
import { Button, Input } from '../common/UI';
import { formatCurrency, getCurrencySymbol } from '../../utils/currency';

export default function AddExpenseTab({
  group,
  initialExpenseDraft = null,
  currentUser,
  users = [],
  getUserName,
  onSaveExpense,
  onSendNotification,
  onSaved,
  showToast,
}) {
  const [title, setTitle] = useState(initialExpenseDraft?.title || '');
  const [amount, setAmount] = useState(initialExpenseDraft?.amount || '');
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .split('T')[0];
  });
  const [category, setCategory] = useState(initialExpenseDraft?.category || 'Food');
  const [paymentMethod, setPaymentMethod] = useState(initialExpenseDraft?.paymentMethod || 'UPI');
  const [splitMode, setSplitMode] = useState('equal');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [selectedParticipants, setSelectedParticipants] = useState(() =>
    Object.fromEntries(group.members.map((memberId) => [memberId, true]))
  );
  const [customSplits, setCustomSplits] = useState(() =>
    Object.fromEntries(group.members.map((memberId) => [memberId, '']))
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSavingRef.current) return;
    setError('');
    const numericAmount = parseFloat(amount);
    if (!title.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid title and total amount.');
      return;
    }

    const finalSplits = {};
    if (splitMode === 'equal') {
      const activeMembers = Object.keys(selectedParticipants).filter(
        (memberId) => selectedParticipants[memberId]
      );
      if (activeMembers.length === 0) {
        setError('Select at least one participant.');
        return;
      }
      const splitAmount = (numericAmount / activeMembers.length).toFixed(2);
      activeMembers.forEach((memberId) => {
        finalSplits[memberId] = splitAmount;
      });
    } else {
      let totalCustom = 0;
      let hasInvalid = false;
      const activeMembers = Object.keys(customSplits).filter(
        (memberId) => customSplits[memberId] !== '' && parseFloat(customSplits[memberId]) > 0
      );
      if (activeMembers.length === 0) {
        setError('Enter individual amounts.');
        return;
      }
      activeMembers.forEach((memberId) => {
        const value = parseFloat(customSplits[memberId]);
        if (Number.isNaN(value) || value < 0) hasInvalid = true;
        else {
          totalCustom += value;
          finalSplits[memberId] = value.toFixed(2);
        }
      });
      if (hasInvalid) {
        setError('Enter valid positive amounts.');
        return;
      }
      if (Math.abs(totalCustom - numericAmount) > 0.05) {
        setError(
          `Participant amounts sum to ${formatCurrency(totalCustom, group.currency)}, but total expense is ${formatCurrency(numericAmount, group.currency)}.`
        );
        return;
      }
    }

    const newExpense = {
      id: `exp_${Date.now()}`,
      groupId: group.id,
      title: title.trim(),
      totalAmount: numericAmount.toFixed(2),
      paidBy,
      createdBy: currentUser.id,
      paymentMethod,
      category,
      date,
      splits: finalSplits,
      createdAt: new Date().toISOString(),
    };

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSaveExpense(newExpense);

      if (onSendNotification) {
        const actualPayerName = getUserName(paidBy) || currentUser.username || 'A member';
        const otherMemberIds = group.members.filter((id) => id !== currentUser.id);

        const recipientNotifications = otherMemberIds.map((memberId) => {
          const owesAmount = finalSplits[memberId];
          const splitText =
            owesAmount && parseFloat(owesAmount) > 0
              ? ` (Your share: ${formatCurrency(owesAmount, group.currency)})`
              : '';

          return {
            id: `notif_${Date.now()}_${memberId}`,
            recipientId: memberId,
            senderId: currentUser.id,
            createdBy: currentUser.id,
            createdByName: actualPayerName,
            groupId: group.id,
            type: 'EXPENSE_ADDED',
            message: `${actualPayerName} added "${newExpense.title}" for ${formatCurrency(newExpense.totalAmount, group.currency)}${splitText}.`,
            expenseId: newExpense.id,
            createdAt: new Date().toISOString(),
            read: false,
          };
        });

        if (recipientNotifications.length > 0) {
          onSendNotification(recipientNotifications).catch((notificationError) => {
            console.warn('Expense activity notification save failed:', notificationError);
          });
          for (const notif of recipientNotifications) {
            triggerPushNotification({
              senderId: currentUser.id,
              recipientId: notif.recipientId,
              title: `New Expense in ${group.name || 'Group'}`,
              message: notif.message,
              groupId: group.id,
              avatarUserId: paidBy,
            }).catch((err) => console.warn('Expense push trigger failed:', err));
          }
        }
      }

      showToast('Expense saved and members notified!');
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Failed to save expense. Please try again.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const activeCount = Object.values(selectedParticipants).filter(Boolean).length;
  const equalAmount =
    amount && !Number.isNaN(Number(amount)) && activeCount > 0
      ? (parseFloat(amount) / activeCount).toFixed(2)
      : '0.00';

  return (
    <div className="mx-auto w-full max-w-xl p-3 pb-20 sm:px-4 sm:pb-20 sm:pt-2 lg:px-6 lg:pb-20 lg:pt-2">
      <div className="page-heading-bar mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Record New Bill</h2>
          <p className="text-xs text-slate-500">Split equally or customize member shares</p>
        </div>

        <button
          type="button"
          onClick={onSaved}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Total Amount
            </span>
            <div className="flex items-center justify-center gap-1">
              <span className="text-xl font-bold text-slate-900">{getCurrencySymbol(group.currency)}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                className="w-44 bg-transparent text-3xl font-bold font-mono tracking-tight text-slate-900 outline-none text-center placeholder:text-slate-300"
              />
            </div>
          </div>

          <Input
            label="Description"
            placeholder="e.g. Groceries, Electricity, Dinner"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <User size={13} />
                <span>Paid By</span>
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-slate-900 outline-none"
                value={paidBy}
                onChange={(event) => setPaidBy(event.target.value)}
              >
                {group.members.map((memberId) => (
                  <option key={memberId} value={memberId}>
                    {memberId === currentUser.id ? 'You' : getUserName(memberId)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Calendar size={13} />
                <span>Date</span>
              </label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="block min-w-0 max-w-full appearance-none px-2.5"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Tag size={13} />
                <span>Category</span>
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-slate-900 outline-none"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <CreditCard size={13} />
                <span>Method</span>
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-slate-900 outline-none"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Split Breakdown */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="mb-3.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Users size={14} />
              <span>Split Method</span>
            </label>

            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSplitMode('equal')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  splitMode === 'equal'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Equal
              </button>
              <button
                type="button"
                onClick={() => setSplitMode('custom')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  splitMode === 'custom'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {group.members.map((memberId) => {
              const isUser = memberId === currentUser.id;
              const memberName = isUser ? 'You' : getUserName(memberId);
              const member = users.find((user) => user.id === memberId);
              const isChecked = selectedParticipants[memberId] || false;

              return (
                <div
                  key={memberId}
                  className={`flex items-center justify-between rounded-xl border p-3 transition-all ${
                    splitMode === 'equal' && isChecked
                      ? 'border-slate-300 bg-slate-50/70'
                      : 'border-slate-200/70 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[11px] font-bold text-white">
                      {member?.photoDataUrl ? (
                        <img src={member.photoDataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (isUser ? 'Y' : (memberName || 'U')).charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{memberName}</span>
                  </div>

                  {splitMode === 'equal' ? (
                    <div className="flex items-center gap-3">
                      {isChecked && parseFloat(amount) > 0 && (
                        <span className="rounded bg-slate-200/70 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                          {formatCurrency(equalAmount, group.currency)}
                        </span>
                      )}
                      <label className="relative flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) =>
                            setSelectedParticipants((prev) => ({
                              ...prev,
                              [memberId]: event.target.checked,
                            }))
                          }
                          className="sr-only"
                        />
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                            isChecked
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-400">{getCurrencySymbol(group.currency)}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right font-mono text-sm font-bold outline-none focus:border-slate-900"
                        value={customSplits[memberId]}
                        onChange={(event) =>
                          setCustomSplits((prev) => ({
                            ...prev,
                            [memberId]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Button type="submit" disabled={isSaving} className="w-full py-3">
          {isSaving ? (
            <>
              <LoaderCircle size={16} className="animate-spin" />
              Please wait…
            </>
          ) : (
            'Save & Notify Roommates'
          )}
        </Button>
      </form>
    </div>
  );
}