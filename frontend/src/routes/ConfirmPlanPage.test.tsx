import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmPlanPage } from './ConfirmPlanPage';

const projectId = '11111111-1111-4111-8111-111111111111';
const segmentId = '22222222-2222-4222-8222-222222222222';
const requirementId = '33333333-3333-4333-8333-333333333333';

const draftPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'plan_ready' },
  parse_result: { summary: '已有解析摘要', requirement_ids: [requirementId], reference_ids: [] },
  requirements: [{ id: requirementId, category: 'brand', title: '品牌', content: '突出品牌科技感', required: true }],
  references: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      asset_type: 'image',
      purpose: '产品主视觉',
      source_file_id: 'file-image-1',
      usage_notes: '保持包装和色彩一致',
      is_missing: false,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      asset_type: 'audio',
      purpose: '品牌声音',
      usage_notes: '需要补充音频文件',
      is_missing: true,
    },
  ],
  segment_plans: [
    {
      id: segmentId,
      project_id: projectId,
      order: 1,
      title: '开场',
      duration_seconds: 10,
      prompt: '展示产品',
      shot_description: '完整镜头',
      continuity_notes: '自然转场',
      reference_video_ids: [],
      reference_image_ids: ['55555555-5555-4555-8555-555555555555'],
      reference_audio_ids: [],
    },
  ],
  generation_plan: {
    id: '44444444-4444-4444-8444-444444444444',
    project_id: projectId,
    version: 1,
    status: 'draft',
    segment_ids: [segmentId],
    requirement_ids: [requirementId],
    reference_ids: [],
    missing_reference_ids: [],
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/confirm`]}>
      <Routes>
        <Route path="/projects/:projectId/confirm" element={<ConfirmPlanPage />} />
        <Route path="/projects/:projectId/progress" element={<p>生成进度页</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConfirmPlanPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('确认生成计划后才允许启动视频生成', async () => {
    const user = userEvent.setup();
    const confirmedPayload = {
      ...draftPayload,
      project: { ...draftPayload.project, status: 'confirmed' },
      generation_plan: { ...draftPayload.generation_plan, status: 'confirmed', confirmed_at: '2026-06-26T00:00:00Z' },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => draftPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => confirmedPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => confirmedPayload });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    const startButton = await screen.findByRole('button', { name: '启动视频生成' });
    expect(startButton).toBeDisabled();
    expect(screen.getByText('待确认')).toBeInTheDocument();
    expect(screen.getByText('需求理解')).toBeInTheDocument();
    expect(screen.getByText('1 个可用参考素材')).toBeInTheDocument();
    expect(screen.getByText('1 个待补充')).toBeInTheDocument();
    expect(screen.getByText('需要复核素材上下文')).toBeInTheDocument();
    expect(screen.getByText('素材库匹配与待补充素材')).toBeInTheDocument();
    expect(screen.getByText('潜在缺失素材')).toBeInTheDocument();
    expect(screen.getByText(/这些素材不会作为文件参考传入 Seedance/)).toBeInTheDocument();
    expect(screen.getByText('素材库上下文映射')).toBeInTheDocument();
    expect(screen.getByText(/已映射到 1\/1 个片段/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认生成计划与素材映射' }));
    await waitFor(() => expect(screen.getByText('生成计划已确认，可以启动 Seedance 2.0 视频生成。')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '启动视频生成' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '启动视频生成' }));
    await waitFor(() => expect(screen.getByText('生成进度页')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:9898/api/projects/${projectId}/generation-tasks`, { method: 'POST' });
  });
});
