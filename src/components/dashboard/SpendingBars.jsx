import { formatCurrency } from '../../utils/currency';

export default function SpendingBars({ data, currency = 'INR' }) {
  const maximum = Math.max(...data.map((item) => item.total), 0);

  return (
    <div
      role="img"
      aria-label={`Spending chart: ${data.map((item) => `${item.detail || item.label}, total ${formatCurrency(item.total, currency, 0)}, your share ${formatCurrency(item.share, currency, 0)}`).join('; ')}`}
    >
      <div className="relative h-40 border-b border-slate-200">
        {[0, 1, 2, 3].map((line) => (
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
              <div
                key={`${item.label}-${index}`}
                className="relative z-10 flex h-full min-w-0 flex-1 items-end justify-center gap-1"
                title={`${item.detail || item.label}: ${formatCurrency(item.total, currency, 0)} total, ${formatCurrency(item.share, currency, 0)} your share`}
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
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-around gap-1">
        {data.map((item, index) => (
          <span key={`${item.label}-${index}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
