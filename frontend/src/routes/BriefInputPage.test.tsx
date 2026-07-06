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
        <Route path="/projects/:projectId/confirm" element={<div data-testid="confirm-page">确认方案</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BriefInputPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('提示用户至少提供一种 brief 输入', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    expect(screen.getByText('请至少上传 brief、输入需求文本或提供参考素材。')).toBeInTheDocument();
  });

  it('提交需求文本后展示下一步引导主按钮', async () => {
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
    expect(screen.getByText(/红果短剧优质达人合作brief-B站/)).toBeInTheDocument();
    expect(screen.getByText(/共 3 页，已渲染 2 页，已按配置截断/)).toBeInTheDocument();
    expect(screen.getByText(/将随 Seed 2.1 请求用于视觉理解/)).toBeInTheDocument();
    expect(screen.getByText(/下一步：系统将解析 Brief/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始解析并生成方案 →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续补充素材' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存并上传 Files API' })).not.toBeInTheDocument();
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

  it('支持批量添加多个远程参考素材并提交', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: projectId, name: '新品 TVC' },
        files: [],
        references: [
          { id: 'ref-1', asset_type: 'video' },
          { id: 'ref-2', asset_type: 'image' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    const urlInputs = screen.getAllByPlaceholderText(/https:\/\/example\.com\/ref\.mp4/);
    const remoteUrlInput = urlInputs[urlInputs.length - 1];
    const typeSelect = screen.getAllByRole('combobox')[0];

    await user.selectOptions(typeSelect, 'video');
    await user.type(remoteUrlInput, 'https://example.com/ref1.mp4');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(screen.getByText('https://example.com/ref1.mp4')).toBeInTheDocument();

    await user.selectOptions(typeSelect, 'image');
    await user.type(remoteUrlInput, 'https://example.com/ref2.jpg');
    await user.type(screen.getByPlaceholderText('用途说明（可选）'), '竞品参考');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(screen.getByText('https://example.com/ref2.jpg')).toBeInTheDocument();
    expect(screen.getByText('竞品参考')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const callArgs = fetchMock.mock.calls[0];
    const body = callArgs[1].body as FormData;
    const remoteRefsJson = body.get('remote_references_json') as string;
    const refs = JSON.parse(remoteRefsJson);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ url: 'https://example.com/ref1.mp4', asset_type: 'video' });
    expect(refs[1]).toMatchObject({ url: 'https://example.com/ref2.jpg', asset_type: 'image', purpose: '竞品参考' });
  });

  it('远程参考素材输入框有未添加内容时阻止提交', async () => {
    const user = userEvent.setup();
    renderPage();

    const urlInputs = screen.getAllByPlaceholderText(/https:\/\/example\.com\/ref\.mp4/);
    const remoteUrlInput = urlInputs[urlInputs.length - 1];
    await user.type(remoteUrlInput, 'https://example.com/unfinished.mp4');
    await user.type(screen.getByLabelText('需求文本'), '简单需求');
    await user.click(screen.getByRole('button', { name: '保存并上传 Files API' }));

    expect(screen.getByText('请先点击「添加」将未添加的远程素材加入列表，或清空输入框后再提交。')).toBeInTheDocument();
  });
});
