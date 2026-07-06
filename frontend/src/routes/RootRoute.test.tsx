import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RootRoute } from './RootRoute';

describe('RootRoute', () => {
  it('默认进入素材工作台', () => {
    render(
      <MemoryRouter>
        <RootRoute hostname="app.example.com" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '素材工作台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '入库素材' })).toHaveAttribute('href', '/materials/upload');
    expect(screen.getByRole('link', { name: 'RAG 检索问答' })).toHaveAttribute('href', '/materials/search');
  });

  it('admin 域名根路径进入管理后台入口', () => {
    render(
      <MemoryRouter>
        <RootRoute hostname="admin.lens-rhyme.tensorbytes.com" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '广告 TVC 管理后台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看历史项目' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: '查看成品画廊' })).toHaveAttribute('href', '/gallery');
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute('href', '/projects/new');
  });
});
