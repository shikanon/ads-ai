import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('按素材库核心工作台顺序展示主导航，不暴露 demo 项目详情入口', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>首页内容</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(navigation).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      '素材工作台',
      '素材库',
      'Brief 解析',
      '生成工坊',
      '洞察回流',
      '历史记录',
    ]);
    expect(screen.getByRole('link', { name: '素材工作台' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '素材库' })).toHaveAttribute('href', '/materials');
    expect(screen.getByRole('link', { name: 'Brief 解析' })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: '生成工坊' })).toHaveAttribute('href', '/gallery');
    expect(screen.getByRole('link', { name: '洞察回流' })).toHaveAttribute('href', '/materials/insights');
    expect(screen.getByRole('link', { name: '历史记录' })).toHaveAttribute('href', '/history');
    expect(screen.queryByRole('link', { name: '输入 brief' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '成片预览' })).not.toBeInTheDocument();
  });
});
