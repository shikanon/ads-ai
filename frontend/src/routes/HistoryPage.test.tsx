import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from './HistoryPage';

const projectId = '11111111-1111-4111-8111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/projects/:projectId/confirm" element={<p>确认方案恢复页</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HistoryPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('展示历史空状态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ projects: [] }),
      }),
    );

    renderPage();

    expect(await screen.findByText('暂无历史项目')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去创建项目' })).toHaveAttribute('href', '/projects/new');
  });

  it('支持继续恢复历史项目', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(historyResponse()));

    renderPage();

    expect(await screen.findByText('新品 TVC')).toBeInTheDocument();
    expect(screen.getByText('已有解析摘要')).toBeInTheDocument();
    expect(screen.getByText(/片段：2/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '继续查看' }));

    expect(screen.getByText('确认方案恢复页')).toBeInTheDocument();
  });

  it('支持删除历史项目', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(historyResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deleted: true, project_id: projectId }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('新品 TVC')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:9898/api/projects/${projectId}`, { method: 'DELETE' }));
    expect(screen.queryByText('新品 TVC')).not.toBeInTheDocument();
  });
});

function historyResponse() {
  return {
    ok: true,
    json: async () => ({
      projects: [
        {
          id: projectId,
          name: '新品 TVC',
          status: 'plan_ready',
          created_at: '2026-06-27T00:00:00',
          updated_at: '2026-06-27T01:00:00',
          target_duration_seconds: 30,
          segment_count: 2,
          final_result_status: 'not_started',
          summary: '已有解析摘要',
        },
      ],
    }),
  };
}
