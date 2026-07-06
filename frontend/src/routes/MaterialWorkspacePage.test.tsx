import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MaterialWorkspacePage } from './MaterialWorkspacePage';

describe('MaterialWorkspacePage', () => {
  it('展示素材驱动流程、处理队列、关键入口和下一步动作', () => {
    render(
      <MemoryRouter>
        <MaterialWorkspacePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '素材工作台' })).toBeInTheDocument();
    expect(screen.getByText('素材驱动流程')).toBeInTheDocument();
    expect(screen.getByText('处理队列')).toBeInTheDocument();
    expect(screen.getByText('下一步动作')).toBeInTheDocument();
    expect(screen.getByText('待补充标签')).toBeInTheDocument();
    expect(screen.getByText('待索引素材')).toBeInTheDocument();
    expect(screen.getByText('待回流成片')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '入库素材' })).toHaveAttribute('href', '/materials/upload');
    expect(screen.getByRole('link', { name: 'RAG 检索问答' })).toHaveAttribute('href', '/materials/search');
    expect(screen.getByRole('link', { name: '进入 Brief 解析' })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: '查看洞察回流' })).toHaveAttribute('href', '/materials/insights');
  });
});
