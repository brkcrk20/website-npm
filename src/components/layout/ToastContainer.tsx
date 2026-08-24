import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, XCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
          error: <XCircle className="w-5 h-5 text-rose-600 shrink-0" />,
          warning: <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />,
          info: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
        };

        const borders = {
          success: 'border-emerald-200 dark:border-emerald-900',
          error: 'border-rose-200 dark:border-rose-900',
          warning: 'border-amber-200 dark:border-amber-900',
          info: 'border-sky-200 dark:border-sky-900',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-md rounded-2xl border bg-white dark:bg-stone-900 p-3.5 shadow-xl flex items-start gap-3 animate-in ${borders[toast.type]}`}
          >
            {icons[toast.type]}
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100">{toast.title}</h5>
              {toast.description && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-stone-400 hover:text-stone-600 p-0.5 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
