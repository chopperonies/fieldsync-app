import { Ionicons } from '@expo/vector-icons';
import { Theme } from './theme';

export type JobStatusKey =
  | 'quoted'
  | 'scheduled'
  | 'on_the_way'
  | 'in_progress'
  | 'on_hold'
  | 'complete'
  | 'invoiced'
  | 'canceled';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Meta = {
  key: JobStatusKey;
  label: string;
  icon: IoniconName;
  tone: keyof Pick<Theme, 'stageBlue' | 'stageCyan' | 'stageGreen' | 'stageIndigo' | 'stagePurple' | 'stageAmber' | 'danger'>;
  description: string;
};

// Ordered roughly left-to-right for the pipeline strip.
export const STATUS_META: Meta[] = [
  { key: 'quoted',      label: 'Quoted',      icon: 'document-text-outline',    tone: 'stageIndigo', description: 'Estimate sent. Not on the books yet.' },
  { key: 'scheduled',   label: 'Booked',      icon: 'calendar-outline',         tone: 'stageBlue',   description: 'Sold. Pick an appointment date below.' },
  { key: 'on_the_way',  label: 'On the way',  icon: 'navigate-outline',         tone: 'stagePurple', description: 'Crew is en route to the site.' },
  { key: 'in_progress', label: 'In progress', icon: 'construct-outline',        tone: 'stageCyan',   description: 'Crew on site, clocked in.' },
  { key: 'on_hold',     label: 'On hold',     icon: 'pause-circle-outline',     tone: 'stageAmber',  description: 'Paused. Crew sees a banner until you resume.' },
  { key: 'complete',    label: 'Complete',    icon: 'checkmark-circle-outline', tone: 'stageGreen',  description: 'Work finished. Invoice next.' },
  { key: 'invoiced',    label: 'Invoiced',    icon: 'receipt-outline',          tone: 'stagePurple', description: 'Bill sent. Waiting on payment.' },
  { key: 'canceled',    label: 'Canceled',    icon: 'close-circle-outline',     tone: 'danger',      description: 'Job canceled — no further work scheduled.' },
];

// Legacy aliases we've seen in the DB.
const ALIASES: Record<string, JobStatusKey> = {
  active: 'in_progress',
  done: 'complete',
  cancelled: 'canceled',
};

export function normalizeStatusKey(raw?: string | null): JobStatusKey {
  if (!raw) return 'in_progress';
  const k = String(raw).toLowerCase();
  if (ALIASES[k]) return ALIASES[k];
  const hit = STATUS_META.find(s => s.key === k);
  return hit ? hit.key : 'in_progress';
}

export function statusMeta(raw?: string | null): Meta {
  const key = normalizeStatusKey(raw);
  return STATUS_META.find(s => s.key === key)!;
}

export function statusColor(theme: Theme, raw?: string | null): string {
  const m = statusMeta(raw);
  return theme[m.tone];
}

// Linear progression on the lifecycle. Returns -1 for branch states
// (on_hold, canceled, on_the_way) that don't have a natural before/after.
export const LIFECYCLE_ORDER: JobStatusKey[] = [
  'quoted', 'scheduled', 'in_progress', 'complete', 'invoiced',
];

export function lifecycleIndex(raw?: string | null): number {
  return LIFECYCLE_ORDER.indexOf(normalizeStatusKey(raw));
}
