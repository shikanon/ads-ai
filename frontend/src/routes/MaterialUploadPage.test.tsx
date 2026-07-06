import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialUploadPage } from './MaterialUploadPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/materials/upload']}>
      <Routes>
        <Route path="/materials/upload" element={<MaterialUploadPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialUploadPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('提交 TOS 批量导入表单并展示创建结果', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          materials: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              status: 'received',
              asset_type: 'video',
              library_type: 'raw',
              copyright_status: 'cleared',
              compliance_status: 'pending',
              visibility: 'private',
              source_uri: 'tos://bucket/summer.mp4',
              source_metadata: {},
              technical_metadata: {},
              effect_metrics: {},
              created_at: '2026-07-05T00:00:00',
              updated_at: '2026-07-05T00:00:00',
            },
          ],
        }),
      }),
    );

    renderPage();

    await user.selectOptions(screen.getByLabelText('入库方式'), 'tos');
    await user.type(screen.getByPlaceholderText(/tos:\/\/bucket\/path\/material-1.mp4/), 'tos://bucket/summer.mp4');
    await user.click(screen.getByRole('button', { name: '导入 TOS 素材' }));

    expect(await screen.findByText('已创建 1 个素材记录')).toBeInTheDocument();
    expect(screen.getAllByText(/tos:\/\/bucket\/summer.mp4/).length).toBeGreaterThan(0);
  });
});
