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

  it('展示改造前后效果指标和 raw finished knowledge 三类资产', () => {
    render(
      <MemoryRouter>
        <MaterialWorkspacePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('改造前后效果')).toBeInTheDocument();
    expect(screen.getByText('复用率')).toBeInTheDocument();
    expect(screen.getByText('检索耗时')).toBeInTheDocument();
    expect(screen.getByText('重复创作减少')).toBeInTheDocument();
    expect(screen.getByText('高效果素材复用')).toBeInTheDocument();
    expect(screen.getByText('风险拦截')).toBeInTheDocument();
    expect(screen.getByText('防晒喷雾户外实测原始片段')).toBeInTheDocument();
    expect(screen.getByText('烟洞线索抓奸反转短剧前贴')).toBeInTheDocument();
    expect(screen.getByText('短剧前贴 3 秒强钩子脚本结构')).toBeInTheDocument();
    expect(screen.getAllByText('raw').length).toBeGreaterThan(0);
    expect(screen.getAllByText('finished').length).toBeGreaterThan(0);
    expect(screen.getAllByText('knowledge').length).toBeGreaterThan(0);
  });
});
