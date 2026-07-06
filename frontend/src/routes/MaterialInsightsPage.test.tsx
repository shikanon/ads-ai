import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialInsightsPage } from './MaterialInsightsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/materials/insights']}>
      <Routes>
        <Route path="/materials/insights" element={<MaterialInsightsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialInsightsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('展示高效果素材洞察、脚本模板和 Prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          insights: [
            {
              id: 'insight-1',
              material_id: '11111111-1111-4111-8111-111111111111',
              title: '高效果素材方法论：夏日饮料',
              method: '复用强开场和转化动作。',
              script_template: '1. 冰饮开场；2. 利益点露出；3. CTA 收束。',
              prompt: 'Create an ad creative with summer beverage hook.',
              source_material_ids: ['11111111-1111-4111-8111-111111111111'],
              metrics_snapshot: { ctr: 0.12, conversions: 18 },
              created_at: '2026-07-05T00:00:00',
              updated_at: '2026-07-05T00:00:00',
            },
          ],
        }),
      }),
    );

    renderPage();

    expect(await screen.findByText('高效果素材方法论：夏日饮料')).toBeInTheDocument();
    expect(screen.getByText('复用强开场和转化动作。')).toBeInTheDocument();
    expect(screen.getByText('1. 冰饮开场；2. 利益点露出；3. CTA 收束。')).toBeInTheDocument();
    expect(screen.getByText('Create an ad creative with summer beverage hook.')).toBeInTheDocument();
  });
});
