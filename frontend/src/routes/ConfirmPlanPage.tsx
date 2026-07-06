import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GenerationPlanSnapshot, ParsedBriefPayload, ProjectDraft, ReferenceAsset, RequirementItem, SegmentPlan } from '../types';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const categoryOptions: Array<RequirementItem['category']> = [
  'brand',
  'product',
  'audience',
  'selling_point',
  'style',
  'constraint',
  'delivery',
  'other',
];

const categoryLabels: Record<RequirementItem['category'], string> = {
  brand: '品牌',
  product: '产品',
  audience: '受众',
  selling_point: '卖点',
  style: '风格',
  constraint: '禁用项',
  delivery: '交付规格',
  other: '其他',
};

const assetTypeLabels: Record<ReferenceAsset['asset_type'], string> = {
  video: '参考视频',
  image: '参考图片',
  audio: '参考音频',
};

export function ConfirmPlanPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const [project, setProject] = useState<ProjectDraft | null>(null);
  const [generationPlan, setGenerationPlan] = useState<GenerationPlanSnapshot | null>(null);
  const [summary, setSummary] = useState('');
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
  const [needsBriefInput, setNeedsBriefInput] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSegments, setIsSavingSegments] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadParsedBrief();
  }, [apiProjectId]);

  async function loadParsedBrief() {
    setIsLoading(true);
    setErrorMessage('');
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}`);
      const payload = (await response.json()) as ParsedBriefPayload;
      if (!response.ok) {
        throw new Error('读取项目失败');
      }
      applyParsedPayload(payload);
      if (!payload.project) {
        setErrorMessage('请先创建项目并提交 brief 输入，再执行解析。');
        return;
      }
      if (payload.needs_brief_input) {
        return;
      }
      if (!payload.parse_result) {
        await handleParse({ skipNeedsCheck: true });
      } else if ((payload.segment_plans ?? []).length === 0) {
        await handleGeneratePlan();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取项目失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleParse(options: { skipNeedsCheck?: boolean } = {}) {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    if (needsBriefInput && !options.skipNeedsCheck) {
      setErrorMessage('请先补充 brief 文件、URL/TOS、参考素材或需求文本后再解析。');
      return;
    }
    setIsParsing(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/parse-brief`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '解析 brief 失败');
      }
      applyParsedPayload(payload);
      setMessage('解析完成，已生成结构化需求和参考素材清单。');
      await handleGeneratePlan();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '解析 brief 失败');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/parsed-brief`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, requirements, references }),
      });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '保存解析结果失败');
      }
      applyParsedPayload(payload);
      setMessage('修改已保存，可继续进入后续分段规划。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存解析结果失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGeneratePlan() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setIsPlanning(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/segment-plan`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '生成分段规划失败');
      }
      applyParsedPayload(payload);
      setMessage('已生成不超过 15 秒的连续片段规划，可继续编辑。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '生成分段规划失败');
    } finally {
      setIsPlanning(false);
    }
  }

  async function handleSaveSegments() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setIsSavingSegments(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/segment-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '保存分段规划失败');
      }
      applyParsedPayload(payload);
      setMessage('分段规划已保存为新版本，请确认后再启动视频生成。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存分段规划失败');
    } finally {
      setIsSavingSegments(false);
    }
  }

  async function handleConfirmPlan() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setIsConfirming(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/generation-plan/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed_by: 'user' }),
      });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '确认生成计划失败');
      }
      applyParsedPayload(payload);
      setMessage('生成计划已确认，可以启动 Seedance 2.0 视频生成。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '确认生成计划失败');
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleStartGeneration() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setIsStartingGeneration(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/generation-tasks`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '启动视频生成失败');
      }
      applyParsedPayload(payload);
      navigate(`/projects/${apiProjectId}/progress`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '启动视频生成失败');
    } finally {
      setIsStartingGeneration(false);
    }
  }

  function applyParsedPayload(payload: ParsedBriefPayload) {
    setProject(payload.project);
    setGenerationPlan(payload.generation_plan ?? null);
    setSummary(payload.parse_result?.summary ?? '');
    setRequirements(payload.requirements ?? []);
    setReferences(payload.references ?? []);
    setSegments(payload.segment_plans ?? []);
    setNeedsBriefInput(payload.needs_brief_input === true);
  }

  function updateRequirement(id: string, patch: Partial<RequirementItem>) {
    setRequirements((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateReference(id: string, patch: Partial<ReferenceAsset>) {
    setReferences((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateSegment(id: string, patch: Partial<SegmentPlan>) {
    setSegments((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function toggleSegmentReference(id: string, field: 'reference_video_ids' | 'reference_image_ids' | 'reference_audio_ids', referenceId: string) {
    setSegments((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const currentValues = item[field];
        return {
          ...item,
          [field]: currentValues.includes(referenceId)
            ? currentValues.filter((value) => value !== referenceId)
            : [...currentValues, referenceId],
        };
      }),
    );
  }

  function addRequirement() {
    setRequirements((items) => [
      ...items,
      { id: window.crypto.randomUUID(), category: 'other', title: '补充需求', content: '', required: true },
    ]);
  }

  function addMissingReference() {
    setReferences((items) => [
      ...items,
      {
        id: window.crypto.randomUUID(),
        asset_type: 'image',
        purpose: '待补充素材',
        usage_notes: '',
        is_missing: true,
      },
    ]);
  }

  function addSegment() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setSegments((items) => [
      ...items,
      {
        id: window.crypto.randomUUID(),
        project_id: apiProjectId,
        order: items.length + 1,
        title: '补充片段',
        duration_seconds: 5,
        prompt: '',
        negative_prompt: '不要切分同一镜头，不要出现风格突变或不自然跳接。',
        shot_description: '',
        continuity_notes: '承接前后片段的角色、品牌资产、色彩风格、动作方向和声音情绪。',
        reference_video_ids: [],
        reference_image_ids: [],
        reference_audio_ids: [],
      },
    ]);
  }

  const totalSegmentDuration = segments.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0);
  const missingReferences = references.filter((item) => item.is_missing);
  const isPlanConfirmed = generationPlan?.status === 'confirmed' || project?.status === 'confirmed';

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 3</p>
      <h2>查看和编辑解析结果</h2>
      <p>Seed 2.1 会将 brief、需求文本和文件引用解析为结构化需求、参考素材和待补充素材。</p>
      <div className="form-actions">
        <button className="primary-action" type="button" onClick={() => void handleParse()} disabled={isParsing || isLoading || needsBriefInput}>
          {isParsing ? '解析中...' : '重新解析 brief'}
        </button>
        <button className="secondary-action" type="button" onClick={() => void handleSave()} disabled={isSaving || requirements.length === 0 || needsBriefInput}>
          {isSaving ? '保存中...' : '保存修改'}
        </button>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {message && <p className="success-message">{message}</p>}
      {isLoading ? (
        <p>正在读取解析结果...</p>
      ) : needsBriefInput ? (
        <div className="card warning-card brief-needed-card">
          <span>待补充 brief</span>
          <h3>当前项目还没有可解析的 brief 输入</h3>
          <p>请先补充 brief 文件、URL/TOS、参考素材或需求文本后再解析。</p>
          <Link className="primary-action compact-action" to={`/projects/${apiProjectId}/brief`}>
            返回 Brief 输入页
          </Link>
        </div>
      ) : (
        <>
          <div className="card status-card">
            <span>生成计划状态</span>
            <h3>{isPlanConfirmed ? '已确认' : '待确认'}</h3>
            <p>
              当前版本：v{generationPlan?.version ?? 0}
              {generationPlan?.confirmed_at ? ` · 确认时间：${new Date(generationPlan.confirmed_at).toLocaleString()}` : ''}
            </p>
            <p>{isPlanConfirmed ? '后续视频生成将使用当前确认版本。' : '保存或重新生成分段计划后，需要再次确认才能启动视频生成。'}</p>
          </div>
          <label className="full-width block-field">
            解析摘要
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <div className="section-header">
            <h3>结构化需求</h3>
            <button className="secondary-action compact-action" type="button" onClick={addRequirement}>
              添加需求项
            </button>
          </div>
          <div className="card-list">
            {requirements.map((item) => (
              <article className="card editable-card" key={item.id}>
                <label>
                  类型
                  <select value={item.category} onChange={(event) => updateRequirement(item.id, { category: event.target.value as RequirementItem['category'] })}>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  标题
                  <input value={item.title} onChange={(event) => updateRequirement(item.id, { title: event.target.value })} />
                </label>
                <label className="full-width">
                  内容
                  <textarea value={item.content} onChange={(event) => updateRequirement(item.id, { content: event.target.value })} />
                </label>
                <label className="inline-field">
                  <input type="checkbox" checked={item.required} onChange={(event) => updateRequirement(item.id, { required: event.target.checked })} />
                  必须满足
                </label>
                <button className="secondary-action compact-action" type="button" onClick={() => setRequirements((items) => items.filter((value) => value.id !== item.id))}>
                  删除
                </button>
              </article>
            ))}
          </div>
          <div className="section-header">
            <h3>参考素材与待补充素材</h3>
            <button className="secondary-action compact-action" type="button" onClick={addMissingReference}>
              添加待补充素材
            </button>
          </div>
          {missingReferences.length > 0 && (
            <div className="card warning-card">
              <span>潜在缺失素材</span>
              <h3>还有 {missingReferences.length} 个素材待补充</h3>
              <p>可继续确认进入生成，但这些素材不会作为文件参考传入 Seedance，请确认提示词已覆盖替代方案。</p>
              <ul>
                {missingReferences.map((item) => (
                  <li key={item.id}>
                    {assetTypeLabels[item.asset_type]} · {item.purpose}
                    {item.usage_notes ? `：${item.usage_notes}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card-list">
            {references.map((item) => (
              <article className="card editable-card" key={item.id}>
                <label>
                  类型
                  <select value={item.asset_type} onChange={(event) => updateReference(item.id, { asset_type: event.target.value as ReferenceAsset['asset_type'] })}>
                    <option value="video">参考视频</option>
                    <option value="image">参考图片</option>
                    <option value="audio">参考音频</option>
                  </select>
                </label>
                <label>
                  用途
                  <input value={item.purpose} onChange={(event) => updateReference(item.id, { purpose: event.target.value })} />
                </label>
                <label className="full-width">
                  使用说明
                  <textarea value={item.usage_notes ?? ''} onChange={(event) => updateReference(item.id, { usage_notes: event.target.value })} />
                </label>
                <span>{assetTypeLabels[item.asset_type]} · {item.is_missing ? '待补充' : `已关联文件 ${item.source_file_id ?? '未知'}`}</span>
                <label className="inline-field">
                  <input type="checkbox" checked={item.is_missing} onChange={(event) => updateReference(item.id, { is_missing: event.target.checked })} />
                  标记为待补充
                </label>
                <button className="secondary-action compact-action" type="button" onClick={() => setReferences((items) => items.filter((value) => value.id !== item.id))}>
                  删除
                </button>
              </article>
            ))}
          </div>
          <div className="section-header">
            <div>
              <h3>多段 TVC 规划</h3>
              <p>每段必须不超过 15 秒，且只在完整镜头、自然转场或情绪段落结束处拆分。</p>
            </div>
            <div className="form-actions">
              <button className="secondary-action compact-action" type="button" onClick={() => void handleGeneratePlan()} disabled={isPlanning || requirements.length === 0}>
                {isPlanning ? '规划中...' : '重新生成规划'}
              </button>
              <button className="secondary-action compact-action" type="button" onClick={addSegment}>
                添加片段
              </button>
            </div>
          </div>
          <p className="meta-line">当前共 {segments.length} 段，总时长约 {totalSegmentDuration.toFixed(1)} 秒。</p>
          <div className="card-list">
            {segments.map((segment) => (
              <article className="card editable-card segment-card" key={segment.id}>
                <label>
                  顺序
                  <input
                    min="1"
                    type="number"
                    value={segment.order}
                    onChange={(event) => updateSegment(segment.id, { order: Number(event.target.value) })}
                  />
                </label>
                <label>
                  建议时长（秒，≤15）
                  <input
                    max="15"
                    min="0.1"
                    step="0.1"
                    type="number"
                    value={segment.duration_seconds}
                    onChange={(event) => updateSegment(segment.id, { duration_seconds: Number(event.target.value) })}
                  />
                </label>
                <label className="full-width">
                  片段标题
                  <input value={segment.title} onChange={(event) => updateSegment(segment.id, { title: event.target.value })} />
                </label>
                <label className="full-width">
                  片段提示词
                  <textarea value={segment.prompt} onChange={(event) => updateSegment(segment.id, { prompt: event.target.value })} />
                </label>
                <label className="full-width">
                  负向约束
                  <textarea value={segment.negative_prompt ?? ''} onChange={(event) => updateSegment(segment.id, { negative_prompt: event.target.value })} />
                </label>
                <label className="full-width">
                  镜头描述
                  <textarea value={segment.shot_description} onChange={(event) => updateSegment(segment.id, { shot_description: event.target.value })} />
                </label>
                <label className="full-width">
                  前后衔接说明
                  <textarea value={segment.continuity_notes ?? ''} onChange={(event) => updateSegment(segment.id, { continuity_notes: event.target.value })} />
                </label>
                <div className="full-width reference-picker">
                  <strong>参考素材映射</strong>
                  {references.filter((reference) => !reference.is_missing).length === 0 ? (
                    <span>暂无可映射素材，可先补充参考视频、图片或音频。</span>
                  ) : (
                    references
                      .filter((reference) => !reference.is_missing)
                      .map((reference) => {
                        const field = fieldForAssetType(reference.asset_type);
                        return (
                          <label className="inline-field" key={reference.id}>
                            <input
                              type="checkbox"
                              checked={segment[field].includes(reference.id)}
                              onChange={() => toggleSegmentReference(segment.id, field, reference.id)}
                            />
                            {assetTypeLabels[reference.asset_type]} · {reference.purpose}
                          </label>
                        );
                      })
                  )}
                </div>
                <button className="secondary-action compact-action" type="button" onClick={() => setSegments((items) => items.filter((value) => value.id !== segment.id))}>
                  删除片段
                </button>
              </article>
            ))}
          </div>
          <div className="form-actions">
            <button className="primary-action" type="button" onClick={() => void handleSaveSegments()} disabled={isSavingSegments || segments.length === 0}>
              {isSavingSegments ? '保存中...' : '保存分段规划'}
            </button>
            <button className="primary-action" type="button" onClick={() => void handleConfirmPlan()} disabled={isConfirming || segments.length === 0}>
              {isConfirming ? '确认中...' : '确认生成计划'}
            </button>
          </div>
        </>
      )}
      <div className="form-actions">
        <button className="primary-action" type="button" onClick={() => void handleStartGeneration()} disabled={!isPlanConfirmed || isStartingGeneration}>
          {isStartingGeneration ? '启动中...' : '启动视频生成'}
        </button>
        <Link className="secondary-action" to={`/projects/${apiProjectId}/brief`}>
          返回 brief 输入
        </Link>
      </div>
    </section>
    ) : (
      <InvalidProjectRoute />
    )
  );
}

function fieldForAssetType(assetType: ReferenceAsset['asset_type']): 'reference_video_ids' | 'reference_image_ids' | 'reference_audio_ids' {
  if (assetType === 'video') {
    return 'reference_video_ids';
  }
  if (assetType === 'audio') {
    return 'reference_audio_ids';
  }
  return 'reference_image_ids';
}
