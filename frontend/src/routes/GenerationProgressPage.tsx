import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GenerationProgress, ParsedBriefPayload, ReferenceAsset, SegmentPlan } from '../types';
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

const statusPercent: Record<GenerationProgress['status'], number> = {
  pending: 5,
  submitted: 20,
  running: 60,
  retrying: 35,
  succeeded: 100,
  failed: 100,
};

export function GenerationProgressPage() {
  const { projectId } = useParams();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
  const [tasks, setTasks] = useState<GenerationProgress[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
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
      setReferences(payload.references ?? []);
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
      setReferences(payload.references ?? []);
      setProjectStatus(payload.project?.status ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '重试片段失败');
    } finally {
      setIsRetryingSegmentId('');
    }
  }

  const taskBySegmentId = new Map(tasks.map((task) => [task.segment_id, task]));
  const completedCount = tasks.filter((task) => task.status === 'succeeded').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const overallPercent = segments.length > 0 ? Math.round((completedCount / segments.length) * 100) : 0;
  const availableReferences = references.filter((reference) => !reference.is_missing);
  const materialCounts = countReferencesByType(availableReferences);

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 4</p>
      <h2>生成进度</h2>
      <p>展示每个 Seedance 2.0 片段任务的状态、素材上下文使用、错误原因、重试入口和预览结果。</p>
      <div className="card status-card">
        <span>项目状态</span>
        <h3>{projectStatus || '未开始'}</h3>
        <p>
          已完成 {completedCount}/{segments.length} 段
          {failedCount > 0 ? ` · ${failedCount} 段失败，可单独重试` : ''}
        </p>
        <progress max="100" value={overallPercent} />
      </div>
      <div className="card material-feedback-card">
        <span>素材上下文</span>
        <h3>{availableReferences.length > 0 ? '已随生成任务使用素材库证据' : '暂无可用参考素材'}</h3>
        <p>
          当前素材上下文：视频 {materialCounts.video} · 图片 {materialCounts.image} · 音频 {materialCounts.audio}。
          {availableReferences.length > 0 ? '每个片段会按确认页映射携带参考素材，生成结果将用于成片库回流。' : '可返回确认方案补充参考素材，或依赖提示词完成无素材生成。'}
        </p>
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
          return (
          <article className="card" key={segment.id}>
            <span>{statusLabels[taskStatus]}</span>
            <h3>
              片段 {segment.order}：{segment.title}
            </h3>
            <p className="meta-line">
              时长 {segment.duration_seconds} 秒 · 重试 {task?.retry_count ?? 0} 次
              {task?.provider_task_id ? ` · 任务 ID：${task.provider_task_id}` : ''}
            </p>
            <progress max="100" value={statusPercent[taskStatus]} />
            {task?.request_summary?.reference_counts && (
              <p className="meta-line">
                本片段素材使用：视频 {task.request_summary.reference_counts.video ?? 0} · 图片 {task.request_summary.reference_counts.image ?? 0} · 音频{' '}
                {task.request_summary.reference_counts.audio ?? 0}
              </p>
            )}
            <p className="meta-line">素材映射：{referenceUsageCount(segment)} 个确认页参考项将作为本片段生成上下文。</p>
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
      <Link className="primary-action" to={`/projects/${apiProjectId}/preview`}>
        查看成片预览
      </Link>
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

function countReferencesByType(references: ReferenceAsset[]): Record<ReferenceAsset['asset_type'], number> {
  return references.reduce(
    (counts, reference) => ({
      ...counts,
      [reference.asset_type]: counts[reference.asset_type] + 1,
    }),
    { video: 0, image: 0, audio: 0 },
  );
}

function referenceUsageCount(segment: SegmentPlan): number {
  return segment.reference_video_ids.length + segment.reference_image_ids.length + segment.reference_audio_ids.length;
}
