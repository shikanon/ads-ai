import { render, screen } from '@testing-library/react';
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

    expect(await screen.findByText('暂无素材')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '上传素材' })[0]).toHaveAttribute('href', '/materials/upload');
    expect(screen.getByRole('link', { name: '去检索' })).toHaveAttribute('href', '/materials/search');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9898/api/materials/search',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
