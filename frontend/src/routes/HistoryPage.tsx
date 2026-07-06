import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectHistorySummary, ProjectDraft } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const projectStatusLabels: Record<ProjectDraft['status'], string> = {
  draft: '草稿',
  parsing: '解析中',
  plan_ready: '方案待确认',
  confirmed: '已确认',
  generating: '生成中',
  compositing: '合成中',
  completed: '已完成',
  failed: '失败',
};

const finalStatusLabels: Record<ProjectHistorySummary['final_result_status'], string> = {
  not_started: '未开始',
  running: '合成中',
  succeeded: '已完成',
  failed: '失败',
};

export function HistoryPage() {
  const [projects, setProjects] = useState<ProjectHistorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectHistorySummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`);
      const payload = (await response.json()) as { projects?: ProjectHistorySummary[]; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取历史记录失败');
      }
      setProjects(payload.projects ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取历史记录失败');
    } finally {
      setIsLoading(false);
    }
  }

  function askDelete(project: ProjectHistorySummary) {
    setPendingDeleteProject(project);
    setErrorMessage('');
  }

  function cancelDelete() {
    setPendingDeleteProject(null);
  }

  async function confirmDelete() {
    if (!pendingDeleteProject) return;
    const projectId = pendingDeleteProject.id;
    setDeletingProjectId(projectId);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '删除历史项目失败');
      }
      setProjects((items) => items.filter((item) => item.id !== projectId));
      setPendingDeleteProject(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除历史项目失败');
    } finally {
      setDeletingProjectId('');
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">History</p>
      <div className="section-header no-margin">
        <div>
          <h2>历史记录</h2>
          <p>查看已持久化的广告 TVC 项目，可按当前状态继续查看或删除历史项目。</p>
        </div>
        <Link className="primary-action compact-action" to="/projects/new">
          新建项目
        </Link>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? (
        <p>正在读取历史记录...</p>
      ) : projects.length === 0 ? (
        <div className="card warning-card history-empty">
          <span>暂无历史项目</span>
          <h3>创建第一个广告 TVC 项目后会在这里展示</h3>
          <Link className="secondary-action compact-action" to="/projects/new">
            去创建项目
          </Link>
        </div>
      ) : (
        <div className="card-list">
          {projects.map((project) => (
            <article className="card history-card" key={project.id}>
              <div>
                <div className="status-badges">
                  <span className="status-badge">{projectStatusLabels[project.status]}</span>
                  {project.needs_brief_input && <span className="status-badge warning-badge">待补充 brief</span>}
                </div>
                <h3>{project.name}</h3>
                <p>{project.summary}</p>
                {project.needs_brief_input && (
                  <p className="blocking-reason">请先补充 brief 文件、URL/TOS、参考素材或需求文本后再解析。</p>
                )}
                <p className="meta-line">
                  创建：{formatDate(project.created_at)} · 更新：{formatDate(project.updated_at)}
                </p>
                <p className="meta-line">
                  目标片长：{project.target_duration_seconds ?? '未设置'} 秒 · 片段：{project.segment_count} · 成片：{finalStatusLabels[project.final_result_status]}
                </p>
              </div>
              <div className="history-actions">
                <Link className="primary-action compact-action" to={project.needs_brief_input ? `/projects/${project.id}/brief` : resumePath(project)}>
                  {project.needs_brief_input ? '补充 brief' : '继续查看'}
                </Link>
                <button
                  className="secondary-action compact-action danger-action"
                  type="button"
                  onClick={() => askDelete(project)}
                  disabled={deletingProjectId === project.id}
                >
                  {deletingProjectId === project.id ? '删除中...' : '删除'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {pendingDeleteProject && (
        <div className="confirm-dialog-overlay" role="dialog" aria-modal="true" aria-label="删除项目确认">
          <div className="confirm-dialog delete-confirm-dialog">
            <span className="dialog-icon" aria-hidden="true">⚠️</span>
            <h3>确认删除项目「{pendingDeleteProject.name}」？</h3>
            <div className="warning-card dialog-warning">
              <strong>此操作不可撤销</strong>
              <ul>
                <li>项目的解析结果、分段规划和生成计划将被永久删除</li>
                <li>已生成的视频片段和成片文件将一并清除</li>
                <li>上传的素材文件不会被删除（可在素材库中管理）</li>
              </ul>
            </div>
            <p>删除后无法恢复，请确认您不再需要此项目。</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="secondary-action" onClick={cancelDelete} disabled={deletingProjectId === pendingDeleteProject.id}>
                取消
              </button>
              <button type="button" className="primary-action danger" onClick={() => void confirmDelete()} disabled={deletingProjectId === pendingDeleteProject.id}>
                {deletingProjectId === pendingDeleteProject.id ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function resumePath(project: ProjectHistorySummary): string {
  if (project.status === 'generating' || project.status === 'failed') {
    return `/projects/${project.id}/progress`;
  }
  if (project.status === 'compositing' || project.status === 'completed') {
    return `/projects/${project.id}/preview`;
  }
  if (project.status === 'plan_ready' || project.status === 'confirmed') {
    return `/projects/${project.id}/confirm`;
  }
  return `/projects/${project.id}/brief`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
