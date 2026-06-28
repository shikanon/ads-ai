import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FinalResult, GalleryItem } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const finalStatusLabels: Record<FinalResult['status'], string> = {
  not_started: '未开始',
  running: '合成中',
  succeeded: '已完成',
  failed: '合成失败',
};

export function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadGallery();
  }, []);

  async function loadGallery() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/gallery`);
      const payload = (await response.json()) as { items?: GalleryItem[]; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取成品画廊失败');
      }
      setItems(payload.items ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取成品画廊失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel gallery-panel">
      <p className="eyebrow">Gallery</p>
      <div className="section-header no-margin">
        <div>
          <h2>成品画廊</h2>
          <p>集中展示已有成片或成片状态的项目，可直接预览、下载或回到项目详情。</p>
        </div>
        <Link className="primary-action compact-action" to="/projects/new">
          新建项目
        </Link>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? (
        <p>正在读取成品画廊...</p>
      ) : items.length === 0 ? (
        <div className="card warning-card gallery-empty">
          <span>暂无成品</span>
          <h3>完成成片合成后会在这里展示</h3>
          <p>你可以先创建项目，或从历史项目继续已有流程。</p>
          <div className="form-actions">
            <Link className="primary-action compact-action" to="/projects/new">
              新建项目
            </Link>
            <Link className="secondary-action compact-action" to="/history">
              查看历史项目
            </Link>
          </div>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((item) => {
            const previewUrl = item.preview_url ? toAbsoluteUrl(item.preview_url) : '';
            const downloadUrl = item.download_url ? toAbsoluteUrl(item.download_url) : '';
            return (
              <article className="card gallery-card" key={item.id}>
                <div className="gallery-preview">
                  {previewUrl ? (
                    <video className="video-preview gallery-video" controls src={previewUrl} />
                  ) : (
                    <div className="video-placeholder gallery-placeholder">暂无可预览成片</div>
                  )}
                </div>
                <div>
                  <span>{finalStatusLabels[item.final_result.status]}</span>
                  <h3>{item.name}</h3>
                  <p>{item.summary}</p>
                  <p className="meta-line">
                    更新：{formatDate(item.updated_at)} · 目标片长：{item.target_duration_seconds ?? '未设置'} 秒
                  </p>
                  <p className="meta-line">
                    片段：{item.segment_count} · 成片时长：{item.duration_seconds ?? '未知'} 秒
                  </p>
                </div>
                <div className="gallery-actions">
                  {downloadUrl && (
                    <a className="primary-action compact-action" href={downloadUrl} download>
                      下载成片
                    </a>
                  )}
                  <Link className="secondary-action compact-action" to={`/projects/${item.id}/preview`}>
                    查看项目
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http') || url.startsWith('file://')) {
    return url;
  }
  return `${apiBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
