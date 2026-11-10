import { describe, expect, it } from 'vitest';
import {
  buildDefault,
  nudgeHeaderStat,
  normalizeLayout,
  setHeaderField,
  toggleHeaderStat,
} from './layoutModel';
import { CASE_LAYOUT, HOME_LAYOUT } from './pageSpecs';

const DEFAULT_STATS = ['closedToday', 'avgHandle', 'openCases', 'inQueue'];

describe('page header layout', () => {
  it('gives Home a default header and leaves pages without one alone', () => {
    expect(buildDefault(HOME_LAYOUT).header).toEqual({
      defaultState: 'expanded',
      autoCollapse: true,
      show: { date: true, headline: true, presence: true },
      stats: DEFAULT_STATS,
    });
    expect(buildDefault(CASE_LAYOUT).header).toBeUndefined();
    expect(
      normalizeLayout({ header: { defaultState: 'compact' } }, CASE_LAYOUT)
        .header
    ).toBeUndefined();
  });

  it('falls back to defaults for saved layouts that predate the header', () => {
    const saved = { template: 'single', regions: { main: ['myCases'] } };
    expect(normalizeLayout(saved, HOME_LAYOUT).header).toEqual(
      buildDefault(HOME_LAYOUT).header
    );
  });

  it('keeps valid header values and repairs invalid ones', () => {
    const header = normalizeLayout(
      {
        header: {
          defaultState: 'tiny',
          autoCollapse: 'yes',
          show: { date: false, headline: 1 },
          stats: ['inQueue', 'bogus', 7, 'closedToday', 'inQueue'],
        },
      },
      HOME_LAYOUT
    ).header;
    expect(header).toEqual({
      defaultState: 'expanded',
      autoCollapse: true,
      show: { date: false, headline: true, presence: true },
      stats: ['inQueue', 'closedToday'],
    });
  });

  it('respects an admin who hides every stat', () => {
    const header = normalizeLayout(
      { header: { defaultState: 'compact', autoCollapse: false, stats: [] } },
      HOME_LAYOUT
    ).header;
    expect(header?.stats).toEqual([]);
    expect(header?.defaultState).toBe('compact');
    expect(header?.autoCollapse).toBe(false);
  });

  it('re-inserts a shown stat at its registry position and reorders stats', () => {
    const base = buildDefault(HOME_LAYOUT);
    const hidden = toggleHeaderStat(base, HOME_LAYOUT, 'avgHandle', false);
    expect(hidden.header?.stats).toEqual(['closedToday', 'openCases', 'inQueue']);
    const shown = toggleHeaderStat(hidden, HOME_LAYOUT, 'avgHandle', true);
    expect(shown.header?.stats).toEqual(DEFAULT_STATS);

    const moved = nudgeHeaderStat(base, 'inQueue', -1);
    expect(moved.header?.stats).toEqual([
      'closedToday',
      'avgHandle',
      'inQueue',
      'openCases',
    ]);
    expect(nudgeHeaderStat(base, 'closedToday', -1)).toBe(base);
  });

  it('toggles header fields without touching the rest of the layout', () => {
    const base = buildDefault(HOME_LAYOUT);
    const next = setHeaderField(base, 'headline', false);
    expect(next.header?.show).toEqual({
      date: true,
      headline: false,
      presence: true,
    });
    expect(next.regions).toBe(base.regions);
  });
});
