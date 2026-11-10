import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDefault, type HeaderLayout } from '@/layout/layoutModel';
import { HOME_LAYOUT } from '@/layout/pageSpecs';
import { CompactBar } from './CompactBar';
import { FullBanner } from './FullBanner';
import type { HomeBannerData } from './useHomeBannerData';

const STATS = HOME_LAYOUT.header?.stats ?? [];

const data: HomeBannerData = {
  greeting: 'Good afternoon, Brendan',
  dateLong: 'Tuesday, November 10',
  dateShort: 'Tue, Nov 10',
  headline: 'Two escalations need you before noon.',
  status: 'Online',
  setPresence: vi.fn(() => Promise.resolve()),
  stats: STATS.map((meta, index) => ({ meta, value: `${index + 11}` })),
};

const header = buildDefault(HOME_LAYOUT).header as HeaderLayout;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function renderBoth(layout: HeaderLayout) {
  const full = render(
    <FullBanner data={data} header={layout} onCollapse={() => undefined} />
  );
  const fullRegion = within(full.container);
  const compact = render(
    <CompactBar
      data={data}
      header={layout}
      onExpand={() => undefined}
      expandLabel="Expand banner"
    />
  );
  const compactRegion = within(compact.container);
  return { fullRegion, compactRegion };
}

describe('Home banner states', () => {
  it('shows the same information expanded and compact', () => {
    const { fullRegion, compactRegion } = renderBoth(header);
    for (const region of [fullRegion, compactRegion]) {
      expect(region.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Good afternoon, Brendan'
      );
      expect(
        region.getByText('Two escalations need you before noon.')
      ).toBeInTheDocument();
      for (const stat of data.stats) {
        expect(region.getByText(stat.value)).toBeInTheDocument();
      }
    }
    expect(fullRegion.getByText(data.dateLong)).toBeInTheDocument();
    expect(compactRegion.getByText(data.dateShort)).toBeInTheDocument();
    expect(
      fullRegion.getByRole('radio', { name: /Available/ })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      compactRegion.getByRole('button', { name: /Presence status: Available/ })
    ).toBeInTheDocument();
  });

  it('hides the same fields in both states', () => {
    const trimmed: HeaderLayout = {
      ...header,
      show: { date: false, headline: false, presence: false },
      stats: ['openCases'],
    };
    const { fullRegion, compactRegion } = renderBoth(trimmed);
    const open = data.stats.find(stat => stat.meta.id === 'openCases');
    const closed = data.stats.find(stat => stat.meta.id === 'closedToday');
    for (const region of [fullRegion, compactRegion]) {
      expect(region.queryByText(data.headline)).toBeNull();
      expect(region.queryByText(/Presence status/)).toBeNull();
      expect(region.queryByRole('radiogroup')).toBeNull();
      expect(region.getByText(open?.value ?? '')).toBeInTheDocument();
      expect(region.queryByText(closed?.value ?? '')).toBeNull();
    }
    expect(screen.queryByText(data.dateLong)).toBeNull();
    expect(screen.queryByText(data.dateShort)).toBeNull();
  });
});
