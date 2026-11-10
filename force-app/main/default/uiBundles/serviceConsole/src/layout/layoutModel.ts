import type { LucideIcon } from 'lucide-react';

export const PAGE_KEYS = [
  'home',
  'case',
  'voice',
  'messaging',
  'supervisor',
  'contact',
  'account',
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const REGION_KEYS = ['left', 'main', 'right'] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export const TEMPLATES = [
  'single',
  'main-right',
  'left-main',
  'three',
] as const;
export type LayoutTemplate = (typeof TEMPLATES)[number];

export const COLUMN_WIDTHS = ['narrow', 'medium', 'wide'] as const;
export type ColumnWidth = (typeof COLUMN_WIDTHS)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export type PanelSpan = 'full' | 'half';

export interface PanelPrefs {
  collapsed: boolean;
  span: PanelSpan;
}

export const HEADER_STATES = ['expanded', 'compact'] as const;
export type HeaderState = (typeof HEADER_STATES)[number];

export const HEADER_FIELDS = ['date', 'headline', 'presence'] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];

/** Page header (banner) settings. `stats` lists the visible stats in display order. */
export interface HeaderLayout {
  defaultState: HeaderState;
  autoCollapse: boolean;
  show: Record<HeaderField, boolean>;
  stats: string[];
}

export interface PageLayout {
  version: 1;
  template: LayoutTemplate;
  regions: Record<RegionKey, string[]>;
  hidden: string[];
  panels: Record<string, PanelPrefs>;
  leftWidth: ColumnWidth;
  rightWidth: ColumnWidth;
  density: Density;
  stickyRails: boolean;
  /** Present only on pages whose spec declares a header. */
  header?: HeaderLayout;
}

export interface PanelMeta<Id extends string = string> {
  id: Id;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Shown in the editor when the panel has nothing to render right now. */
  conditional?: string;
}

export interface LayoutDefaults<Id extends string = string> {
  template: LayoutTemplate;
  regions: Partial<Record<RegionKey, Id[]>>;
  hidden?: Id[];
  panels?: Partial<Record<Id, Partial<PanelPrefs>>>;
  leftWidth?: ColumnWidth;
  rightWidth?: ColumnWidth;
  density?: Density;
  stickyRails?: boolean;
}

export interface HeaderStatMeta<StatId extends string = string> {
  id: StatId;
  label: string;
  /** Label used on the compact bar's stat chips. */
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export interface HeaderSpec<StatId extends string = string> {
  stats: readonly HeaderStatMeta<StatId>[];
  defaults: {
    defaultState?: HeaderState;
    autoCollapse?: boolean;
    show?: Partial<Record<HeaderField, boolean>>;
    stats: StatId[];
  };
}

export interface LayoutSpec<
  Id extends string = string,
  StatId extends string = string,
> {
  page: PageKey;
  label: string;
  panels: readonly PanelMeta<Id>[];
  defaults: LayoutDefaults<Id>;
  header?: HeaderSpec<StatId>;
}

export const TEMPLATE_REGIONS: Record<LayoutTemplate, RegionKey[]> = {
  single: ['main'],
  'main-right': ['main', 'right'],
  'left-main': ['left', 'main'],
  three: ['left', 'main', 'right'],
};

export const REGION_LABEL: Record<RegionKey, string> = {
  left: 'Left column',
  main: 'Main column',
  right: 'Right column',
};

export const DEFAULT_PREFS: PanelPrefs = { collapsed: false, span: 'full' };

export function defineLayout<
  const Id extends string,
  const StatId extends string = never,
>(spec: LayoutSpec<Id, StatId>): LayoutSpec<Id, StatId> {
  return spec;
}

function defaultHeader(header: HeaderSpec): HeaderLayout {
  const { defaults } = header;
  return {
    defaultState: defaults.defaultState ?? 'expanded',
    autoCollapse: defaults.autoCollapse ?? true,
    show: {
      date: defaults.show?.date ?? true,
      headline: defaults.show?.headline ?? true,
      presence: defaults.show?.presence ?? true,
    },
    stats: [...defaults.stats],
  };
}

function normalizeHeader(raw: unknown, header: HeaderSpec): HeaderLayout {
  const fallback = defaultHeader(header);
  if (!isRecord(raw)) {
    return fallback;
  }
  const known = new Set(header.stats.map(stat => stat.id));
  const stats = Array.isArray(raw.stats)
    ? [
        ...new Set(
          raw.stats.filter(
            (id): id is string => typeof id === 'string' && known.has(id)
          )
        ),
      ]
    : fallback.stats;
  const rawShow = isRecord(raw.show) ? raw.show : {};
  const show = { ...fallback.show };
  for (const field of HEADER_FIELDS) {
    if (typeof rawShow[field] === 'boolean') {
      show[field] = rawShow[field];
    }
  }
  return {
    defaultState: oneOf(raw.defaultState, HEADER_STATES, fallback.defaultState),
    autoCollapse:
      typeof raw.autoCollapse === 'boolean'
        ? raw.autoCollapse
        : fallback.autoCollapse,
    show,
    stats,
  };
}

export function buildDefault(spec: LayoutSpec): PageLayout {
  const { defaults } = spec;
  const panels: Record<string, PanelPrefs> = {};
  for (const [id, prefs] of Object.entries(defaults.panels ?? {})) {
    if (prefs) {
      panels[id] = { ...DEFAULT_PREFS, ...prefs };
    }
  }
  const layout: PageLayout = {
    version: 1,
    template: defaults.template,
    regions: {
      left: [...(defaults.regions.left ?? [])],
      main: [...(defaults.regions.main ?? [])],
      right: [...(defaults.regions.right ?? [])],
    },
    hidden: [...(defaults.hidden ?? [])],
    panels,
    leftWidth: defaults.leftWidth ?? 'medium',
    rightWidth: defaults.rightWidth ?? 'medium',
    density: defaults.density ?? 'comfortable',
    stickyRails: defaults.stickyRails ?? true,
  };
  if (spec.header) {
    layout.header = defaultHeader(spec.header);
  }
  return placeMissing(layout, spec, layout);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T
): T {
  return options.find(option => option === value) ?? fallback;
}

function regionOf(layout: PageLayout, id: string): RegionKey | null {
  return (
    REGION_KEYS.find(region => layout.regions[region].includes(id)) ?? null
  );
}

/** Puts any panel the layout doesn't mention where the defaults would, so new panels appear after upgrades. */
function placeMissing(
  layout: PageLayout,
  spec: LayoutSpec,
  fallback: PageLayout
): PageLayout {
  const known = new Set([
    ...REGION_KEYS.flatMap(region => layout.regions[region]),
    ...layout.hidden,
  ]);
  const next = {
    ...layout,
    regions: { ...layout.regions },
    hidden: [...layout.hidden],
  };
  for (const { id } of spec.panels) {
    if (known.has(id)) {
      continue;
    }
    if (fallback !== layout && fallback.hidden.includes(id)) {
      next.hidden.push(id);
      continue;
    }
    const region =
      (fallback !== layout ? regionOf(fallback, id) : null) ?? 'main';
    next.regions[region] = [...next.regions[region], id];
  }
  return next;
}

/** Validates a stored config against the page's current panels; anything unknown falls back to defaults. */
export function normalizeLayout(raw: unknown, spec: LayoutSpec): PageLayout {
  const fallback = buildDefault(spec);
  if (!isRecord(raw)) {
    return fallback;
  }
  const ids = new Set(spec.panels.map(panel => panel.id));
  const seen = new Set<string>();
  const take = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    const result: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && ids.has(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  };
  const rawRegions = isRecord(raw.regions) ? raw.regions : {};
  const regions = {
    left: take(rawRegions.left),
    main: take(rawRegions.main),
    right: take(rawRegions.right),
  };
  const hidden = take(raw.hidden);
  const panels: Record<string, PanelPrefs> = {};
  if (isRecord(raw.panels)) {
    for (const [id, prefs] of Object.entries(raw.panels)) {
      if (ids.has(id) && isRecord(prefs)) {
        panels[id] = {
          collapsed: prefs.collapsed === true,
          span: prefs.span === 'half' ? 'half' : 'full',
        };
      }
    }
  }
  const layout: PageLayout = {
    version: 1,
    template: oneOf(raw.template, TEMPLATES, fallback.template),
    regions,
    hidden,
    panels,
    leftWidth: oneOf(raw.leftWidth, COLUMN_WIDTHS, fallback.leftWidth),
    rightWidth: oneOf(raw.rightWidth, COLUMN_WIDTHS, fallback.rightWidth),
    density: oneOf(raw.density, DENSITIES, fallback.density),
    stickyRails:
      typeof raw.stickyRails === 'boolean'
        ? raw.stickyRails
        : fallback.stickyRails,
  };
  if (spec.header) {
    layout.header = normalizeHeader(raw.header, spec.header);
  }
  return placeMissing(layout, spec, fallback);
}

/** Regions the template shows, with panels from inactive regions folded into main. */
export function visibleRegions(
  layout: PageLayout
): { region: RegionKey; ids: string[] }[] {
  const active = TEMPLATE_REGIONS[layout.template];
  const orphans = REGION_KEYS.filter(
    region => !active.includes(region)
  ).flatMap(region => layout.regions[region]);
  return active.map(region => ({
    region,
    ids:
      region === 'main'
        ? [...layout.regions.main, ...orphans]
        : layout.regions[region],
  }));
}

export function prefsFor(layout: PageLayout, id: string): PanelPrefs {
  return layout.panels[id] ?? DEFAULT_PREFS;
}

export function findRegion(layout: PageLayout, id: string): RegionKey | null {
  return regionOf(layout, id);
}

export function withTemplate(
  layout: PageLayout,
  template: LayoutTemplate
): PageLayout {
  const active = TEMPLATE_REGIONS[template];
  const regions = { ...layout.regions };
  for (const region of REGION_KEYS) {
    if (!active.includes(region) && regions[region].length) {
      regions.main =
        region === 'left'
          ? [...regions[region], ...regions.main]
          : [...regions.main, ...regions[region]];
      regions[region] = [];
    }
  }
  return { ...layout, template, regions };
}

export function movePanel(
  layout: PageLayout,
  id: string,
  to: RegionKey,
  index?: number
): PageLayout {
  const regions = { ...layout.regions };
  for (const region of REGION_KEYS) {
    regions[region] = regions[region].filter(item => item !== id);
  }
  const target = [...regions[to]];
  const at =
    index === undefined
      ? target.length
      : Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, id);
  regions[to] = target;
  return {
    ...layout,
    regions,
    hidden: layout.hidden.filter(item => item !== id),
  };
}

export function nudgePanel(
  layout: PageLayout,
  id: string,
  delta: -1 | 1
): PageLayout {
  const region = regionOf(layout, id);
  if (!region) {
    return layout;
  }
  const index = layout.regions[region].indexOf(id);
  return movePanel(layout, id, region, index + delta);
}

export function hidePanel(layout: PageLayout, id: string): PageLayout {
  const regions = { ...layout.regions };
  for (const region of REGION_KEYS) {
    regions[region] = regions[region].filter(item => item !== id);
  }
  return {
    ...layout,
    regions,
    hidden: layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id],
  };
}

export function showPanel(
  layout: PageLayout,
  id: string,
  spec: LayoutSpec
): PageLayout {
  const preferred = regionOf(buildDefault(spec), id);
  const active = TEMPLATE_REGIONS[layout.template];
  return movePanel(
    layout,
    id,
    preferred && active.includes(preferred) ? preferred : 'main'
  );
}

export function setPanelPrefs(
  layout: PageLayout,
  id: string,
  patch: Partial<PanelPrefs>
): PageLayout {
  return {
    ...layout,
    panels: { ...layout.panels, [id]: { ...prefsFor(layout, id), ...patch } },
  };
}

export function setHeader(
  layout: PageLayout,
  patch: Partial<HeaderLayout>
): PageLayout {
  return layout.header
    ? { ...layout, header: { ...layout.header, ...patch } }
    : layout;
}

export function setHeaderField(
  layout: PageLayout,
  field: HeaderField,
  visible: boolean
): PageLayout {
  return layout.header
    ? setHeader(layout, { show: { ...layout.header.show, [field]: visible } })
    : layout;
}

/** Shows or hides a header stat; a newly shown stat goes where the spec lists it relative to visible ones. */
export function toggleHeaderStat(
  layout: PageLayout,
  spec: LayoutSpec,
  id: string,
  visible: boolean
): PageLayout {
  const header = layout.header;
  if (!header || !spec.header) {
    return layout;
  }
  const rest = header.stats.filter(item => item !== id);
  if (!visible) {
    return setHeader(layout, { stats: rest });
  }
  const order = spec.header.stats.map(stat => stat.id);
  const rank = order.indexOf(id);
  const at = rest.findIndex(item => order.indexOf(item) > rank);
  const stats = [...rest];
  stats.splice(at < 0 ? stats.length : at, 0, id);
  return setHeader(layout, { stats });
}

export function nudgeHeaderStat(
  layout: PageLayout,
  id: string,
  delta: -1 | 1
): PageLayout {
  const header = layout.header;
  if (!header) {
    return layout;
  }
  const index = header.stats.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= header.stats.length) {
    return layout;
  }
  const stats = [...header.stats];
  [stats[index], stats[target]] = [stats[target], stats[index]];
  return setHeader(layout, { stats });
}

export function sameLayout(a: PageLayout, b: PageLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
