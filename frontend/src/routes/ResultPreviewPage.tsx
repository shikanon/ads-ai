import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FinalResult, GenerationProgress, ParsedBriefPayload, ReferenceAsset, SegmentPlan } from '../types';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const compositionStatusLabels: Record<FinalResult['status'], string> = {
  not_started: '未开始',
  running: '合成中',
  succeeded: '已完成',
  failed: '合成失败',
};

export function ResultPreviewPage() {
  const { projectId } = useParams();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
  const [tasks, setTasks] = useState<GenerationProgress[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [projectStatus, setProjectStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCompositing, setIsCompositing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadFinalResult();
  }, [apiProjectId]);

  async function loadFinalResult(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }
    setErrorMessage('');
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入成片预览。');
      if (showLoading) {
        setIsLoading(false);
      }
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/final-result`);
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取成片结果失败');
      }
      setSegments(payload.segment_plans ?? []);
      setTasks(payload.generation_tasks ?? []);
      setReferences(payload.references ?? []);
      setFinalResult(payload.final_result ?? null);
      setProjectStatus(payload.project?.status ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取成片结果失败');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function handleCompose() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入成片预览。');
      return;
    }
    setIsCompositing(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/final-result`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '合成成片失败');
      }
      setSegments(payload.segment_plans ?? []);
      setTasks(payload.generation_tasks ?? []);
      setReferences(payload.references ?? []);
      setFinalResult(payload.final_result ?? null);
      setProjectStatus(payload.project?.status ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '合成成片失败');
      await loadFinalResult(false);
    } finally {
      setIsCompositing(false);
    }
  }

  const taskBySegmentId = new Map(tasks.map((task) => [task.segment_id, task]));
  const readyCount = segments.filter((segment) => {
    const task = taskBySegmentId.get(segment.id);
    return task?.status === 'succeeded' && Boolean(task.result_url);
  }).length;
  const allSegmentsReady = segments.length > 0 && readyCount === segments.length;
  const finalPreviewUrl = finalResult?.preview_url ? toAbsoluteUrl(finalResult.preview_url) : '';
  const finalDownloadUrl = finalResult?.download_url ? toAbsoluteUrl(finalResult.download_url) : '';
  const availableReferences = references.filter((reference) => !reference.is_missing);
  const finishedAssetReady = finalResult?.status === 'succeeded';

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 5</p>
      <h2>成片预览与下载</h2>
      <p>所有片段生成成功后，后端会按确认顺序合成完整广告 TVC，并把成片作为素材库成品资产和效果回流入口。</p>
      <div className="card status-card">
        <span>项目状态</span>
        <h3>{projectStatus || '未开始'}</h3>
        <p>
          片段就绪 {readyCount}/{segments.length}
          {finalResult ? ` · 成片状态：${compositionStatusLabels[finalResult.status]}` : ' · 成片状态：未开始'}
        </p>
        {finalResult?.duration_seconds ? <p className="meta-line">合成时长约 {finalResult.duration_seconds} 秒</p> : null}
      </div>
      <div className="card material-feedback-card">
        <span>成片回流素材库</span>
        <h3>{finishedAssetReady ? '成品资产已可进入成品库' : '合成后将生成成品库候选素材'}</h3>
        <p>
          本项目关联 {availableReferences.length} 个参考素材和 {segments.length} 个生成片段。成片下载与预览地址会作为成品素材线索，后续可回写曝光、
          点击、转化等效果数据，沉淀为经验库洞察。
        </p>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {finalResult?.error_message && <p className="error-message">{finalResult.error_message}</p>}
      {isLoading ? (
        <p>正在读取成片结果...</p>
      ) : finalPreviewUrl ? (
        <video className="video-preview final-video-preview" controls src={finalPreviewUrl} />
      ) : (
        <div className="video-placeholder">
          {allSegmentsReady ? '片段已全部就绪，可合成最终 TVC' : '等待所有片段生成成功后合成最终 TVC'}
        </div>
      )}
      <div className="form-actions">
        <button className="primary-action" type="button" onClick={() => void handleCompose()} disabled={!allSegmentsReady || isCompositing}>
          {isCompositing ? '合成中...' : finalResult?.status === 'succeeded' ? '重新合成成片' : '合成成片'}
        </button>
        {finalDownloadUrl && (
          <a className="secondary-action" href={finalDownloadUrl} download>
            下载成片
          </a>
        )}
        <Link className="secondary-action" to={`/projects/${apiProjectId}/progress`}>
          返回生成进度
        </Link>
      </div>
      <div className="section-header">
        <div>
          <p className="eyebrow">Segment Entries</p>
          <h3>片段结果与素材上下文</h3>
        </div>
      </div>
      <div className="card-list">
        {segments.length === 0 ? (
          <article className="card warning-card">
            <span>暂无片段</span>
            <h3>请先完成方案确认和片段生成</h3>
          </article>
        ) : (
          segments.map((segment) => {
            const task = taskBySegmentId.get(segment.id);
            const segmentUrl = task?.result_url ? toAbsoluteUrl(task.result_url) : '';
            return (
              <article className="card" key={segment.id}>
                <span>片段 {segment.order}</span>
                <h3>{segment.title}</h3>
                <p className="meta-line">
                  时长 {segment.duration_seconds} 秒 · 状态 {task?.status ?? 'pending'}
                </p>
                <p className="meta-line">参考上下文：{referenceUsageCount(segment)} 个素材映射 · 生成片段会随成片一起进入回流链路。</p>
                {segmentUrl ? (
                  segmentUrl.startsWith('http') ? (
                    <video className="video-preview segment-entry-preview" controls src={segmentUrl} />
                  ) : (
                    <p className="success-message">片段地址：{segmentUrl}</p>
                  )
                ) : (
                  <p className="meta-line">暂无片段结果</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
    ) : (
      <InvalidProjectRoute />
    )
  );
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http') || url.startsWith('file://')) {
    return url;
  }
  return `${apiBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function referenceUsageCount(segment: SegmentPlan): number {
  return segment.reference_video_ids.length + segment.reference_image_ids.length + segment.reference_audio_ids.length;
}
