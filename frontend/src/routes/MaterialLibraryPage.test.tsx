import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialLibraryPage } from './MaterialLibraryPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/materials']}>
      <Routes>
        <Route path="/materials" element={<MaterialLibraryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialLibraryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('展示素材列表空态并提供上传与检索入口', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('暂无匹配资产')).toBeInTheDocument();
    expect(screen.getByText('调整筛选，或先看素材入库链路')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '上传素材' })[0]).toHaveAttribute('href', '/materials/upload');
    expect(screen.getByRole('link', { name: '去检索' })).toHaveAttribute('href', '/materials/search');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9898/api/materials/search',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('展示 PC 资产流、召回解释、Inspector 和批量操作条', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: materialResults() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('索引与召回解释')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开召回解释' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('向量召回')).toBeInTheDocument();
    expect(screen.getByText('标签过滤')).toBeInTheDocument();
    expect(screen.getByText('效果加权')).toBeInTheDocument();
    expect(screen.getByText('RAG 引用来源')).toBeInTheDocument();
    expect(await screen.findByLabelText('PC 资产流')).toBeInTheDocument();
    expect(screen.getAllByText('家庭伦理短剧前贴').length).toBeGreaterThan(0);
    expect(screen.getByText('品牌产品图原始素材')).toBeInTheDocument();
    expect(screen.getByText('强钩子脚本经验模板')).toBeInTheDocument();
    expect(screen.getAllByText('成品素材 · 视频').length).toBeGreaterThan(0);
    expect(screen.getByText('原始素材 · 图片')).toBeInTheDocument();
    expect(screen.getByText('经验知识 · 文本')).toBeInTheDocument();
    expect(screen.getAllByText('可检索').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已打标').length).toBeGreaterThan(0);
    expect(screen.getByText('3 条可见资产')).toBeInTheDocument();
    expect(screen.getByText('MaterialInspector')).toBeInTheDocument();
    expect(screen.getByText('确认 AI 标签')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '展开召回解释' }));
    expect(screen.getByRole('button', { name: '折叠召回解释' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByLabelText('选择 家庭伦理短剧前贴'));

    expect(screen.getByLabelText('桌面固定批量操作条')).toBeInTheDocument();
    expect(screen.getByText('批量加标签')).toBeInTheDocument();
    expect(screen.getByText('批量移除标签')).toBeInTheDocument();
    expect(screen.getByText('批量确认 AI 标签')).toBeInTheDocument();
  });
});

function materialResults() {
  const base = {
    copyright_status: 'cleared',
    compliance_status: 'approved',
    visibility: 'brand',
    source_metadata: {},
    technical_metadata: {},
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
  };

  return [
    {
      material: {
        ...base,
        id: 'finished-001',
        status: 'searchable',
        asset_type: 'video',
        library_type: 'finished',
        title: '家庭伦理短剧前贴',
        description: '3 秒反转抓奸钩子。',
        effect_metrics: { ctr: 0.048, cvr: 0.006, reuse_count: 18 },
      },
      score: 0.91,
      evidence: ['CTR 高于库均值 22%'],
      matched_tags: ['高 CTR', '家庭伦理'],
      tags: [{ id: 'tag-1', material_id: 'finished-001', category: 'effect', name: '高 CTR', confidence: 0.95, source: 'ai', needs_review: false, created_at: '2026-07-05T00:00:00', updated_at: '2026-07-05T00:00:00' }],
      index: { status: 'indexed' },
    },
    {
      material: {
        ...base,
        id: 'raw-001',
        status: 'tagged',
        asset_type: 'image',
        library_type: 'raw',
        title: '品牌产品图原始素材',
        effect_metrics: { reuse_count: 3 },
      },
      score: 0.77,
      evidence: ['标签命中产品实拍'],
      matched_tags: ['产品实拍'],
    },
    {
      material: {
        ...base,
        id: 'knowledge-001',
        status: 'searchable',
        asset_type: 'text',
        library_type: 'knowledge',
        title: '强钩子脚本经验模板',
        effect_metrics: { reuse_count: 9 },
      },
      score: 0.83,
      evidence: ['RAG 引用脚本模板'],
      matched_tags: ['脚本模板'],
    },
  ];
}
