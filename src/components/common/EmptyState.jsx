export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-white/80 to-emerald-50/60 px-5 text-center ${
        compact ? 'py-4' : 'py-8'
      } ${className}`}
    >
      <div className={`relative flex items-center justify-center ${compact ? 'mb-2 h-14 w-16' : 'mb-3 h-20 w-24'}`} aria-hidden="true">
        <span className={`absolute left-1 top-3 rotate-[-12deg] rounded-xl border border-emerald-100 bg-emerald-50 shadow-sm ${compact ? 'h-10 w-8' : 'h-14 w-10'}`} />
        <span className={`absolute right-1 top-1 rotate-[10deg] rounded-xl border border-blue-100 bg-blue-50 shadow-sm ${compact ? 'h-10 w-8' : 'h-14 w-10'}`} />
        <span className={`relative flex rotate-[-3deg] items-center justify-center rounded-2xl border border-slate-200 bg-white text-blue-600 shadow-md ${compact ? 'h-11 w-10' : 'h-16 w-14'}`}>
          <Icon size={compact ? 19 : 25} strokeWidth={1.8} />
        </span>
        <span className={`absolute bottom-0 right-1 rounded-full border-2 border-white bg-emerald-300 shadow-sm ${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
        <span className={`absolute left-2 top-0 rounded-full bg-amber-300 ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
      </div>
      <h3 className={`font-extrabold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
      {description && (
        <p className={`mt-1 max-w-sm leading-relaxed text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 font-bold text-white shadow-sm transition-colors hover:bg-blue-700 ${
            compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3.5 py-2 text-xs'
          }`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
