import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectCreatePage } from './ProjectCreatePage';

const projectId = '11111111-1111-4111-8111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/new']}>
      <Routes>
        <Route path="/projects/new" element={<ProjectCreatePage />} />
        <Route path="/projects/:projectId/brief" element={<p>Brief 输入页</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectCreatePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('空项目名仍被本地拦截', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await user.click(screen.getByRole('button', { name: '创建草稿并补充 brief' }));

    expect(screen.getByText('请输入项目名称。')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空需求时展示草稿提示并允许创建', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ project: { id: projectId, name: '待补充项目', status: 'draft' }, needs_brief_input: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(screen.getByText('将创建为待补充 brief 草稿')).toBeInTheDocument();
    expect(screen.getByText(/上传 brief 文件、填写 URL\/TOS、提供参考素材或输入需求文本后才能解析/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('项目名称'), '待补充项目');
    await user.click(screen.getByRole('button', { name: '创建草稿并补充 brief' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body as string)).toEqual({ name: '待补充项目' });
    expect(await screen.findByText('Brief 输入页')).toBeInTheDocument();
  });

  it('有需求文本时发送 trimmed requirement_text', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ project: { id: projectId, name: '新品 TVC', status: 'draft' }, needs_brief_input: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await user.type(screen.getByLabelText('项目名称'), ' 新品 TVC ');
    await user.type(screen.getByLabelText('需求摘要'), '  突出年轻用户的科技感  ');
    expect(screen.getByText('已具备文本需求输入')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建并进入 brief 输入' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body as string)).toEqual({
      name: '新品 TVC',
      requirement_text: '突出年轻用户的科技感',
    });
  });
});
