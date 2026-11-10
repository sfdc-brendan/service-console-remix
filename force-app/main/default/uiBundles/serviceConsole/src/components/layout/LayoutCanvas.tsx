import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns2,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  PanelTopClose,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLayout } from '@/context/layoutContext';
import {
  REGION_KEYS,
  REGION_LABEL,
  TEMPLATE_REGIONS,
  hidePanel,
  movePanel,
  nudgePanel,
  prefsFor,
  setPanelPrefs,
  visibleRegions,
  type LayoutSpec,
  type PageLayout,
  type PanelMeta,
  type RegionKey,
} from '@/layout/layoutModel';
import { cn } from '@/lib/utils';

type RegionItems = Record<RegionKey, string[]>;

const REGION_DROP_PREFIX = 'region:';

function regionDropId(region: RegionKey): string {
  return `${REGION_DROP_PREFIX}${region}`;
}

function toRegionItems(layout: PageLayout): RegionItems {
  const items: RegionItems = { left: [], main: [], right: [] };
  for (const { region, ids } of visibleRegions(layout)) {
    items[region] = ids;
  }
  return items;
}

function regionContaining(
  items: RegionItems,
  id: UniqueIdentifier
): RegionKey | null {
  const key = String(id);
  if (key.startsWith(REGION_DROP_PREFIX)) {
    return REGION_KEYS.find(region => regionDropId(region) === key) ?? null;
  }
  return REGION_KEYS.find(region => items[region].includes(key)) ?? null;
}

function gridAttributes(layout: PageLayout, editing: boolean) {
  return {
    'data-template': layout.template,
    'data-left': layout.leftWidth,
    'data-right': layout.rightWidth,
    'data-density': layout.density,
    'data-sticky': String(layout.stickyRails),
    'data-editing': String(editing),
  };
}

function CollapsedSlot({
  meta,
  children,
}: {
  meta: PanelMeta;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = meta.icon;
  if (open) {
    return (
      <div className="space-y-1">
        {children}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <PanelTopClose className="size-3.5" aria-hidden="true" /> Collapse{' '}
          {meta.label}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-sm font-semibold">{meta.label}</span>
      <ChevronDown
        className="size-4 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

function PanelMenu({
  layout,
  meta,
  onChange,
}: {
  layout: PageLayout;
  meta: PanelMeta;
  onChange: (change: (l: PageLayout) => PageLayout) => void;
}) {
  const prefs = prefsFor(layout, meta.id);
  const items = toRegionItems(layout);
  const region = regionContaining(items, meta.id);
  const index = region ? items[region].indexOf(meta.id) : -1;
  const count = region ? items[region].length : 0;
  const targets = TEMPLATE_REGIONS[layout.template].filter(r => r !== region);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${meta.label} options`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {meta.label}
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={index <= 0}
          onSelect={() => onChange(l => nudgePanel(l, meta.id, -1))}
        >
          <ArrowUp className="size-4" aria-hidden="true" /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index < 0 || index >= count - 1}
          onSelect={() => onChange(l => nudgePanel(l, meta.id, 1))}
        >
          <ArrowDown className="size-4" aria-hidden="true" /> Move down
        </DropdownMenuItem>
        {targets.map(target => (
          <DropdownMenuItem
            key={target}
            onSelect={() => onChange(l => movePanel(l, meta.id, target))}
          >
            <Columns2 className="size-4" aria-hidden="true" /> Move to{' '}
            {REGION_LABEL[target].toLowerCase()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.span === 'half'}
          onCheckedChange={checked =>
            onChange(l =>
              setPanelPrefs(l, meta.id, { span: checked ? 'half' : 'full' })
            )
          }
        >
          Half width (wide columns)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.collapsed}
          onCheckedChange={checked =>
            onChange(l => setPanelPrefs(l, meta.id, { collapsed: checked }))
          }
        >
          Start collapsed
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-negative focus:text-negative"
          onSelect={() => onChange(l => hidePanel(l, meta.id))}
        >
          <EyeOff className="size-4" aria-hidden="true" /> Hide panel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditableSlot({
  meta,
  layout,
  content,
  onChange,
}: {
  meta: PanelMeta;
  layout: PageLayout;
  content: ReactNode;
  onChange: (change: (l: PageLayout) => PageLayout) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: meta.id });
  const prefs = prefsFor(layout, meta.id);
  const Icon = meta.icon;
  return (
    <div
      ref={setNodeRef}
      className={cn('layout-slot sortable-slot', isDragging && 'opacity-35')}
      data-span={prefs.span}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="rounded-2xl border-2 border-dashed border-ai/35 bg-ai/[0.03] p-1.5 transition-colors hover:border-ai/70">
        <div className="flex items-center gap-1 px-1 pb-1.5">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${meta.label}`}
            className="flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-ai/10 hover:text-ai active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
          <Icon className="size-4 text-ai" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {meta.label}
          </span>
          {prefs.span === 'half' ? (
            <span className="rounded-full bg-ai/12 px-2 py-0.5 text-[10px] font-semibold text-ai">
              Half
            </span>
          ) : null}
          {prefs.collapsed ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Collapsed
            </span>
          ) : null}
          <PanelMenu layout={layout} meta={meta} onChange={onChange} />
        </div>
        <div
          inert
          className="pointer-events-none max-h-72 overflow-hidden rounded-xl mask-b-from-60% select-none"
        >
          {content ?? (
            <div className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-center text-xs text-muted-foreground">
              {meta.conditional ?? meta.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableRegion({
  region,
  children,
  empty,
}: {
  region: RegionKey;
  children: ReactNode;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: regionDropId(region) });
  return (
    <div
      ref={setNodeRef}
      data-region={region}
      className={cn(
        'layout-region min-h-40 rounded-3xl p-2 ring-1 ring-ai/15 transition-colors',
        isOver && 'bg-ai/5 ring-2 ring-ai/50'
      )}
    >
      <p className="layout-slot px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ai/80">
        {REGION_LABEL[region]}
      </p>
      {children}
      {empty ? (
        <p className="layout-slot rounded-2xl border-2 border-dashed border-ai/25 px-4 py-10 text-center text-sm text-muted-foreground">
          Drag panels here
        </p>
      ) : null}
    </div>
  );
}

function EditableCanvas({
  spec,
  layout,
  slots,
  className,
}: {
  spec: LayoutSpec;
  layout: PageLayout;
  slots: Partial<Record<string, ReactNode>>;
  className?: string;
}) {
  const { update } = useLayout();
  const [preview, setPreview] = useState<RegionItems | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const metaById = useMemo(
    () => new Map(spec.panels.map(panel => [panel.id, panel])),
    [spec.panels]
  );
  const items = preview ?? toRegionItems(layout);
  const active = TEMPLATE_REGIONS[layout.template];
  const change = (fn: (l: PageLayout) => PageLayout) => update(spec.page, fn);
  const labelOf = (id: UniqueIdentifier) =>
    metaById.get(String(id))?.label ?? String(id);
  const regionLabel = (id: UniqueIdentifier | undefined) => {
    const region = id === undefined ? null : regionContaining(items, id);
    return region ? REGION_LABEL[region].toLowerCase() : 'the page';
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${labelOf(a.id)}.`,
    onDragOver: ({ active: a, over }) =>
      over
        ? `${labelOf(a.id)} is over the ${regionLabel(over.id)}.`
        : `${labelOf(a.id)} is not over a column.`,
    onDragEnd: ({ active: a, over }) =>
      over
        ? `${labelOf(a.id)} dropped in the ${regionLabel(over.id)}.`
        : `${labelOf(a.id)} returned to its place.`,
    onDragCancel: ({ active: a }) => `Moving ${labelOf(a.id)} was cancelled.`,
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    setActiveId(String(a.id));
    setPreview(toRegionItems(layout));
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) {
      return;
    }
    setPreview(prev => {
      const current = prev ?? toRegionItems(layout);
      const from = regionContaining(current, a.id);
      const to = regionContaining(current, over.id);
      if (!from || !to || from === to) {
        return current;
      }
      const id = String(a.id);
      const target = current[to].filter(item => item !== id);
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex < 0 ? target.length : overIndex, 0, id);
      return {
        ...current,
        [from]: current[from].filter(item => item !== id),
        [to]: target,
      };
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const current = preview ?? toRegionItems(layout);
    setActiveId(null);
    setPreview(null);
    if (!over) {
      return;
    }
    const id = String(a.id);
    const region = regionContaining(current, id);
    if (!region) {
      return;
    }
    const list = current[region];
    const overIndex = list.indexOf(String(over.id));
    const finalIndex = overIndex < 0 ? list.indexOf(id) : overIndex;
    const reordered = list.filter(item => item !== id);
    reordered.splice(finalIndex, 0, id);
    const next: RegionItems = { ...current, [region]: reordered };
    change(l => ({
      ...l,
      regions: { left: next.left, main: next.main, right: next.right },
    }));
  };

  const activeMeta = activeId ? metaById.get(activeId) : null;
  const ActiveIcon = activeMeta?.icon;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setPreview(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a panel, press Space or Enter, use the arrow keys to move it between positions and columns, then press Space or Enter again to drop it. Press Escape to cancel.',
        },
      }}
    >
      <div
        className={cn('layout-grid', className)}
        {...gridAttributes(layout, true)}
      >
        {active.map(region => {
          const ids = items[region].filter(id => metaById.has(id));
          return (
            <SortableContext
              key={region}
              id={region}
              items={ids}
              strategy={verticalListSortingStrategy}
            >
              <EditableRegion region={region} empty={ids.length === 0}>
                {ids.map(id => {
                  const meta = metaById.get(id);
                  return meta ? (
                    <EditableSlot
                      key={id}
                      meta={meta}
                      layout={layout}
                      content={slots[id]}
                      onChange={change}
                    />
                  ) : null;
                })}
              </EditableRegion>
            </SortableContext>
          );
        })}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {activeMeta && ActiveIcon ? (
          <div className="flex w-72 items-center gap-3 rounded-2xl border-2 border-ai bg-card px-4 py-3 shadow-2xl">
            <GripVertical className="size-4 text-ai" aria-hidden="true" />
            <ActiveIcon className="size-4 text-ai" aria-hidden="true" />
            <span className="truncate text-sm font-semibold">
              {activeMeta.label}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Renders a page's panels according to the saved (or draft) admin layout. Pass every panel's element in
 * `slots`; pass null when a panel has nothing to show right now (for example live-only panels).
 */
export function LayoutCanvas<Id extends string>({
  spec,
  slots,
  className,
}: {
  spec: LayoutSpec<Id>;
  slots: Record<Id, ReactNode>;
  className?: string;
}) {
  const { register, layoutFor, editing } = useLayout();
  useEffect(() => register(spec), [register, spec]);
  const layout = layoutFor(spec);
  const slotMap: Partial<Record<string, ReactNode>> = slots;

  if (editing) {
    return (
      <EditableCanvas
        spec={spec}
        layout={layout}
        slots={slotMap}
        className={className}
      />
    );
  }

  const metaById = new Map<string, PanelMeta>(
    spec.panels.map(panel => [panel.id, panel])
  );
  return (
    <div
      className={cn('layout-grid', className)}
      {...gridAttributes(layout, false)}
    >
      {visibleRegions(layout).map(({ region, ids }) => (
        <div
          key={region}
          data-region={region}
          className="layout-region stagger"
        >
          {ids.map(id => {
            const meta = metaById.get(id);
            const content = slotMap[id];
            if (
              !meta ||
              content === null ||
              content === undefined ||
              content === false
            ) {
              return null;
            }
            const prefs = prefsFor(layout, id);
            return (
              <div key={id} className="layout-slot" data-span={prefs.span}>
                {prefs.collapsed ? (
                  <CollapsedSlot meta={meta}>{content}</CollapsedSlot>
                ) : (
                  content
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
