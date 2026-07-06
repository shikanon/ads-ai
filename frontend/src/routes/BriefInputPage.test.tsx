import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefInputPage } from './BriefInputPage';

const projectId = '11111111-1111-4111-8111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/brief`]}>
      <Routes>
        <Route path="/projects/:projectId/brief" element={<BriefInputPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BriefInputPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('首屏说明 brief 解析围绕素材库证据、素材匹配和缺失素材展开', () => {
    renderPage();

    expect(screen.getByText('素材库证据接入')).toBeInTheDocument();
    expect(screen.getByText('Brief、参考素材与需求文本统一入库')).toBeInTheDocument();
    expect(screen.getByText(/后续 brief 解析会优先基于这些素材上下文生成需求理解/)).toBeInTheDocument();
    expect(screen.getByText('素材匹配准备')).toBeInTheDocument();
    expect(screen.getByText('视频 / 图片 / 音频分类型承载创意证据')).toBeInTheDocument();
    expect(screen.getByText('缺失素材提示')).toBeInTheDocument();
    expect(screen.getByText(/标记缺口，避免生成前遗漏关键 Logo、产品图或参考音频/)).toBeInTheDocument();
  });

  it('提示用户至少提供一种 brief 输入', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    expect(screen.getByText('请至少上传 brief、输入需求文本或提供参考素材。')).toBeInTheDocument();
  });

  it('提交需求文本并展示保存结果', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: projectId, name: '新品 TVC' },
        files: [
          {
            id: 'file-1',
            filename: 'brief.pdf',
            purpose: 'brief',
            metadata: {
              extracted_summary: '红果短剧优质达人合作brief-B站，核心优势是免费看剧。',
              text_extraction_method: 'pdf_stream',
              pdf_page_images: {
                total_pages: 3,
                rendered_pages: 2,
                image_paths: ['/tmp/page-1.png', '/tmp/page-2.png'],
                truncated: true,
              },
            },
          },
        ],
        references: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await user.type(screen.getByLabelText('需求文本'), '突出年轻科技感');
    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:9898/api/projects/${projectId}/brief-input`,
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    expect(await screen.findByText('已保存 brief 输入并完成关联')).toBeInTheDocument();
    expect(screen.getByText(`项目 ID：${projectId}`)).toBeInTheDocument();
    expect(screen.getByText('文件记录：1 个')).toBeInTheDocument();
    expect(screen.getByText('素材匹配上下文已准备')).toBeInTheDocument();
    expect(screen.getByText(/下一步解析会输出需求理解、\s*素材匹配、缺失素材和生成准备度/)).toBeInTheDocument();
    expect(screen.getByText(/红果短剧优质达人合作brief-B站/)).toBeInTheDocument();
    expect(screen.getByText(/共 3 页，已渲染 2 页，已按配置截断/)).toBeInTheDocument();
    expect(screen.getByText(/将随 Seed 2.1 请求用于视觉理解/)).toBeInTheDocument();
  });

  it('PDF 文本被拒绝时不展示乱码摘要并保留视觉解析提示', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: projectId, name: '新品 TVC' },
        files: [
          {
            id: 'file-1',
            filename: 'brief.pdf',
            purpose: 'brief',
            metadata: {
              text_extraction_rejected_reason: 'low quality PDF text: fragmented single-character lines',
              pdf_page_images: {
                total_pages: 1,
                rendered_pages: 1,
                image_paths: ['/tmp/page-1.png'],
                truncated: false,
              },
            },
          },
        ],
        references: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await user.type(screen.getByLabelText('需求文本'), '突出年轻科技感');
    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    expect(await screen.findByText('Brief 文本抽取已跳过')).toBeInTheDocument();
    expect(screen.queryByText('Brief 文本摘要')).not.toBeInTheDocument();
    expect(screen.getByText(/fragmented single-character lines/)).toBeInTheDocument();
    expect(screen.getByText(/共 1 页，已渲染 1 页，未截断/)).toBeInTheDocument();
    expect(screen.getByText(/将随 Seed 2.1 请求用于视觉理解/)).toBeInTheDocument();
  });
});
