export const parseMonthIndex = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
};

export const todayMonthIndex = (): number => {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
};

export interface ExperienceLike {
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
}

export const totalExperienceMonths = (experiences: ExperienceLike[]): number => {
  const nowIndex = todayMonthIndex();
  const covered = new Set<number>();

  for (const experience of experiences) {
    const start = parseMonthIndex(experience.startDate);
    if (start === null) continue;
    const end = experience.isCurrent ? nowIndex : parseMonthIndex(experience.endDate ?? '');
    if (end === null) continue;
    const last = Math.max(end, start);
    for (let index = start; index <= last; index += 1) {
      covered.add(index);
    }
  }

  return covered.size;
};

export const formatMonths = (months: number): string => {
  if (months <= 0) return '0 months';
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (remainder > 0) parts.push(`${remainder} month${remainder === 1 ? '' : 's'}`);
  return parts.join(' ');
};
