import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialSearchPage } from './MaterialSearchPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/materials/search']}>
      <Routes>
        <Route path="/materials/search" element={<MaterialSearchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialSearchPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('展示检索结果、证据和 RAG 回答', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              material: materialFixture(),
              score: 0.91,
              vector_score: 0.88,
              scalar_score: 0.74,
              evidence: ['title: 夏日饮料高转化片头'],
              matched_tags: ['high_ctr', '夏日'],
            },
          ],
          answer: {
            answer: '建议优先复用夏日饮料高转化片头。',
            citations: ['1'],
            fallback: true,
          },
        }),
      }),
    );

    renderPage();

    await user.click(screen.getByRole('button', { name: '开始检索' }));

    expect(await screen.findByText('夏日饮料高转化片头')).toBeInTheDocument();
    expect(screen.getByText('title: 夏日饮料高转化片头')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'RAG 回答' })).toHaveTextContent('建议优先复用夏日饮料高转化片头。');
    expect(screen.getByText('引用：1')).toBeInTheDocument();
  });
});

function materialFixture() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'searchable',
    asset_type: 'video',
    library_type: 'finished',
    copyright_status: 'cleared',
    compliance_status: 'approved',
    visibility: 'brand',
    title: '夏日饮料高转化片头',
    description: '3 秒内展示冰饮与利益点。',
    source_metadata: {},
    technical_metadata: {},
    effect_metrics: { ctr: 0.12 },
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
  };
}
