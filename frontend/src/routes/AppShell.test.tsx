import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('只展示主层级导航，不暴露 demo 项目详情入口', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>首页内容</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: '历史项目' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: '成品画廊' })).toHaveAttribute('href', '/gallery');
    expect(screen.queryByRole('link', { name: '输入 brief' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '成片预览' })).not.toBeInTheDocument();
  });
});
