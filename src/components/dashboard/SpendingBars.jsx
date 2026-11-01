import { useState } from 'react';
import { formatCurrency } from '../../utils/currency';

export default function SpendingBars({ data, currency = 'INR' }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const maximum = Math.max(...data.map((item) => item.total), 0);
  const selectedItem = selectedIndex === null ? null : data[selectedIndex];
  const axisMaximum = maximum > 0 ? maximum : 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600" aria-label="Chart legend">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#203b27]" />
          Total group spending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#a5e8b3]" />
          Your share
        </span>
      </div>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2">
        <div className="relative h-40" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none text-slate-500"
              style={{ top: `${tick * 25}%` }}
            >
              {formatCurrency(axisMaximum * (1 - tick / 4), currency, 0)}
            </span>
          ))}
        </div>
        <div className="relative h-40 border-b border-slate-200">
          {[0, 1, 2, 3, 4].map((line) => (
            <div
              key={line}
              className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
              style={{ top: `${line * 25}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-1 px-1">
          {data.map((item, index) => {
            const totalHeight = maximum ? (item.total / maximum) * 100 : 0;
            const shareHeight = maximum ? (item.share / maximum) * 100 : 0;
            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                aria-pressed={selectedIndex === index}
                aria-label={`${item.detail || item.label}: total group spending ${formatCurrency(item.total, currency, 0)}, your share ${formatCurrency(item.share, currency, 0)}. Tap to show exact values.`}
                onClick={() => setSelectedIndex((selected) => selected === index ? null : index)}
                className={`relative z-10 flex h-full min-w-0 flex-1 items-end justify-center gap-1 rounded-t-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  selectedIndex === index ? 'bg-blue-50/60' : ''
                }`}
                title="Tap to show exact values"
              >
                <div
                  className="chart-bar-rise w-[32%] max-w-5 rounded-t-md bg-[#203b27] transition-colors hover:bg-[#315a3b]"
                  style={{
                    height: `${totalHeight}%`,
                    animationDelay: `${index * 65}ms`,
                  }}
                />
                <div
                  className="chart-bar-rise w-[32%] max-w-5 rounded-t-md bg-[#a5e8b3]"
                  style={{
                    height: `${shareHeight}%`,
                    animationDelay: `${index * 65 + 40}ms`,
                  }}
                />
              </button>
            );
          })}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2">
        <span className="text-right text-[9px] font-medium text-slate-400">Period</span>
        <div className="flex justify-around gap-1">
          {data.map((item, index) => (
            <span key={`${item.label}-${index}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">
              {item.label}
            </span>
          ))}
        </div>
      </div>
      {selectedItem && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[10px]">
          <span className="font-semibold text-slate-700">{selectedItem.detail || selectedItem.label}</span>
          <span className="text-slate-600">
            Total <strong className="text-slate-900">{formatCurrency(selectedItem.total, currency, 0)}</strong>
            <span className="mx-2 text-slate-300">·</span>
            Your share <strong className="text-slate-900">{formatCurrency(selectedItem.share, currency, 0)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
