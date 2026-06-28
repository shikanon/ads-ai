import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminHomePage } from './AdminHomePage';
import { getAdminAppHost, getMainAppHost, isAdminHost, normalizeHost } from './deploymentHosts';

describe('deployment host detection', () => {
  it('识别 admin 域名并保留主域名为主程序入口', () => {
    expect(normalizeHost(' Admin.Lens-Rhyme.TensorBytes.com ')).toBe('admin.lens-rhyme.tensorbytes.com');
    expect(getMainAppHost()).toBe('lens-rhyme.tensorbytes.com');
    expect(getAdminAppHost()).toBe('admin.lens-rhyme.tensorbytes.com');
    expect(isAdminHost('admin.lens-rhyme.tensorbytes.com')).toBe(true);
    expect(isAdminHost('lens-rhyme.tensorbytes.com')).toBe(false);
    expect(isAdminHost('localhost')).toBe(false);
  });
});

describe('AdminHomePage', () => {
  it('展示管理后台入口和主程序入口信息', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AdminHomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '广告 TVC 管理后台' })).toBeInTheDocument();
    expect(screen.getByText(/admin\.lens-rhyme\.tensorbytes\.com/)).toBeInTheDocument();
    expect(screen.getByText('主域名 lens-rhyme.tensorbytes.com 默认进入新建项目流程。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看历史项目' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: '查看成品画廊' })).toHaveAttribute('href', '/gallery');
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute('href', '/projects/new');
  });
});
