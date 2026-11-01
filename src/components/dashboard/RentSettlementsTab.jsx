import { AlertTriangle, CheckCircle2, Home } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

export default function RentSettlementsTab({
  rents,
  settlements,
  disputes = [],
  groups,
  user,
  getUserName,
  onOpenGroup,
  onOpenDispute,
  mobilePreview = false,
  preview = false,
  showSettlements = true,
  showDisputes = true,
  maxRents,
}) {
  const visibleRents = Number.isFinite(maxRents) ? rents.slice(0, maxRents) : rents;
  const visibleDisputes = showDisputes ? disputes : [];

  const getMonthLabel = (month) => {
    const date = new Date(`${month}-01T00:00:00`);
    return Number.isNaN(date.getTime())
      ? month
      : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <section className={preview ? 'space-y-4' : `mx-auto max-w-[1320px] space-y-5 p-4 pb-20 ${mobilePreview ? '' : 'sm:p-6 lg:p-8'}`}>
      {!preview && <header className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
          {user?.photoDataUrl ? (
            <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (user?.username || 'U').charAt(0).toUpperCase()
          )}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">Rent &amp; Settlements</h1>
          <p className="text-[11px] text-slate-500">Pending rent, disputes, and balances</p>
        </div>
      </header>}

      {rents.length === 0 && (!showSettlements || settlements.length === 0) && visibleDisputes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-12 text-center shadow-xs">
          <CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-600" />
          <p className="text-sm font-bold text-slate-900">All balances settled</p>
          <p className="mt-1 text-xs text-slate-500">
            {showSettlements
              ? 'No pending rent, disputes, or settlements across your spaces.'
              : showDisputes
                ? 'No pending rent or disputes across your spaces.'
                : 'No pending rent across your spaces.'}
          </p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 items-start gap-4 ${!preview && !mobilePreview ? 'xl:grid-cols-12' : ''}`}>
          <div className={`space-y-4 ${preview ? '' : mobilePreview ? 'order-2' : 'order-2 xl:order-1 xl:col-span-8'}`}>
            {rents.length > 0 && (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Rent due</h2>
                  <p className="text-[11px] text-slate-500">Unpaid rent shares</p>
                </div>
                <span className="rounded-lg bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">{rents.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleRents.map((rent) => (
                  <button
                    key={rent.id}
                    type="button"
                    onClick={() => onOpenGroup(rent.groupId, 'members')}
                    className="dues-list-row mx-1 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-amber-50/70"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Home size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-slate-900">
                          {rent.groupName} · {getMonthLabel(rent.month)} rent
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">Open rent details</span>
                      </span>
                    </span>
                    <span className="flex-shrink-0 font-mono text-xs font-extrabold text-amber-800">
                      {formatCurrency(rent.shares?.[user?.id], rent.currency)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

            {showSettlements && settlements.length > 0 && (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Settlements</h2>
                  <p className="text-[11px] text-slate-500">Optimized balances across spaces</p>
                </div>
                <span className="rounded-lg bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">{settlements.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {settlements.map((settlement, index) => {
                  const iOwe = settlement.from === user?.id;
                  const counterparty = getUserName(iOwe ? settlement.to : settlement.from);
                  const currency = groups.find((group) => group.id === settlement.groupId)?.currency;

                  return (
                    <button
                      key={`${settlement.groupId}-${settlement.from}-${settlement.to}-${index}`}
                      type="button"
                      onClick={() => onOpenGroup(settlement.groupId, 'balances')}
                      className="dues-list-row mx-1 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-slate-900">
                          {iOwe ? `To pay ${counterparty}` : `To receive from ${counterparty}`}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">in {settlement.groupName}</span>
                      </span>
                      <span className={`flex-shrink-0 font-mono text-xs font-extrabold ${iOwe ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {iOwe ? '-' : '+'}{formatCurrency(settlement.amount, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          </div>

          {visibleDisputes.length > 0 && (
            <aside className={preview ? '' : mobilePreview ? 'order-1' : 'order-1 xl:sticky xl:top-4 xl:order-2 xl:col-span-4'}>
              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Active disputes</h2>
                    <p className="text-[11px] text-slate-500">Open expense disputes across your spaces</p>
                  </div>
                  <span className="rounded-lg bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">{visibleDisputes.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleDisputes.map((expense) => {
                    const group = groups.find((item) => item.id === expense.groupId);
                    return (
                      <button
                        key={expense.id}
                        type="button"
                        onClick={() => onOpenDispute(expense)}
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
              </section>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
