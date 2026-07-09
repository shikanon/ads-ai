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
    expect(screen.getByLabelText('素材预览')).toBeInTheDocument();
    expect(screen.getByText('召回证据')).toBeInTheDocument();
    expect(screen.getByText('素材档案')).toBeInTheDocument();
    expect(screen.getByText('可复用建议')).toBeInTheDocument();
    expect(screen.getByText('AI 标签质量')).toBeInTheDocument();
    expect(screen.getByText('投放信号')).toBeInTheDocument();
    expect(screen.getByText('技术质量')).toBeInTheDocument();
    expect(screen.getByText('3 秒内展示冰饮与利益点。')).toBeInTheDocument();
    expect(screen.getByText('title: 夏日饮料高转化片头')).toBeInTheDocument();
    expect(screen.getAllByText('场景: 冰饮').length).toBeGreaterThan(0);
    expect(screen.getByText('indexed')).toBeInTheDocument();
    expect(screen.getByText('ctr')).toBeInTheDocument();
    expect(screen.getByText('0.12')).toBeInTheDocument();
    expect(screen.getByText('material.index_saved')).toBeInTheDocument();
  });

  it('展示入库流水线、标签管理和标签治理规则', () => {
    renderPage();

    expect(screen.getByLabelText('入库流水线')).toBeInTheDocument();
    expect(screen.getByText('接收')).toBeInTheDocument();
    expect(screen.getByText('清洗')).toBeInTheDocument();
    expect(screen.getByText('去重')).toBeInTheDocument();
    expect(screen.getByText('元数据')).toBeInTheDocument();
    expect(screen.getByText('打标')).toBeInTheDocument();
    expect(screen.getByText('向量化')).toBeInTheDocument();
    expect(screen.getByText('索引完成')).toBeInTheDocument();
    expect(screen.getByText('风险校验')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/流水线阶段/).length).toBe(8);
    expect(screen.getByText('当前阶段：索引完成')).toBeInTheDocument();
    expect(screen.getByText('素材已进入可检索池，等待风险复核完成后进入默认召回。')).toBeInTheDocument();
    expect(screen.getByLabelText('标签管理操作')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '确认 AI 标签' }).length).toBeGreaterThan(0);
    expect(screen.getByText('效果标签不可直接删除，只能隐藏或标记不参与排序')).toBeInTheDocument();
    expect(screen.getByText('合规标签删除需二次确认文案，并写入审计记录')).toBeInTheDocument();
    expect(screen.getByText('locked 标签只读')).toBeInTheDocument();
    expect(screen.getByText('AI 标签确认后会作为人工校准结果参与检索排序。')).toBeInTheDocument();
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
      source_uri: '/mock-assets/drama-hook.mp4',
      source_metadata: { channel: 'campaign', ratio: '9:16', duration: '9s', thumbnail_url: '/mock-assets/drama-hook-cover.jpg' },
      technical_metadata: { duration_seconds: 9, width: 720, height: 1280, frame_rate: 24 },
      effect_metrics: { ctr: 0.12, cvr: 0.023, reuse_count: 8, impressions: 120000 },
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
        dimension: 'content',
        name: '场景',
        value: '冰饮',
        confidence: 0.94,
        source: 'ai',
        needs_review: false,
        createdBy: 'doubao-seed',
        updatedAt: '2026-07-05 10:00',
        created_at: '2026-07-05T00:00:00',
        updated_at: '2026-07-05T00:00:00',
      },
      {
        id: 'tag-2',
        material_id: materialId,
        category: 'effect',
        dimension: 'effect',
        name: '高 CTR',
        confidence: 0.91,
        source: 'effect_backflow',
        needs_review: false,
        excludedFromRanking: false,
        createdBy: 'effect-sync',
        updatedAt: '2026-07-05 11:00',
        created_at: '2026-07-05T00:00:00',
        updated_at: '2026-07-05T00:00:00',
      },
      {
        id: 'tag-3',
        material_id: materialId,
        category: 'compliance',
        dimension: 'compliance',
        name: '版权已授权',
        confidence: 1,
        source: 'human',
        needs_review: false,
        createdBy: 'legal',
        updatedAt: '2026-07-05 12:00',
        created_at: '2026-07-05T00:00:00',
        updated_at: '2026-07-05T00:00:00',
      },
      {
        id: 'tag-4',
        material_id: materialId,
        category: 'management',
        dimension: 'management',
        name: '品牌核心资产',
        confidence: 1,
        source: 'system_rule',
        needs_review: false,
        locked: true,
        createdBy: 'system',
        updatedAt: '2026-07-05 12:30',
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
