import { useEffect, useId, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Eye,
  PanelLeft,
  PanelRight,
  PanelTop,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLayout } from '@/context/layoutContext';
import {
  COLUMN_WIDTHS,
  DENSITIES,
  HEADER_FIELDS,
  HEADER_STATES,
  TEMPLATE_REGIONS,
  TEMPLATES,
  hidePanel,
  nudgeHeaderStat,
  setHeader,
  setHeaderField,
  showPanel,
  toggleHeaderStat,
  withTemplate,
  type ColumnWidth,
  type Density,
  type HeaderField,
  type HeaderLayout,
  type HeaderState,
  type LayoutSpec,
  type LayoutTemplate,
  type PageLayout,
} from '@/layout/layoutModel';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TEMPLATE_META: Record<
  LayoutTemplate,
  { label: string; icon: LucideIcon }
> = {
  single: { label: 'Single column', icon: Square },
  'main-right': { label: 'Main with right sidebar', icon: PanelRight },
  'left-main': { label: 'Left sidebar with main', icon: PanelLeft },
  three: { label: 'Three columns', icon: Columns3 },
};

const WIDTH_LABEL: Record<ColumnWidth, string> = {
  narrow: 'Narrow',
  medium: 'Medium',
  wide: 'Wide',
};
const DENSITY_LABEL: Record<Density, string> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
};

function Segmented<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-45')}>
      <p id={id} className="text-xs font-medium">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1"
      >
        {options.map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              value === option
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColumnsPopover({
  layout,
  onChange,
}: {
  layout: PageLayout;
  onChange: (fn: (l: PageLayout) => PageLayout) => void;
}) {
  const regions = TEMPLATE_REGIONS[layout.template];
  const stickyId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-72 space-y-4">
        <Segmented
          label="Left column width"
          value={layout.leftWidth}
          options={COLUMN_WIDTHS}
          labels={WIDTH_LABEL}
          disabled={!regions.includes('left')}
          onChange={leftWidth => onChange(l => ({ ...l, leftWidth }))}
        />
        <Segmented
          label="Right column width"
          value={layout.rightWidth}
          options={COLUMN_WIDTHS}
          labels={WIDTH_LABEL}
          disabled={!regions.includes('right')}
          onChange={rightWidth => onChange(l => ({ ...l, rightWidth }))}
        />
        <Segmented
          label="Spacing"
          value={layout.density}
          options={DENSITIES}
          labels={DENSITY_LABEL}
          onChange={density => onChange(l => ({ ...l, density }))}
        />
        <label htmlFor={stickyId} className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id={stickyId}
            checked={layout.stickyRails}
            onCheckedChange={checked =>
              onChange(l => ({ ...l, stickyRails: checked === true }))
            }
          />
          <span>
            <span className="block text-xs font-medium">Sticky sidebars</span>
            <span className="block text-xs text-muted-foreground">
              Side columns scroll on their own and stay in view on wide screens.
            </span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}

const HEADER_STATE_LABEL: Record<HeaderState, string> = {
  expanded: 'Expanded',
  compact: 'Compact',
};

const HEADER_FIELD_META: Record<
  HeaderField,
  { label: string; description: string }
> = {
  date: { label: 'Date', description: "Today's date above the greeting." },
  headline: {
    label: 'AI headline',
    description: 'One-line focus summary for the day.',
  },
  presence: {
    label: 'Presence control',
    description: 'Lets agents change their Omni-Channel status.',
  },
};

function BannerPopover({
  spec,
  header,
  onChange,
}: {
  spec: LayoutSpec;
  header: HeaderLayout;
  onChange: (fn: (l: PageLayout) => PageLayout) => void;
}) {
  const autoId = useId();
  const stats = spec.header?.stats ?? [];
  const visible = header.stats.flatMap(
    id => stats.find(stat => stat.id === id) ?? []
  );
  const hidden = stats.filter(stat => !header.stats.includes(stat.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
        >
          <PanelTop className="size-4" aria-hidden="true" /> Banner
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="max-h-[70vh] w-80 space-y-4 overflow-y-auto"
      >
        <div className="space-y-1.5">
          <Segmented
            label="Default state"
            value={header.defaultState}
            options={HEADER_STATES}
            labels={HEADER_STATE_LABEL}
            onChange={defaultState =>
              onChange(l => setHeader(l, { defaultState }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Previewed on the page while you edit. Agents can still collapse or
            expand it for themselves.
          </p>
        </div>
        <label htmlFor={autoId} className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id={autoId}
            checked={header.autoCollapse}
            onCheckedChange={checked =>
              onChange(l => setHeader(l, { autoCollapse: checked === true }))
            }
          />
          <span>
            <span className="block text-xs font-medium">
              Auto-collapse on scroll
            </span>
            <span className="block text-xs text-muted-foreground">
              Shows the compact bar at the top once the full banner scrolls
              away.
            </span>
          </span>
        </label>

        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs font-medium">Show</legend>
          {HEADER_FIELDS.map(field => {
            const inputId = `banner-field-${field}`;
            return (
              <label
                key={field}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent/60"
              >
                <Checkbox
                  id={inputId}
                  checked={header.show[field]}
                  onCheckedChange={checked =>
                    onChange(l => setHeaderField(l, field, checked === true))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {HEADER_FIELD_META[field].label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {HEADER_FIELD_META[field].description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs font-medium">Stats</legend>
          <ul className="space-y-0.5">
            {[...visible, ...hidden].map(stat => {
              const Icon = stat.icon;
              const checked = header.stats.includes(stat.id);
              const index = header.stats.indexOf(stat.id);
              const inputId = `banner-stat-${stat.id}`;
              return (
                <li
                  key={stat.id}
                  className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent/60"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={value =>
                      onChange(l =>
                        toggleHeaderStat(l, spec, stat.id, value === true)
                      )
                    }
                    className="mt-0.5"
                  />
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <label htmlFor={inputId} className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {stat.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {stat.description}
                    </span>
                  </label>
                  {checked ? (
                    <span className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index <= 0}
                        onClick={() =>
                          onChange(l => nudgeHeaderStat(l, stat.id, -1))
                        }
                        aria-label={`Move ${stat.label} earlier`}
                      >
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index >= header.stats.length - 1}
                        onClick={() =>
                          onChange(l => nudgeHeaderStat(l, stat.id, 1))
                        }
                        aria-label={`Move ${stat.label} later`}
                      >
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

function PanelsPopover({
  spec,
  layout,
  onChange,
}: {
  spec: LayoutSpec;
  layout: PageLayout;
  onChange: (fn: (l: PageLayout) => PageLayout) => void;
}) {
  const hidden = new Set(layout.hidden);
  const visibleCount =
    spec.panels.length - spec.panels.filter(p => hidden.has(p.id)).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
        >
          <Eye className="size-4" aria-hidden="true" /> Panels
          <span className="rounded-full bg-white/15 px-1.5 font-mono text-[10px]">
            {visibleCount}/{spec.panels.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-80 p-2">
        <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
          Choose which panels appear on this page. Drag them on the page to
          arrange.
        </p>
        <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
          {spec.panels.map(panel => {
            const Icon = panel.icon;
            const checked = !hidden.has(panel.id);
            const inputId = `panel-toggle-${panel.id}`;
            return (
              <li key={panel.id}>
                <label
                  htmlFor={inputId}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/60"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={value =>
                      onChange(l =>
                        value === true
                          ? showPanel(l, panel.id, spec)
                          : hidePanel(l, panel.id)
                      )
                    }
                    className="mt-0.5"
                  />
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {panel.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {panel.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function LayoutEditorBar() {
  const {
    editing,
    activeSpec,
    layoutFor,
    update,
    undo,
    canUndo,
    isDirty,
    save,
    resetToDefault,
    savedMeta,
    saving,
    requestExit,
  } = useLayout();
  const [confirmReset, setConfirmReset] = useState(false);
  const page = activeSpec?.page ?? null;

  useEffect(() => {
    if (!editing || !page) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            ['INPUT', 'TEXTAREA'].includes(target.tagName))
        ) {
          return;
        }
        event.preventDefault();
        undo(page);
      } else if (key === 's') {
        event.preventDefault();
        if (isDirty(page)) {
          void save(page);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, page, undo, save, isDirty]);

  if (!editing) {
    return null;
  }

  if (!activeSpec || !page) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center pl-16">
        <div className="ink-panel animate-rise pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl">
          <p className="text-sm text-white/80">
            This page has no customizable layout. Open Home, a record, or the
            Command Center.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={requestExit}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  const layout = layoutFor(activeSpec);
  const onChange = (fn: (l: PageLayout) => PageLayout) => update(page, fn);
  const dirty = isDirty(page);
  const meta = savedMeta(page);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pl-20">
        <div
          role="toolbar"
          aria-label={`Edit ${activeSpec.label} layout`}
          className="ink-panel animate-rise pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5 shadow-2xl ring-1 ring-white/10"
        >
          <div className="min-w-0 px-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {activeSpec.label} layout
              {dirty ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-voice/25 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <span
                    className="size-1.5 rounded-full bg-voice"
                    aria-hidden="true"
                  />{' '}
                  Unsaved
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-white/55">
              {meta?.updatedAt
                ? `Saved ${relativeTime(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}`
                : 'Using the default layout'}
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Column template"
            className="flex gap-0.5 rounded-xl bg-white/10 p-1"
          >
            {TEMPLATES.map(template => {
              const { label, icon: Icon } = TEMPLATE_META[template];
              const selected = layout.template === template;
              return (
                <button
                  key={template}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  title={label}
                  onClick={() => onChange(l => withTemplate(l, template))}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none',
                    selected
                      ? 'bg-white text-ink'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <ColumnsPopover layout={layout} onChange={onChange} />
          <PanelsPopover
            spec={activeSpec}
            layout={layout}
            onChange={onChange}
          />
          {activeSpec.header && layout.header ? (
            <BannerPopover
              spec={activeSpec}
              header={layout.header}
              onChange={onChange}
            />
          ) : null}

          <span
            className="hidden h-6 w-px bg-white/15 sm:block"
            aria-hidden="true"
          />

          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => undo(page)}
            disabled={!canUndo(page)}
            aria-label="Undo"
            title="Undo (⌘Z)"
          >
            <Undo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setConfirmReset(true)}
            disabled={saving}
            aria-label="Reset to default layout"
            title="Reset to default"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={requestExit}
            disabled={saving}
          >
            <X className="size-4" aria-hidden="true" /> Done
          </Button>
          <Button
            size="sm"
            className="bg-voice text-white hover:bg-voice/90"
            onClick={() => void save(page)}
            disabled={!dirty || saving}
            title="Save (⌘S)"
          >
            <Save className="size-4" aria-hidden="true" />{' '}
            {saving ? 'Saving…' : 'Save for everyone'}
          </Button>
        </div>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reset {activeSpec.label} to the default layout?
            </DialogTitle>
            <DialogDescription>
              This removes the saved layout for everyone and discards your
              unsaved changes on this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await resetToDefault(page);
                setConfirmReset(false);
              }}
              disabled={saving}
            >
              Reset layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
