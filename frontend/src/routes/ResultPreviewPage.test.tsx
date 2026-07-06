import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultPreviewPage } from './ResultPreviewPage';

const projectId = '11111111-1111-4111-8111-111111111111';
const segmentId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';

const readyPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'completed' },
  segment_plans: [
    {
      id: segmentId,
      project_id: projectId,
      order: 1,
      title: '开场',
      duration_seconds: 10,
      prompt: '展示产品',
      shot_description: '完整镜头',
      reference_video_ids: [],
      reference_image_ids: ['55555555-5555-4555-8555-555555555555'],
      reference_audio_ids: [],
    },
  ],
  references: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      asset_type: 'image',
      purpose: '产品视觉参考',
      source_file_id: 'file-image-1',
      is_missing: false,
    },
  ],
  generation_tasks: [
    {
      id: taskId,
      project_id: projectId,
      segment_id: segmentId,
      status: 'succeeded',
      retry_count: 0,
      result_url: 'https://example.test/segment.mp4',
      request_summary: { duration: 10 },
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-26T00:00:00Z',
    },
  ],
  final_result: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/preview`]}>
      <Routes>
        <Route path="/projects/:projectId/preview" element={<ResultPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderInvalidProjectPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/demo/preview']}>
      <Routes>
        <Route path="/projects/:projectId/preview" element={<ResultPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResultPreviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('片段就绪后可触发合成并展示下载入口', async () => {
    const user = userEvent.setup();
    const composedPayload = {
      ...readyPayload,
      final_result: {
        id: '44444444-4444-4444-8444-444444444444',
        project_id: projectId,
        status: 'succeeded',
        preview_url: `/api/projects/${projectId}/files/final/download`,
        download_url: `/api/projects/${projectId}/files/final/download`,
        duration_seconds: 10,
        created_at: '2026-06-26T00:00:00Z',
        updated_at: '2026-06-26T00:00:00Z',
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => readyPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => composedPayload });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(await screen.findByText('片段已全部就绪，可合成最终 TVC')).toBeInTheDocument();
    expect(screen.getByText('成片回流素材库')).toBeInTheDocument();
    expect(screen.getByText('合成后将生成成品库候选素材')).toBeInTheDocument();
    expect(screen.getByText(/本项目关联 1 个参考素材和 1 个生成片段/)).toBeInTheDocument();
    expect(screen.getByText('片段结果与素材上下文')).toBeInTheDocument();
    expect(screen.getByText(/参考上下文：1 个素材映射 · 生成片段会随成片一起进入回流链路/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '合成成片' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:9898/api/projects/${projectId}/final-result`, { method: 'POST' }));
    expect(await screen.findByText('下载成片')).toHaveAttribute('href', `http://localhost:9898/api/projects/${projectId}/files/final/download`);
    expect(screen.getByText('合成时长约 10 秒')).toBeInTheDocument();
    expect(screen.getByText('成品资产已可进入成品库')).toBeInTheDocument();
  });

  it('拒绝通过 demo 路径进入成片详情', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderInvalidProjectPage();

    expect(screen.getByText('请从具体项目进入')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看成品画廊' })).toHaveAttribute('href', '/gallery');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
