import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const TableWrap = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('w-full overflow-x-auto rounded-lg border border-border bg-white', className)} {...props} />
);

export const Table = ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
  <table className={cn('w-full border-collapse text-sm', className)} {...props} />
);

export const THead = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('bg-navy-50/70 text-left', className)} {...props} />
);

export const TBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('divide-y divide-border', className)} {...props} />
);

export const TR = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('transition-colors hover:bg-navy-50/40', className)} {...props} />
);

export const TH = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-navy-600', className)} {...props} />
);

export const TD = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 align-middle text-navy-800', className)} {...props} />
);
