import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationProgressPage } from './GenerationProgressPage';

const projectId = '11111111-1111-4111-8111-111111111111';
const segmentId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';

const failedPayload = {
  project: { id: projectId, name: '新品 TVC', status: 'failed' },
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
      reference_image_ids: [],
      reference_audio_ids: [],
    },
  ],
  generation_tasks: [
    {
      id: taskId,
      project_id: projectId,
      segment_id: segmentId,
      status: 'failed',
      retry_count: 0,
      error_message: 'Seedance 2.0 任务失败',
      request_summary: { duration: 10, reference_counts: { video: 1, image: 0, audio: 0 } },
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-26T00:00:00Z',
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/progress`]}>
      <Routes>
        <Route path="/projects/:projectId/progress" element={<GenerationProgressPage />} />
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
});
