import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GenerationProgress, ParsedBriefPayload, SegmentPlan } from '../types';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const statusLabels: Record<GenerationProgress['status'], string> = {
  pending: '等待提交',
  submitted: '已提交',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  retrying: '重试中',
};

const statusDotClass: Record<GenerationProgress['status'], string> = {
  pending: 'status-dot pending',
  submitted: 'status-dot running',
  running: 'status-dot running',
  retrying: 'status-dot running',
  succeeded: 'status-dot succeeded',
  failed: 'status-dot failed',
};

export function GenerationProgressPage() {
  const { projectId } = useParams();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
  const [tasks, setTasks] = useState<GenerationProgress[]>([]);
  const [projectStatus, setProjectStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRetryingSegmentId, setIsRetryingSegmentId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadGenerationTasks();
  }, [apiProjectId]);

  useEffect(() => {
    if (!hasActiveTasks(tasks)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadGenerationTasks(false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [apiProjectId, tasks]);

  async function loadGenerationTasks(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }
    setErrorMessage('');
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入生成进度。');
      if (showLoading) {
        setIsLoading(false);
      }
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/generation-tasks`);
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取生成任务失败');
      }
      setSegments(payload.segment_plans ?? []);
      setTasks(payload.generation_tasks ?? []);
      setProjectStatus(payload.project?.status ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取生成任务失败');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function handleRetry(segmentId: string) {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入生成进度。');
      return;
    }
    setIsRetryingSegmentId(segmentId);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/generation-tasks/${segmentId}/retry`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '重试片段失败');
      }
      setSegments(payload.segment_plans ?? []);
      setTasks(payload.generation_tasks ?? []);
      setProjectStatus(payload.project?.status ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '重试片段失败');
    } finally {
      setIsRetryingSegmentId('');
    }
  }

  const taskBySegmentId = useMemo(() => new Map(tasks.map((task) => [task.segment_id, task])), [tasks]);
  const completedCount = tasks.filter((task) => task.status === 'succeeded').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const runningCount = tasks.filter((task) => task.status === 'submitted' || task.status === 'running' || task.status === 'retrying').length;
  const hasAnyReady = completedCount > 0;
  const allSegmentsReady = segments.length > 0 && completedCount === segments.length;

  const overallStatusLabel = useMemo(() => {
    if (segments.length === 0) return '未开始';
    if (failedCount > 0 && runningCount === 0 && completedCount === 0) return '生成失败';
    if (allSegmentsReady) return '全部片段已生成';
    if (runningCount > 0) return '正在生成片段';
    if (completedCount > 0 && failedCount > 0) return '部分完成，存在失败片段';
    if (completedCount > 0) return '部分片段已完成';
    if (failedCount > 0) return '等待处理失败片段';
    return '等待生成';
  }, [segments.length, completedCount, failedCount, runningCount, allSegmentsReady]);

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 4</p>
      <h2>生成进度</h2>
      <p>展示每个 Seedance 2.0 片段任务的状态、错误原因、重试入口和预览结果。视频生成时间因片长和队列情况而异，请耐心等待。</p>
      <div className="card status-card">
        <span>项目状态</span>
        <h3>{projectStatus || '未开始'}</h3>
        <p>{overallStatusLabel}</p>
        <p className="meta-line">
          已完成 {completedCount}/{segments.length} 段
          {runningCount > 0 ? ` · ${runningCount} 段生成中` : ''}
          {failedCount > 0 ? ` · ${failedCount} 段失败，可单独重试` : ''}
        </p>
        {segments.length > 0 && (
          <div className="segment-tracker" aria-label="片段生成进度">
            {segments.map((segment) => {
              const task = taskBySegmentId.get(segment.id);
              const st = task?.status ?? 'pending';
              const isActive = st === 'submitted' || st === 'running' || st === 'retrying';
              return (
                <span
                  key={segment.id}
                  className={`segment-tracker-dot ${st}${isActive ? ' pulse' : ''}`}
                  title={`片段 ${segment.order}：${segment.title} · ${statusLabels[st]}`}
                >
                  {segment.order}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? (
        <p>正在读取生成任务...</p>
      ) : segments.length === 0 ? (
        <div className="card warning-card">
          <span>暂无片段计划</span>
          <h3>请先确认方案并启动视频生成</h3>
          <Link className="secondary-action" to={`/projects/${apiProjectId}/confirm`}>
            返回确认方案
          </Link>
        </div>
      ) : (
      <div className="card-list">
        {segments.map((segment) => {
          const task = taskBySegmentId.get(segment.id);
          const taskStatus = task?.status ?? 'pending';
          const isBusy = taskStatus === 'submitted' || taskStatus === 'running' || taskStatus === 'retrying';
          return (
          <article className="card segment-task-card" key={segment.id}>
            <div className="segment-status-header">
              <span className={statusDotClass[taskStatus]} aria-hidden="true" />
              <span className="segment-status-label">{statusLabels[taskStatus]}</span>
              {isBusy && <span className="spinner inline-spinner" aria-hidden="true" />}
            </div>
            <h3>
              片段 {segment.order}：{segment.title}
            </h3>
            <p className="meta-line">
              时长 {segment.duration_seconds} 秒 · 重试 {task?.retry_count ?? 0} 次
              {task?.provider_task_id ? ` · 任务 ID：${task.provider_task_id}` : ''}
            </p>
            {task?.request_summary?.reference_counts && (
              <p className="meta-line">
                参考素材：视频 {task.request_summary.reference_counts.video ?? 0} · 图片 {task.request_summary.reference_counts.image ?? 0} · 音频{' '}
                {task.request_summary.reference_counts.audio ?? 0}
              </p>
            )}
            {task?.error_message && <p className="error-message">{task.error_message}</p>}
            {task?.result_url && (
              task.result_url.startsWith('http') ? (
                <video className="video-preview" controls src={task.result_url} />
              ) : (
                <p className="success-message">片段已生成：{task.result_url}</p>
              )
            )}
            {taskStatus === 'failed' && (
              <button
                className="secondary-action compact-action"
                type="button"
                onClick={() => void handleRetry(segment.id)}
                disabled={isRetryingSegmentId === segment.id}
              >
                {isRetryingSegmentId === segment.id ? '重试中...' : '重试该片段'}
              </button>
            )}
          </article>
          );
        })}
      </div>
      )}
      <div className="form-actions">
      <Link className="secondary-action" to={`/projects/${apiProjectId}/confirm`}>
        返回确认方案
      </Link>
      {hasAnyReady ? (
        <Link
          className={`primary-action${allSegmentsReady ? '' : ' preview-partial'}`}
          to={`/projects/${apiProjectId}/preview`}
          title={allSegmentsReady ? '查看并合成完整成片' : `${completedCount} 个片段已就绪，可预览已完成片段并在全部完成后合成成片`}
        >
          {allSegmentsReady ? '查看成片预览 →' : `查看已完成片段 (${completedCount}/${segments.length}) →`}
        </Link>
      ) : (
        <span
          className="primary-action disabled-action"
          role="link"
          aria-disabled="true"
          title="至少有一个片段生成完成后才可预览"
        >
          查看成片预览（等待片段生成）
        </span>
      )}
      </div>
    </section>
    ) : (
      <InvalidProjectRoute />
    )
  );
}

function hasActiveTasks(tasks: GenerationProgress[]): boolean {
  return tasks.some((task) => task.status === 'submitted' || task.status === 'running' || task.status === 'retrying');
}
