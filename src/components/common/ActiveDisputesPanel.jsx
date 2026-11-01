import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

export default function ActiveDisputesPanel({
  disputes,
  groups,
  onOpenDispute,
  compact = false,
  inline = false,
  carousel = false,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionAt, setInteractionAt] = useState(0);
  const touchStart = useRef(null);
  const didSwipe = useRef(false);

  useEffect(() => {
    if (!carousel || disputes.length < 2) return undefined;
    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % disputes.length);
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [carousel, disputes.length, interactionAt]);

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    didSwipe.current = false;
  };

  const handleSwipeEnd = (touch) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !touch) return;

    const deltaX = start.x - touch.clientX;
    const deltaY = start.y - touch.clientY;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    didSwipe.current = true;
    setInteractionAt(Date.now());
    setActiveIndex((index) => (index + (deltaX > 0 ? 1 : -1) + disputes.length) % disputes.length);
    window.setTimeout(() => {
      didSwipe.current = false;
    }, 500);
  };

  const handleTouchEnd = (event) => handleSwipeEnd(event.changedTouches[0]);
  const handleMouseDown = (event) => {
    touchStart.current = { x: event.clientX, y: event.clientY };
    didSwipe.current = false;
  };
  const handleMouseUp = (event) => handleSwipeEnd({ x: event.clientX, y: event.clientY });

  if (!disputes.length) return null;

  if (carousel) {
    const currentIndex = activeIndex % disputes.length;

    return (
      <section
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
        className="mobile-disputes-carousel touch-pan-y overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/90"
        aria-label={`${disputes.length} active dispute${disputes.length === 1 ? '' : 's'}`}
        aria-live="polite"
      >
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {disputes.map((expense, index) => {
            const group = groups.find((item) => item.id === expense.groupId);
            return (
              <button
                key={expense.id}
                type="button"
                onClick={() => {
                  if (didSwipe.current) {
                    didSwipe.current = false;
                    return;
                  }
                  onOpenDispute?.(expense);
                }}
                aria-label={`Open dispute: ${expense.title || 'Expense'}${expense.activeDisputeByName ? `, raised by ${expense.activeDisputeByName}` : ''}`}
                aria-hidden={currentIndex !== index}
                inert={currentIndex !== index}
                className="flex w-full flex-none items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <AlertTriangle size={14} className="flex-none text-amber-700" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold text-slate-900">
                      {expense.title || 'Expense'}{expense.activeDisputeByName ? ` · Raised by ${expense.activeDisputeByName}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">
                      {group?.name || 'Group'} · Tap to resolve in chat
                    </span>
                  </span>
                </span>
                <span className="flex-none rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white">
                  Dispute
                </span>
              </button>
            );
          })}
        </div>
        {disputes.length > 1 && (
          <div className="flex justify-center gap-1 pb-2" aria-label="Dispute carousel position">
            {disputes.map((expense, index) => (
              <span
                key={expense.id}
                className={`h-1 rounded-full transition-all ${
                  currentIndex === index ? 'w-4 bg-amber-700' : 'w-1 bg-amber-300'
                }`}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={inline ? 'mb-3.5' : `rounded-2xl border border-amber-200/80 bg-amber-50/80 ${compact ? 'p-3.5' : 'p-4'}`}>
      {!inline && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-900">
            <AlertTriangle size={14} />
            Active disputes
          </h2>
          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
            {disputes.length}
          </span>
        </div>
      )}
      <div className={inline ? 'space-y-2.5' : 'space-y-1.5'}>
        {disputes.map((expense) => {
          const group = groups.find((item) => item.id === expense.groupId);
          return (
            <button
              key={expense.id}
              type="button"
              onClick={() => onOpenDispute?.(expense)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl text-left transition-all cursor-pointer shadow-sm ${
                inline
                  ? 'overview-dispute-row border border-amber-200/80 bg-transparent p-3 hover:bg-slate-50'
                  : 'gap-2 rounded-xl border border-amber-200/70 bg-white/80 px-3 py-2 hover:bg-white'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-slate-900">
                  {expense.title || 'Expense'}
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">
                  {group?.name || 'Group'}{expense.activeDisputeByName ? ` · raised by ${expense.activeDisputeByName}` : ''}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                <span className="block font-mono text-xs font-bold text-slate-800">
                  {formatCurrency(expense.totalAmount, group?.currency)}
                </span>
                {inline ? (
                  <span className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    <AlertTriangle size={11} />
                    Dispute
                  </span>
                ) : (
                  <ChevronRight size={13} className="text-amber-700" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
