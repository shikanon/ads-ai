import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MaterialDetailPage } from './MaterialDetailPage';

const materialId = '11111111-1111-4111-8111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/materials/${materialId}`, state: { result: detailResult() } }]}>
      <Routes>
        <Route path="/materials/:materialId" element={<MaterialDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialDetailPage', () => {
  it('展示素材详情、标签、索引、效果指标和审计记录', () => {
    renderPage();

    expect(screen.getByText('夏日饮料高转化片头')).toBeInTheDocument();
    expect(screen.getByText('场景: 冰饮')).toBeInTheDocument();
    expect(screen.getByText('indexed')).toBeInTheDocument();
    expect(screen.getByText('ctr')).toBeInTheDocument();
    expect(screen.getByText('0.12')).toBeInTheDocument();
    expect(screen.getByText('material.index_saved')).toBeInTheDocument();
  });
});

function detailResult() {
  return {
    material: {
      id: materialId,
      status: 'searchable',
      asset_type: 'video',
      library_type: 'finished',
      copyright_status: 'cleared',
      compliance_status: 'approved',
      visibility: 'brand',
      title: '夏日饮料高转化片头',
      description: '3 秒内展示冰饮与利益点。',
      source_metadata: { channel: 'campaign' },
      technical_metadata: { duration_seconds: 9 },
      effect_metrics: { ctr: 0.12 },
      created_at: '2026-07-05T00:00:00',
      updated_at: '2026-07-05T00:00:00',
    },
    score: 0.91,
    evidence: ['title: 夏日饮料高转化片头'],
    matched_tags: ['high_ctr'],
    tags: [
      {
        id: 'tag-1',
        material_id: materialId,
        category: 'content',
        name: '场景',
        value: '冰饮',
        confidence: 0.94,
        source: 'ai',
        needs_review: false,
        created_at: '2026-07-05T00:00:00',
        updated_at: '2026-07-05T00:00:00',
      },
    ],
    index: {
      status: 'indexed',
      partition_key: 'brand-demo',
      vector_dim: 1024,
      embedding_version: 'fallback-v1',
    },
    audit_events: [
      {
        id: 'audit-1',
        material_id: materialId,
        action: 'material.index_saved',
        actor: 'tester',
        details: {},
        created_at: '2026-07-05T00:00:00',
      },
    ],
  };
}
