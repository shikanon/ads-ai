import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from './GalleryPage';

const projectId = '11111111-1111-4111-8111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Routes>
        <Route path="/gallery" element={<GalleryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GalleryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('展示成品画廊空状态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );

    renderPage();

    expect(await screen.findByText('暂无成品')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '新建项目' })[0]).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: '查看历史项目' })).toHaveAttribute('href', '/history');
  });

  it('展示成品卡片并提供下载和查看项目入口', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(galleryResponse()));

    renderPage();

    expect(await screen.findByText('新品 TVC')).toBeInTheDocument();
    expect(screen.getByText('已有成片摘要')).toBeInTheDocument();
    expect(screen.getByText(/成片时长：10 秒/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载成片' })).toHaveAttribute(
      'href',
      `http://localhost:9898/api/projects/${projectId}/files/final/download`,
    );
    expect(screen.getByRole('link', { name: '查看项目' })).toHaveAttribute('href', `/projects/${projectId}/preview`);
  });
});

function galleryResponse() {
  return {
    ok: true,
    json: async () => ({
      items: [
        {
          id: projectId,
          name: '新品 TVC',
          status: 'completed',
          created_at: '2026-06-27T00:00:00',
          updated_at: '2026-06-27T01:00:00',
          target_duration_seconds: 30,
          segment_count: 1,
          final_result_status: 'succeeded',
          summary: '已有成片摘要',
          preview_url: `/api/projects/${projectId}/files/final/download`,
          download_url: `/api/projects/${projectId}/files/final/download`,
          duration_seconds: 10,
          final_result: {
            id: '22222222-2222-4222-8222-222222222222',
            project_id: projectId,
            status: 'succeeded',
            preview_url: `/api/projects/${projectId}/files/final/download`,
            download_url: `/api/projects/${projectId}/files/final/download`,
            duration_seconds: 10,
            created_at: '2026-06-27T00:30:00',
            updated_at: '2026-06-27T01:00:00',
          },
        },
      ],
    }),
  };
}
