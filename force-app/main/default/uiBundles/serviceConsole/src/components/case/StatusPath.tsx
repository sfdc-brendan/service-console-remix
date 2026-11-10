import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { CASE_STATUSES, type CaseStatus } from '@/api/console/consoleApi';
import { cn } from '@/lib/utils';

function currentTone(step: CaseStatus): string {
  if (step === 'Escalated') {
    return 'bg-negative ring-negative/20';
  }
  if (step === 'Closed') {
    return 'bg-positive ring-positive/20';
  }
  return 'bg-ink ring-ink/15';
}

export function StatusPath({
  status,
  disabled,
  onSelect,
}: {
  status: string;
  disabled?: boolean;
  onSelect: (status: CaseStatus) => void;
}) {
  const currentIndex = CASE_STATUSES.findIndex(s => s === status);
  return (
    <ol
      className="flex items-center gap-1 overflow-x-auto"
      aria-label="Case status"
    >
      {CASE_STATUSES.map((step, index) => {
        const complete = currentIndex > index;
        const current = currentIndex === index;
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className={cn(
                  'h-px min-w-3 flex-1',
                  complete || current ? 'bg-case/40' : 'bg-border'
                )}
              />
            ) : null}
            <li className="shrink-0">
              <button
                type="button"
                disabled={disabled || current}
                onClick={() => onSelect(step)}
                aria-current={current ? 'step' : undefined}
                title={
                  current ? `Current status: ${step}` : `Set status to ${step}`
                }
                className={cn(
                  'group flex items-center gap-2 rounded-full px-2 py-1 text-xs transition-colors disabled:cursor-default focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  !current && 'hover:bg-accent'
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full',
                    current && cn('ring-4', currentTone(step)),
                    complete && 'bg-case text-white',
                    !current &&
                      !complete &&
                      'border border-muted-foreground/40 bg-card group-hover:border-foreground/60'
                  )}
                  aria-hidden="true"
                >
                  {complete ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap',
                    current
                      ? 'font-semibold text-foreground'
                      : complete
                        ? 'text-case'
                        : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {step}
                </span>
              </button>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
