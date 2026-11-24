import React, { useState } from 'react';

export function MonthlyFeeBarChart({
  data,
}: {
  data: Array<{ month: string; collected: number }>;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(1000, ...data.map((d) => Number(d.collected) || 0));

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        No monthly fee collection data recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative h-56 flex items-end gap-3 pt-8 pb-2 pl-14 pr-2 border-b border-slate-200 dark:border-slate-800">
        <div className="absolute inset-x-0 top-8 bottom-2 flex flex-col justify-between pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-mono-tabular text-slate-400 text-right shrink-0">
              {Math.round(maxVal / 1000)}k
            </span>
            <div className="flex-1 border-t border-dashed border-slate-200/80 dark:border-slate-800/80" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-mono-tabular text-slate-400 text-right shrink-0">
              {Math.round(maxVal / 2000)}k
            </span>
            <div className="flex-1 border-t border-dashed border-slate-200/80 dark:border-slate-800/80" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-mono-tabular text-slate-400 text-right shrink-0">
              0
            </span>
            <div className="flex-1 border-t border-dashed border-slate-200/80 dark:border-slate-800/80" />
          </div>
        </div>
        {data.map((item, idx) => {
          const pct = Math.max(6, Math.round((Number(item.collected) / maxVal) * 100));
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={item.month}
              className="flex-1 flex flex-col items-center justify-end h-full group relative"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <div className="absolute -top-1 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-mono-tabular whitespace-nowrap shadow-md z-10">
                  PKR {Number(item.collected).toLocaleString()}
                </div>
              )}
              <div className="w-full max-w-[44px] flex flex-col justify-end h-full">
                <div
                  style={{ height: `${pct}%` }}
                  className={`w-full rounded-t-md transition-all ${
                    isHovered
                      ? 'bg-blue-600 dark:bg-blue-400'
                      : 'bg-[#0F2942] dark:bg-blue-600/85'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 pl-14 pr-2">
        {data.map((item) => (
          <div key={item.month} className="flex-1 text-center text-xs text-slate-500 dark:text-slate-400 font-mono-tabular truncate">
            {item.month}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EnrollmentBarList({
  data,
}: {
  data: Array<{ label: string; category: string; count: number }>;
}) {
  const maxCount = Math.max(1, ...data.map((d) => Number(d.count) || 0));

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        No enrollment statistics available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const pct = Math.max(4, Math.round((Number(row.count) / maxCount) * 100));
        return (
          <div key={`${row.category}-${row.label}`} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {row.label}
                <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
                  · {row.category === 'course' ? 'Course' : 'Academy'}
                </span>
              </span>
              <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
                {row.count}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                style={{ width: `${pct}%` }}
                className={`h-full rounded-full ${
                  row.category === 'course' ? 'bg-amber-600 dark:bg-amber-500' : 'bg-[#0F2942] dark:bg-blue-500'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
