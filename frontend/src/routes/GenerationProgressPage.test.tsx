import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationProgressPage } from './GenerationProgressPage';

const projectId = '11111111-1111-4111-8111-111111111111';
const segmentId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';

const baseSegment = {
  id: segmentId,
  project_id: projectId,
  order: 1,
  title: '开场',
  duration_seconds: 10,
  prompt: '展示产品',
  shot_description: '完整镜头',
  reference_video_ids: [],
  reference_image_ids: [],
  reference_audio_ids: [],
};

const baseTask = {
  id: taskId,
  project_id: projectId,
  segment_id: segmentId,
  retry_count: 0,
  request_summary: { duration: 10, reference_counts: { video: 1, image: 0, audio: 0 } },
  created_at: '2026-06-26T00:00:00Z',
  updated_at: '2026-06-26T00:00:00Z',
};

const failedPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'failed' },
  segment_plans: [baseSegment],
  generation_tasks: [
    { ...baseTask, status: 'failed', error_message: 'Seedance 2.0 任务失败' },
  ],
};

const runningPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'generating' },
  segment_plans: [
    baseSegment,
    { ...baseSegment, id: 'seg-2', order: 2, title: '产品展示' },
  ],
  generation_tasks: [
    { ...baseTask, status: 'running', error_message: undefined },
    { ...baseTask, id: 'task-2', segment_id: 'seg-2', status: 'pending', error_message: undefined },
  ],
};

const partialReadyPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'generating' },
  segment_plans: [
    baseSegment,
    { ...baseSegment, id: 'seg-2', order: 2, title: '产品展示' },
  ],
  generation_tasks: [
    { ...baseTask, status: 'succeeded', error_message: undefined, result_url: 'https://example.test/segment.mp4' },
    { ...baseTask, id: 'task-2', segment_id: 'seg-2', status: 'running', error_message: undefined },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/progress`]}>
      <Routes>
        <Route path="/projects/:projectId/progress" element={<GenerationProgressPage />} />
        <Route path="/projects/:projectId/preview" element={<p>成片预览页</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GenerationProgressPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('展示失败片段并支持单独重试', async () => {
    const user = userEvent.setup();
    const retriedPayload = {
      ...failedPayload,
      project: { ...failedPayload.project, status: 'completed' },
      generation_tasks: [
        {
          ...failedPayload.generation_tasks[0],
          status: 'succeeded',
          retry_count: 1,
          error_message: undefined,
          result_url: 'https://example.test/segment.mp4',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => failedPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => retriedPayload });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(await screen.findByText('失败')).toBeInTheDocument();
    expect(screen.getByText('Seedance 2.0 任务失败')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重试该片段' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:9898/api/projects/${projectId}/generation-tasks/${segmentId}/retry`, { method: 'POST' }));
    expect(await screen.findByText('已完成')).toBeInTheDocument();
    expect(screen.getByText(/重试 1 次/)).toBeInTheDocument();
  });

  it('无片段就绪时预览入口禁用并提示等待', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => runningPayload }));
    renderPage();

    expect(await screen.findByText('正在生成片段')).toBeInTheDocument();
    const previewEntry = screen.getByText('查看成片预览（等待片段生成）');
    expect(previewEntry).toHaveClass('disabled-action');
    expect(previewEntry).toHaveAttribute('aria-disabled', 'true');
    expect(previewEntry).not.toHaveAttribute('href');
  });

  it('部分片段就绪时预览入口启用并显示就绪数量', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => partialReadyPayload }));
    renderPage();

    const previewLink = await screen.findByRole('link', { name: /查看已完成片段/ });
    expect(previewLink).toBeInTheDocument();
    expect(previewLink).toHaveTextContent('1/2');
    expect(previewLink).toHaveAttribute('href', `/projects/${projectId}/preview`);

    await user.click(previewLink);
    expect(screen.getByText('成片预览页')).toBeInTheDocument();
  });

  it('全部片段就绪时预览入口显示完整文案', async () => {
    const allReadyPayload = {
      ...partialReadyPayload,
      project: { ...partialReadyPayload.project, status: 'completed' },
      generation_tasks: [
        { ...baseTask, status: 'succeeded', error_message: undefined, result_url: 'https://example.test/seg1.mp4' },
        { ...baseTask, id: 'task-2', segment_id: 'seg-2', status: 'succeeded', error_message: undefined, result_url: 'https://example.test/seg2.mp4' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => allReadyPayload }));
    renderPage();

    const previewLink = await screen.findByRole('link', { name: '查看成片预览 →' });
    expect(previewLink).toBeInTheDocument();
    expect(screen.getByText('全部片段已生成')).toBeInTheDocument();
  });
});
