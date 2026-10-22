import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/\./g, '\\.')}=([^;]*)`));
  return match ? decodeURIComponent(match[1] as string) : null;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

export const statusLabel = (status: string): string =>
  ({
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    CHANGES_REQUESTED: 'Changes requested',
    REJECTED: 'Rejected',
    PENDING: 'Pending approval',
    NONE: 'No shortlist',
    DISPATCHED: 'Dispatched',
  })[status] ?? status;

export const statusTone = (status: string): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' =>
  ({
    DRAFT: 'secondary',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    CHANGES_REQUESTED: 'warning',
    REJECTED: 'destructive',
    PENDING: 'warning',
    NONE: 'outline',
    DRAFT_SHORTLIST: 'warning',
    DISPATCHED: 'success',
  })[status] as 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' ?? 'outline';

export const scoreText = (type: string | null, value: number | null, scale: number | null): string => {
  if (value === null || value === undefined) return '—';
  if (type === 'CGPA') return scale ? `${value} / ${scale} CGPA` : `${value} CGPA`;
  return `${value}%`;
};

export const formatMonths = (months: number): string => {
  if (months <= 0) return '0 months';
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr`);
  if (remainder > 0) parts.push(`${remainder} mo`);
  return parts.join(' ');
};

export const employmentTypeLabel = (value: string | null): string =>
  value ? value.replace('_', ' ').toLowerCase().replace(/^\w/, (character) => character.toUpperCase()) : '—';
