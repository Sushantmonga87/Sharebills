import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  PieChart,
  Receipt,
  Home,
  Check,
  CircleDollarSign,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import SpendingBars from './SpendingBars';
import EmptyState from '../common/EmptyState';

const CATEGORY_CHART_COLORS = {
  Food: '#f59e0b',
  Travel: '#0ea5e9',
  Rent: '#1e293b',
  Utilities: '#3b82f6',
  Shopping: '#059669',
  Other: '#94a3b8',
};

const getExpenseDate = (expense) => {
  const value = expense.date || expense.createdAt;
  if (value?.toDate) return value.toDate();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [dateYear, dateMonth, dateDay] = value.split('-').map(Number);
    return new Date(dateYear, dateMonth - 1, dateDay);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function MonthlyAnalyticsTab({
  user,
  expenses = [],
  groups = [],
  rentRecords = [],
  mobilePreview = false,
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);
  const [chartRange, setChartRange] = useState('daily');
  const monthPickerInputRef = useRef(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const userId = user?.id;

  const formattedMonthLabel = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const openMonthPicker = () => {
    const input = monthPickerInputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    } catch {
      input.click();
    }
  };

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const date = getExpenseDate(expense);
      return date && date.getFullYear() === year && date.getMonth() === month;
    });
  }, [expenses, year, month]);

  const spendingExpenses = useMemo(
    () =>
      monthlyExpenses.filter(
        (expense) => !expense.isSettlement && expense.category !== 'Settlement'
      ),
    [monthlyExpenses]
  );

  const datedSpendingExpenses = useMemo(
    () => expenses
      .filter((expense) => !expense.isSettlement && expense.category !== 'Settlement')
      .map((expense) => ({ expense, date: getExpenseDate(expense) }))
      .filter((item) => item.date),
    [expenses]
  );

  const periodSpending = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const lastDay = year === today.getFullYear() && month === today.getMonth()
      ? today.getDate()
      : daysInMonth;
    const monthItems = datedSpendingExpenses.filter(
      ({ date }) => date.getFullYear() === year && date.getMonth() === month
    );

    if (chartRange === 'monthly') {
      return [{
        label: currentDate.toLocaleDateString('en-US', { month: 'short' }),
        detail: formattedMonthLabel,
        total: monthItems.reduce(
          (sum, { expense }) => sum + (Number.parseFloat(expense.totalAmount) || 0),
          0
        ),
        share: monthItems.reduce(
          (sum, { expense }) => sum + (Number.parseFloat(expense.splits?.[userId]) || 0),
          0
        ),
      }];
    }

    if (chartRange === 'weekly') {
      const weekCount = Math.ceil(daysInMonth / 7);
      return Array.from({ length: weekCount }, (_, index) => {
        const startDay = index * 7 + 1;
        const endDay = Math.min(startDay + 6, daysInMonth);
        const weekItems = monthItems.filter(
          ({ date }) => date.getDate() >= startDay && date.getDate() <= endDay
        );
        return {
          label: `W${index + 1}`,
          detail: `${formattedMonthLabel}, week ${index + 1} (${startDay} to ${endDay})`,
          total: weekItems.reduce(
            (sum, { expense }) => sum + (Number.parseFloat(expense.totalAmount) || 0),
            0
          ),
          share: weekItems.reduce(
            (sum, { expense }) => sum + (Number.parseFloat(expense.splits?.[userId]) || 0),
            0
          ),
        };
      });
    }

    const startDay = Math.max(1, lastDay - 6);
    return Array.from({ length: lastDay - startDay + 1 }, (_, index) => {
      const day = startDay + index;
      const dayItems = monthItems.filter(({ date }) => date.getDate() === day);
      return {
        label: new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'short' }),
        detail: `${formattedMonthLabel} ${day}`,
        total: dayItems.reduce(
          (sum, { expense }) => sum + (Number.parseFloat(expense.totalAmount) || 0),
          0
        ),
        share: dayItems.reduce(
          (sum, { expense }) => sum + (Number.parseFloat(expense.splits?.[userId]) || 0),
          0
        ),
      };
    });
  }, [chartRange, currentDate, datedSpendingExpenses, formattedMonthLabel, month, userId, year]);

  const monthlyRents = useMemo(() => {
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    return rentRecords
      .filter((rent) => rent.month === monthKey)
      .map((rent) => ({
        ...rent,
        groupName: groups.find((group) => group.id === rent.groupId)?.name || 'Space',
      }));
  }, [rentRecords, groups, year, month]);

  const stats = useMemo(() => {
    let totalGroupSpent = 0;
    let yourShareTotal = 0;
    let youPaidTotal = 0;
    const categoryTotals = {};

    spendingExpenses.forEach((exp) => {
      const amount = parseFloat(exp.totalAmount) || 0;
      totalGroupSpent += amount;

      if (exp.paidBy === userId) {
        youPaidTotal += amount;
      }

      if (exp.splits && exp.splits[userId]) {
        yourShareTotal += parseFloat(exp.splits[userId]) || 0;
      }

      const cat = exp.category || 'Other';
      const personalShare = parseFloat(exp.splits?.[userId]) || 0;
      if (personalShare > 0) {
        categoryTotals[cat] = (categoryTotals[cat] || 0) + personalShare;
      }
    });

    const categoryList = Object.entries(categoryTotals)
      .map(([name, total]) => ({
        name,
        total,
        percentage: yourShareTotal > 0 ? ((total / yourShareTotal) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { totalGroupSpent, yourShareTotal, youPaidTotal, categoryList };
  }, [spendingExpenses, userId]);

  const breakdownExpenses =
    selectedBreakdown?.type === 'paid'
      ? spendingExpenses.filter((expense) => expense.paidBy === userId)
      : selectedBreakdown?.type === 'share'
        ? spendingExpenses.filter((expense) => (parseFloat(expense.splits?.[userId]) || 0) > 0)
        : selectedBreakdown?.type === 'category'
          ? spendingExpenses.filter(
              (expense) =>
                (expense.category || 'Other') === selectedBreakdown.category &&
                (parseFloat(expense.splits?.[userId]) || 0) > 0
            )
          : spendingExpenses;

  const breakdownTotal = breakdownExpenses.reduce(
    (total, expense) =>
      total +
      (selectedBreakdown?.type === 'share' || selectedBreakdown?.type === 'category'
        ? parseFloat(expense.splits?.[userId]) || 0
        : parseFloat(expense.totalAmount) || 0),
    0
  );
  const netBalance = stats.youPaidTotal - stats.yourShareTotal;
  const largestExpense = spendingExpenses.reduce(
    (largest, expense) => (
      Number.parseFloat(expense.totalAmount) > Number.parseFloat(largest?.totalAmount || 0)
        ? expense
        : largest
    ),
    null
  );
  const averageExpense = spendingExpenses.length
    ? stats.totalGroupSpent / spendingExpenses.length
    : 0;

  const openBreakdown = (type, title, category) => {
    setSelectedBreakdown({ type, title, category });
  };

  return (
    <div className={`mx-auto w-full max-w-[1360px] space-y-5 p-3 pb-20 ${mobilePreview ? '' : 'sm:px-4 sm:pb-20 sm:pt-2 lg:px-6 lg:pb-20 lg:pt-2'}`}>
      {/* Header & Month Switcher */}
      <div className="page-heading-bar flex items-center justify-between gap-2.5">
        <div className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
            {user?.photoDataUrl ? (
              <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (user?.username || 'U').charAt(0).toUpperCase()
            )}
          </span>
          <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">
            Monthly
          </h1>
        </div>

        <div className="relative flex min-w-0 max-w-[62%] flex-shrink items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-white/80"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-slate-700">
            {formattedMonthLabel}
          </span>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-white/80"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={openMonthPicker}
            aria-label="Choose month"
            title="Choose month"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700"
          >
            <CalendarDays size={15} />
          </button>
          
          {/* Fixed iOS input positioning: overlays the button invisibly with opacity-0 so iOS accepts the direct touch interaction */}
          <input
            ref={monthPickerInputRef}
            type="month"
            aria-label="Choose report month"
            value={`${year}-${String(month + 1).padStart(2, '0')}`}
            onChange={(event) => {
              const [selectedYear, selectedMonth] = event.target.value.split('-').map(Number);
              if (selectedYear && selectedMonth) {
                setCurrentDate(new Date(selectedYear, selectedMonth - 1, 1));
              }
            }}
            className="absolute right-0 h-8 w-8 cursor-pointer opacity-0"
            tabIndex={-1}
          />
        </div>
      </div>

      {/* 3-Card Summary Row */}
      <div className={`grid grid-cols-1 gap-3.5 ${mobilePreview ? '' : 'sm:grid-cols-3'}`}>
        <button
          type="button"
          onClick={() => openBreakdown('paid', 'You Paid Out')}
          className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-xs transition-colors hover:border-slate-300"
          aria-label={`View expenses you paid, totaling ₹${stats.youPaidTotal.toFixed(2)}`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Total I Paid</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900">
              ₹{stats.youPaidTotal.toFixed(2)}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ArrowUpRight size={18} />
          </span>
        </button>

        <button
          type="button"
          onClick={() => openBreakdown('share', 'My Share')}
          className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-xs transition-colors hover:border-slate-300"
          aria-label={`View your expense shares, totaling ₹${stats.yourShareTotal.toFixed(2)}`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">My Share</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900">
              ₹{stats.yourShareTotal.toFixed(2)}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Receipt size={18} />
          </span>
        </button>

        <div className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {netBalance > 0
                ? 'Net to Receive'
                : netBalance < 0
                  ? 'Net to Pay'
                  : 'Monthly Net'}
            </p>
            <p
              className={`mt-1 font-mono text-xl font-bold ${
                netBalance > 0
                  ? 'text-emerald-600'
                  : netBalance < 0
                    ? 'text-rose-600'
                    : 'text-slate-900'
              }`}
            >
              {netBalance > 0 ? '+' : netBalance < 0 ? '-' : ''}₹{Math.abs(netBalance).toFixed(2)}
            </p>
          </div>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              netBalance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            {netBalance >= 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch">
        <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Home size={16} className="text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">Room rent</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">Tracked separately</span>
        </div>
        {monthlyRents.length === 0 ? (
          <EmptyState
            icon={Home}
            compact
            title="No rent records"
            description={`Nothing tracked for ${formattedMonthLabel}.`}
            className="border-0 bg-transparent"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {monthlyRents.map((rent) => {
              const paid = Boolean(rent.payments?.[userId]?.paid);
              const share = Number(rent.shares?.[userId]) || 0;
              return (
                <div key={rent.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{rent.groupName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Total {formatCurrency(rent.totalAmount, rent.currency)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Your share</p>
                      <p className="font-mono text-sm font-bold text-slate-900">
                        {formatCurrency(share, rent.currency)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${paid ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {paid ? <Check size={14} /> : <CircleDollarSign size={14} />}
                      {paid ? 'Paid' : 'Due'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">Expense snapshot</h2>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {spendingExpenses.length} bill{spendingExpenses.length === 1 ? '' : 's'}
          </span>
        </div>
        {spendingExpenses.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-blue-50/70 px-3.5 py-3">
              <span className="text-xs font-medium text-slate-600">Average bill</span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {formatCurrency(averageExpense, 'INR')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50/70 px-3.5 py-3">
              <span className="min-w-0 text-xs font-medium text-slate-600">Largest bill</span>
              <span className="min-w-0 text-right">
                <span className="block max-w-[190px] truncate text-[11px] font-semibold text-slate-700">
                  {largestExpense?.title || largestExpense?.description || 'Shared expense'}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {formatCurrency(Number.parseFloat(largestExpense?.totalAmount) || 0, 'INR')}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            compact
            title="No bills to summarize"
            description={`Your expense insights for ${formattedMonthLabel} will appear here.`}
            className="border-0 bg-transparent"
          />
        )}
      </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-stretch">
          <section className="order-2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs lg:mt-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {chartRange === 'daily'
                    ? 'Daily spending'
                    : chartRange === 'weekly'
                      ? 'Weekly spending'
                      : 'Monthly spending'}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  {chartRange === 'daily'
                    ? 'Daily totals in'
                    : chartRange === 'weekly'
                      ? 'Spending by week in'
                      : 'Total group spend and your share for'} {formattedMonthLabel}
                </p>
              </div>
              <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Spending chart period">
                {['daily', 'weekly', 'monthly'].map((range) => (
                  <button
                    key={range}
                    type="button"
                    aria-pressed={chartRange === range}
                    onClick={() => setChartRange(range)}
                    className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold capitalize transition-colors ${
                      chartRange === range ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <SpendingBars data={periodSpending} currency="INR" />
          </section>

          <section className="order-1 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <PieChart size={16} className="text-slate-700" />
                <h2 className="text-sm font-bold text-slate-900">Monthly category mix</h2>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Your share by category · {formattedMonthLabel}</p>
            </div>
            {stats.categoryList.length ? (
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
                <div
                  className="chart-donut-rotate relative h-40 w-40 flex-shrink-0 rounded-full"
                  style={{
                    background: `conic-gradient(${(() => {
                      let start = 0;
                      return stats.categoryList.map((category) => {
                        const end = start + Number(category.percentage);
                        const segment = `${CATEGORY_CHART_COLORS[category.name] || CATEGORY_CHART_COLORS.Other} ${start}% ${end}%`;
                        start = end;
                        return segment;
                      }).join(', ') || '#e2e8f0 0% 100%';
                    })()})`,
                  }}
                  role="img"
                  aria-label={`Category breakdown totaling ${formatCurrency(stats.yourShareTotal)}: ${stats.categoryList.map((category) => `${category.name} ${category.percentage}%`).join(', ')}`}
                >
                  <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Your share</span>
                    <span className="mt-0.5 max-w-full truncate px-1 font-mono text-sm font-bold text-slate-900">
                      {formatCurrency(stats.yourShareTotal, 'INR', 0)}
                    </span>
                  </div>
                </div>
                <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-1">
                  {stats.categoryList.map((category) => (
                    <li key={category.name} className="flex min-w-0 items-center gap-2 text-[11px]">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                        style={{ backgroundColor: CATEGORY_CHART_COLORS[category.name] || CATEGORY_CHART_COLORS.Other }}
                      />
                      <span className="min-w-0 flex-1 truncate text-slate-600">{category.name}</span>
                      <span className="font-semibold text-slate-800">{category.percentage}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl bg-slate-50/60 px-4 py-5 text-center sm:flex-row sm:gap-5 sm:text-left">
                <div
                  className="relative mb-3 flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full sm:mb-0"
                  style={{
                    background: 'conic-gradient(#203b27 0deg 90deg, #a5e8b3 90deg 180deg, #5a9f58 180deg 270deg, #dbe5dc 270deg 360deg)',
                  }}
                  role="img"
                  aria-label="No category spending data for this month"
                >
                  <div className="absolute inset-[19%] flex flex-col items-center justify-center rounded-full bg-white text-center">
                    <PieChart size={17} className="text-slate-300" />
                    <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">No spend</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">No category data yet</p>
                  <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
                    Your monthly category breakdown will appear here after you add an expense.
                  </p>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {selectedBreakdown &&
        createPortal(
          <div
            className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
            onClick={() => setSelectedBreakdown(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="spending-breakdown-title"
              className="app-modal-surface relative z-[121] flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3.5">
                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <CalendarDays size={13} /> {formattedMonthLabel}
                  </p>
                  <h3
                    id="spending-breakdown-title"
                    className="text-base font-bold text-slate-900"
                  >
                    {selectedBreakdown.title}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-emerald-700">
                    ₹{breakdownTotal.toFixed(2)} · {breakdownExpenses.length} expense
                    {breakdownExpenses.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBreakdown(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close spending details"
                >
                  <X size={16} />
                </button>
              </header>
              <div className="breakdown-scrollbar min-h-0 flex-1 overflow-y-auto pt-3">
                {breakdownExpenses.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">
                    No matching expenses for this month.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {breakdownExpenses
                      .slice()
                      .sort((first, second) => (second.date || '').localeCompare(first.date || ''))
                      .map((expense) => {
                        const groupName =
                          groups.find((group) => group.id === expense.groupId)?.name || 'Group';
                        const payerName =
                          expense.paidBy === user?.id ? 'Paid by you' : 'Paid by member';
                        return (
                          <li
                            key={expense.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {expense.title || expense.category || 'Expense'}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                {groupName} · {expense.category || 'Other'} · {payerName}
                              </p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className="block font-mono text-xs font-bold text-slate-900">
                                ₹
                                {(selectedBreakdown.type === 'share' ||
                                selectedBreakdown.type === 'category'
                                  ? parseFloat(expense.splits?.[userId]) || 0
                                  : parseFloat(expense.totalAmount) || 0
                                ).toFixed(2)}
                              </span>
                              {(selectedBreakdown.type === 'share' ||
                                selectedBreakdown.type === 'category') && (
                                <span className="block text-[10px] text-slate-400">
                                  of ₹{(parseFloat(expense.totalAmount) || 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </section>
          </div>,
          document.body
        )}
    </div>
  );
}