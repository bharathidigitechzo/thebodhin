/**
 * Timetable rules (pure, server-safe): clash detection for classes and weekly slots, and week views.
 * The same rules must run on the server when the backend is connected (see docs/TIMETABLE.md).
 */
import type { Batch, ClassSession, Slot } from './batch';

export interface Span { start: number; end: number }
export const spanOf = (s: { startsAt: string; endsAt: string }): Span => ({ start: new Date(s.startsAt).getTime(), end: new Date(s.endsAt).getTime() });
/** Half-open intervals: a class ending at 7:00 does not clash with one starting at 7:00. */
export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Pairs of weekly slots in one batch that overlap on the same day (indexes into `slots`). */
export function slotClashes(slots: Slot[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++)
      if (slots[i].day === slots[j].day && mins(slots[i].start) < mins(slots[j].end) && mins(slots[j].start) < mins(slots[i].end)) out.push([i, j]);
  return out;
}

/** Who teaches a class: the instructor chosen when scheduling, else the batch's first instructor. */
export const instructorOf = (s: ClassSession, batches: Batch[]) => s.instructorId ?? batches.find((b) => b.id === s.batchId)?.instructorIds[0] ?? null;

export interface Clash { kind: 'batch' | 'instructor'; session: ClassSession }

/**
 * First clash for a proposed class: same batch at an overlapping time, or the same instructor teaching
 * another class (any batch) at an overlapping time. Cancelled and conducted classes never clash.
 */
export function findClash(all: ClassSession[], batches: Batch[], p: { batchId: string; instructorId: string | null; span: Span; excludeId?: string }): Clash | null {
  for (const s of all) {
    if (s.id === p.excludeId || s.status !== 'scheduled' || !overlaps(spanOf(s), p.span)) continue;
    if (s.batchId === p.batchId) return { kind: 'batch', session: s };
    if (p.instructorId && instructorOf(s, batches) === p.instructorId) return { kind: 'instructor', session: s };
  }
  return null;
}

/** Ids of scheduled classes that overlap another scheduled class of the same instructor (for timetable warnings). */
export function instructorClashIds(all: ClassSession[], batches: Batch[]): Set<string> {
  const live = all.filter((s) => s.status === 'scheduled').map((s) => ({ s, who: instructorOf(s, batches), sp: spanOf(s) })).sort((a, b) => a.sp.start - b.sp.start);
  const ids = new Set<string>();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length && live[j].sp.start < live[i].sp.end; j++)
      if (live[i].who && live[i].who === live[j].who && overlaps(live[i].sp, live[j].sp)) { ids.add(live[i].s.id); ids.add(live[j].s.id); }
  return ids;
}

/** Monday 00:00 (local) of the week containing `d`, shifted by `offset` weeks. */
export function weekStart(d: Date, offset = 0) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + offset * 7);
  return x;
}

/** Seven days Mon–Sun, each with the rows that start that day, sorted by time. */
export function weekDays<T extends { startsAt: string }>(rows: T[], start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const items = rows.filter((r) => { const t = new Date(r.startsAt).getTime(); return t >= day.getTime() && t < next.getTime(); }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { date: day, items };
  });
}

export const weekLabel = (start: Date) => {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
};
