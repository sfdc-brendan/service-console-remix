import type { Channel, WorkItem } from '@/api/console/consoleApi';

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatMinutes(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s`;
  }
  const minutes = Math.round(totalSeconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function secondsSince(iso: string | null | undefined, now: number): number {
  return iso ? Math.max(0, (now - new Date(iso).getTime()) / 1000) : 0;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) {
    return '';
  }
  const seconds = (now - new Date(iso).getTime()) / 1000;
  if (seconds < 45) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.round(seconds / 3600)}h ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

export function initials(name: string | null | undefined): string {
  if (!name) {
    return '?';
  }
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function channelPath(channel: Channel, sourceRecordId: string | null, caseId: string | null): string | null {
  switch (channel) {
    case 'Voice':
      return sourceRecordId ? `/voice/${sourceRecordId}` : caseId ? `/case/${caseId}` : null;
    case 'Messaging':
      return sourceRecordId ? `/messaging/${sourceRecordId}` : caseId ? `/case/${caseId}` : null;
    case 'Case':
      return caseId ? `/case/${caseId}` : null;
    default: {
      const exhaustive: never = channel;
      return exhaustive;
    }
  }
}

export function workPath(work: Pick<WorkItem, 'channel' | 'sourceRecordId' | 'caseId'>): string | null {
  return channelPath(work.channel, work.sourceRecordId, work.caseId);
}
