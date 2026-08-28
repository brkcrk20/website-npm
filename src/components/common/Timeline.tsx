import React from 'react';
import { TradeEvent, TradeStatus } from '../../types';
import { Check, Clock, AlertCircle, Lock, Truck, ShieldCheck, Award } from 'lucide-react';

interface TimelineProps {
  timeline: TradeEvent[];
  currentStatus: TradeStatus;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  timeline,
  currentStatus,
  className = '',
}) => {
  const stepsMeta = [
    { step: 1, label: 'Teklif', icon: Clock },
    { step: 2, label: 'Kabul', icon: Check },
    { step: 3, label: 'Kilitlendi', icon: Lock },
    { step: 4, label: 'Teslimat', icon: Truck },
    { step: 5, label: 'Onay', icon: ShieldCheck },
    { step: 6, label: 'Tamamlandı', icon: Award },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Horizontal step indicator bar */}
      <div className="relative flex items-center justify-between px-2 py-4">
        {/* Background connector line */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-line -z-0" />

        {stepsMeta.map((s, idx) => {
          const eventItem = timeline.find((e) => e.step === s.step);
          const isCompleted = eventItem?.status === 'completed';
          const isInProgress = eventItem?.status === 'in_progress';
          const isFailed = eventItem?.status === 'failed';

          let circleStyle = 'bg-canvas border-line text-ink-faint';
          if (isCompleted) {
            circleStyle = 'bg-brand border-brand text-on-brand shadow-xs';
          } else if (isInProgress) {
            circleStyle = 'bg-amber-500 border-amber-500 text-on-brand animate-pulse';
          } else if (isFailed) {
            circleStyle = 'bg-danger border-rose-500 text-on-brand';
          }

          return (
            <div key={s.step} className="relative z-10 flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-colors ${circleStyle}`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : s.step}
              </div>
              <span
                className={`text-[10px] font-semibold mt-1.5 ${
                  isCompleted
                    ? 'text-brand-dark font-bold'
                    : isInProgress
                    ? 'text-warn font-bold'
                    : 'text-ink-faint'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Detailed vertical log list */}
      <div className="bg-canvas rounded-2xl p-4 border border-line space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          Takas Süreç Günlüğü
        </h4>
        <div className="space-y-3">
          {timeline.map((evt, idx) => {
            const isCompleted = evt.status === 'completed';
            const isInProgress = evt.status === 'in_progress';
            const isFailed = evt.status === 'failed';

            return (
              <div key={evt.id || idx} className="flex items-start gap-3 text-xs">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                    isCompleted
                      ? 'bg-brand-soft text-brand-dark'
                      : isInProgress
                      ? 'bg-warn-soft text-warn'
                      : isFailed
                      ? 'bg-danger-soft text-danger'
                      : 'bg-line text-ink-soft'
                  }`}
                >
                  {isCompleted ? '✓' : evt.step}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{evt.title}</span>
                    <span className="text-[10px] text-ink-faint">{evt.timestamp}</span>
                  </div>
                  <p className="text-ink-soft mt-0.5">{evt.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
