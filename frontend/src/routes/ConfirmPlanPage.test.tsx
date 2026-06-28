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
  references: [],
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
      reference_image_ids: [],
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

    await user.click(screen.getByRole('button', { name: '确认生成计划' }));
    await waitFor(() => expect(screen.getByText('生成计划已确认，可以启动 Seedance 2.0 视频生成。')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '启动视频生成' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '启动视频生成' }));
    await waitFor(() => expect(screen.getByText('生成进度页')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:9898/api/projects/${projectId}/generation-tasks`, { method: 'POST' });
  });
});
