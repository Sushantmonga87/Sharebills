import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Toast({ toast }) {
  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 right-4 left-4 md:left-auto max-w-sm mx-auto md:mx-0 z-[60] animate-in slide-in-from-bottom-2 duration-150 pointer-events-none">
      <div
        className={`px-3.5 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-semibold border pointer-events-auto ${
          isError
            ? 'bg-rose-950 border-rose-800 text-white'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {isError ? (
          <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
        ) : (
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{toast.message}</span>
        {toast.brandIcon && (
          <img
            src="/sharebills-icon-192.webp"
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
          />
        )}
      </div>
    </div>
  );
}