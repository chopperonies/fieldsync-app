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
};

// Ordered roughly left-to-right for the pipeline strip.
export const STATUS_META: Meta[] = [
  { key: 'quoted',      label: 'Quoted',      icon: 'document-text-outline', tone: 'stageIndigo' },
  { key: 'scheduled',   label: 'Scheduled',   icon: 'calendar-outline',      tone: 'stageBlue'   },
  { key: 'on_the_way',  label: 'On the way',  icon: 'navigate-outline',      tone: 'stagePurple' },
  { key: 'in_progress', label: 'In progress', icon: 'construct-outline',     tone: 'stageCyan'   },
  { key: 'on_hold',     label: 'On hold',     icon: 'pause-circle-outline',  tone: 'stageAmber'  },
  { key: 'complete',    label: 'Complete',    icon: 'checkmark-circle-outline', tone: 'stageGreen' },
  { key: 'invoiced',    label: 'Invoiced',    icon: 'receipt-outline',       tone: 'stagePurple' },
  { key: 'canceled',    label: 'Canceled',    icon: 'close-circle-outline',  tone: 'danger'      },
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
