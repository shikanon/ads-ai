import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useBlocker, type Location } from 'react-router-dom';
import type { GenerationPlanSnapshot, ParsedBriefPayload, ProjectDraft, ReferenceAsset, RequirementItem, SegmentPlan } from '../types';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

type WorkflowStep = 'loading' | 'needs_brief' | 'parsing' | 'editing_brief' | 'planning' | 'editing_segments' | 'confirmed' | 'starting';
type AutoAction = 'idle' | 'parsing' | 'planning' | 'saving_brief' | 'saving_segments' | 'confirming' | 'starting';

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

interface ConfirmNavState {
  fromBriefSubmit?: boolean;
  projectName?: string;
}

const stepMeta: Record<Exclude<WorkflowStep, 'loading' | 'needs_brief'>, { label: string; description: string }> = {
  parsing: { label: '1. 解析 Brief', description: '正在调用 Seed 2.1 解析 brief 与参考素材' },
  editing_brief: { label: '1. 审核解析结果', description: '检查并修改结构化需求、参考素材' },
  planning: { label: '2. 生成分段规划', description: '正在根据需求生成分段方案' },
  editing_segments: { label: '2. 审核分段规划', description: '检查各片段提示词、时长、素材映射' },
  confirmed: { label: '3. 确认并启动', description: '方案已确认，可启动视频生成' },
  starting: { label: '3. 启动生成', description: '正在提交生成任务' },
};

export function ConfirmPlanPage() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const navState = (location.state as ConfirmNavState | null) ?? null;

  const [project, setProject] = useState<ProjectDraft | null>(null);
  const [generationPlan, setGenerationPlan] = useState<GenerationPlanSnapshot | null>(null);
  const [summary, setSummary] = useState('');
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [autoAction, setAutoAction] = useState<AutoAction>('idle');
  const [autoActionMessage, setAutoActionMessage] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const savedSnapshotRef = useRef<string>('');
  const [showNavConfirm, setShowNavConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ path: string; opts?: { state?: unknown } } | null>(null);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ summary, requirements, references, segments }),
    [summary, requirements, references, segments],
  );
  const isDirty = currentSnapshot !== savedSnapshotRef.current && !isInitialLoad;

  const isPlanConfirmed = generationPlan?.status === 'confirmed' || project?.status === 'confirmed';

  const currentStep: WorkflowStep = useMemo(() => {
    if (isInitialLoad) return 'loading';
    if (autoAction === 'starting') return 'starting';
    if (isPlanConfirmed) return 'confirmed';
    if (autoAction === 'parsing') return 'parsing';
    if (!project || !generationPlan && requirements.length === 0 && segments.length === 0) return 'needs_brief';
    if (autoAction === 'planning') return 'planning';
    if (segments.length === 0) return 'editing_brief';
    return 'editing_segments';
  }, [isInitialLoad, autoAction, isPlanConfirmed, project, generationPlan, requirements.length, segments.length]);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: Location; nextLocation: Location }) =>
        isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty],
    ),
  );

  useEffect(() => {
    if (blocker.state === 'blocked' && !showNavConfirm) {
      setShowNavConfirm(true);
    }
  }, [blocker.state, showNavConfirm]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    void loadParsedBrief();
  }, [apiProjectId]);

  function markClean(snapshot?: string) {
    savedSnapshotRef.current = snapshot ?? JSON.stringify({ summary, requirements, references, segments });
  }

  async function loadParsedBrief() {
    setErrorMessage('');
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      setIsInitialLoad(false);
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}`);
      const payload = (await response.json()) as ParsedBriefPayload;
      if (!response.ok) {
        throw new Error('读取项目失败');
      }
      applyParsedPayload(payload);
      const snapshot = JSON.stringify({
        summary: payload.parse_result?.summary ?? '',
        requirements: payload.requirements ?? [],
        references: payload.references ?? [],
        segments: payload.segment_plans ?? [],
      });
      savedSnapshotRef.current = snapshot;
      setIsInitialLoad(false);

      if (!payload.project) {
        setErrorMessage('请先创建项目并提交 brief 输入，再执行解析。');
        return;
      }

      if (!payload.parse_result) {
        setAutoActionMessage(navState?.fromBriefSubmit
          ? `项目「${navState.projectName ?? ''}」已收到 brief，正在自动解析…`
          : '正在自动解析 brief…');
        await runParse();
      } else if ((payload.segment_plans ?? []).length === 0) {
        setAutoActionMessage('解析完成，正在自动生成分段规划…');
        await runGeneratePlan();
      } else {
        setMessage(navState?.fromBriefSubmit ? '已加载之前的解析结果和分段规划，可继续审核。' : '已加载项目方案，可继续审核。');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取项目失败');
      setIsInitialLoad(false);
    }
  }

  async function runParse() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setAutoAction('parsing');
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/parse-brief`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '解析 brief 失败');
      }
      applyParsedPayload(payload);
      markClean();
      setAutoActionMessage('解析完成，正在生成分段规划…');
      await runGeneratePlan();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '解析 brief 失败');
      setAutoAction('idle');
      setAutoActionMessage('');
    }
  }

  async function handleParse() {
    setMessage('');
    if (isDirty) {
      setErrorMessage('请先保存当前修改，再重新解析。');
      return;
    }
    await runParse();
  }

  async function handleSave() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setAutoAction('saving_brief');
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
      markClean();
      setMessage('解析结果已保存。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存解析结果失败');
    } finally {
      setAutoAction('idle');
    }
  }

  async function runGeneratePlan() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      setAutoAction('idle');
      setAutoActionMessage('');
      return;
    }
    setAutoAction('planning');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/segment-plan`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '生成分段规划失败');
      }
      applyParsedPayload(payload);
      markClean();
      setAutoAction('idle');
      setAutoActionMessage('');
      setMessage('已生成分段规划，请检查各片段后再确认。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '生成分段规划失败');
      setAutoAction('idle');
      setAutoActionMessage('');
    }
  }

  async function handleGeneratePlan() {
    setMessage('');
    if (isDirty) {
      setErrorMessage('请先保存当前修改，再重新生成分段规划。');
      return;
    }
    await runGeneratePlan();
  }

  async function handleSaveSegments() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    setAutoAction('saving_segments');
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
      markClean();
      setMessage('分段规划已保存。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存分段规划失败');
    } finally {
      setAutoAction('idle');
    }
  }

  async function handleConfirmPlan() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    if (isDirty) {
      setErrorMessage('请先保存所有修改，再确认生成计划。');
      return;
    }
    setAutoAction('confirming');
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
      markClean();
      setMessage('生成计划已确认，可以启动 Seedance 2.0 视频生成。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '确认生成计划失败');
    } finally {
      setAutoAction('idle');
    }
  }

  async function handleStartGeneration() {
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入确认方案。');
      return;
    }
    if (isDirty) {
      setErrorMessage('请先保存所有修改，再启动生成。');
      return;
    }
    setAutoAction('starting');
    setErrorMessage('');
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/generation-tasks`, { method: 'POST' });
      const payload = (await response.json()) as ParsedBriefPayload & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '启动视频生成失败');
      }
      markClean();
      navigate(`/projects/${apiProjectId}/progress`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '启动视频生成失败');
      setAutoAction('idle');
    }
  }

  function applyParsedPayload(payload: ParsedBriefPayload) {
    setProject(payload.project);
    setGenerationPlan(payload.generation_plan ?? null);
    setSummary(payload.parse_result?.summary ?? '');
    setRequirements(payload.requirements ?? []);
    setReferences(payload.references ?? []);
    setSegments(payload.segment_plans ?? []);
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

  function confirmNavigation() {
    markClean();
    setShowNavConfirm(false);
    if (blocker.proceed) {
      blocker.proceed();
    } else if (pendingNavigation) {
      navigate(pendingNavigation.path, pendingNavigation.opts);
      setPendingNavigation(null);
    }
  }

  function cancelNavigation() {
    setShowNavConfirm(false);
    setPendingNavigation(null);
    if (blocker.reset) blocker.reset();
  }

  const totalSegmentDuration = segments.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0);
  const missingReferences = references.filter((item) => item.is_missing);
  const isBusy = autoAction !== 'idle';

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 3</p>
      <h2>查看和编辑解析结果</h2>
      <p>系统将按"解析 → 分段规划 → 确认启动"的顺序推进，每一步都可审核编辑。</p>

      {!isInitialLoad && currentStep !== 'needs_brief' && (
        <div className="stepper" aria-label="工作流进度">
          {(['parsing', 'editing_brief', 'planning', 'editing_segments', 'confirmed', 'starting'] as const).map((stepKey, idx) => {
            const stepKeys = ['parsing', 'editing_brief', 'planning', 'editing_segments', 'confirmed', 'starting'] as const;
            const currentIdx = stepKeys.indexOf(currentStep as typeof stepKeys[number]);
            const thisIdx = idx;
            const isActive = (stepKey === 'parsing' && (currentStep === 'parsing' || currentStep === 'editing_brief') && currentIdx <= 1)
              || (stepKey === 'planning' && (currentStep === 'planning' || currentStep === 'editing_segments') && currentIdx >= 2 && currentIdx <= 3)
              || (stepKey === 'confirmed' && (currentStep === 'confirmed' || currentStep === 'starting') && currentIdx >= 4);
            const isCurrent = (stepKey === 'parsing' && currentStep === 'parsing')
              || (stepKey === 'editing_brief' && currentStep === 'editing_brief')
              || (stepKey === 'planning' && currentStep === 'planning')
              || (stepKey === 'editing_segments' && currentStep === 'editing_segments')
              || (stepKey === 'confirmed' && currentStep === 'confirmed')
              || (stepKey === 'starting' && currentStep === 'starting');
            return (
              <div key={stepKey} className={`stepper-item${isCurrent ? ' current' : ''}${isActive ? ' done' : ''}`}>
                <span className="stepper-dot" />
                <div>
                  <strong>{stepMeta[stepKey].label}</strong>
                  {isCurrent && <small>{stepMeta[stepKey].description}</small>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isDirty && (
        <div className="unsaved-banner">
          <strong>有未保存的修改</strong>
          <span>您已编辑方案但尚未保存，离开此页面将丢失更改。</span>
        </div>
      )}

      {(autoAction !== 'idle' || autoActionMessage) && autoAction !== 'starting' && (
        <div className="processing-banner">
          <span className="spinner" aria-hidden="true" />
          <span>{autoActionMessage || autoActionLabel(autoAction)}…</span>
        </div>
      )}

      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {message && !isBusy && <p className="success-message">{message}</p>}

      {isInitialLoad ? (
        <p>正在读取方案数据…</p>
      ) : currentStep === 'needs_brief' ? (
        <div className="card">
          <h3>尚未提交 brief</h3>
          <p>请先返回 brief 输入页提交至少一项内容后再进入方案确认。</p>
          <div className="form-actions">
            <Link className="primary-action" to={`/projects/${apiProjectId}/brief`}>去填写 brief</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card status-card">
            <span>生成计划状态</span>
            <h3>{isPlanConfirmed ? '已确认' : isDirty ? '有未保存修改' : '待确认'}</h3>
            <p>
              当前版本：v{generationPlan?.version ?? 0}
              {generationPlan?.confirmed_at ? ` · 确认时间：${new Date(generationPlan.confirmed_at).toLocaleString()}` : ''}
            </p>
            <p>{isPlanConfirmed
              ? '后续视频生成将使用当前确认版本。'
              : isDirty
                ? '请保存当前编辑后，再进行下一步操作。'
                : '请审核解析结果和分段规划，确认后再启动视频生成。'}</p>
          </div>

          <div className="section-actions">
            <button
              className="secondary-action compact-action"
              type="button"
              onClick={() => void handleParse()}
              disabled={isBusy || isDirty}
              title={isDirty ? '请先保存修改再重新解析' : undefined}
            >
              {autoAction === 'parsing' ? '解析中…' : '重新解析 brief'}
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={() => void handleSave()}
              disabled={autoAction === 'saving_brief' || requirements.length === 0}
            >
              {autoAction === 'saving_brief' ? '保存中…' : '保存解析结果'}
            </button>
          </div>

          <label className="full-width block-field">
            解析摘要
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <div className="section-header">
            <h3>结构化需求</h3>
            <button className="secondary-action compact-action" type="button" onClick={addRequirement} disabled={isBusy}>
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
                <button className="secondary-action compact-action" type="button" onClick={() => setRequirements((items) => items.filter((value) => value.id !== item.id))} disabled={isBusy}>
                  删除
                </button>
              </article>
            ))}
          </div>
          <div className="section-header">
            <h3>参考素材与待补充素材</h3>
            <button className="secondary-action compact-action" type="button" onClick={addMissingReference} disabled={isBusy}>
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
                <button className="secondary-action compact-action" type="button" onClick={() => setReferences((items) => items.filter((value) => value.id !== item.id))} disabled={isBusy}>
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
            <div className="section-actions">
              <button
                className="secondary-action compact-action"
                type="button"
                onClick={() => void handleGeneratePlan()}
                disabled={isBusy || isDirty || requirements.length === 0}
                title={isDirty ? '请先保存修改再重新生成' : undefined}
              >
                {autoAction === 'planning' ? '规划中…' : '重新生成规划'}
              </button>
              <button className="secondary-action compact-action" type="button" onClick={addSegment} disabled={isBusy}>
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
                <button className="secondary-action compact-action" type="button" onClick={() => setSegments((items) => items.filter((value) => value.id !== segment.id))} disabled={isBusy}>
                  删除片段
                </button>
              </article>
            ))}
          </div>

          <div className="section-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => void handleSaveSegments()}
              disabled={autoAction === 'saving_segments' || segments.length === 0}
            >
              {autoAction === 'saving_segments' ? '保存中…' : '保存分段规划'}
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={() => void handleConfirmPlan()}
              disabled={isBusy || isDirty || segments.length === 0}
              title={isDirty ? '请先保存所有修改后再确认' : undefined}
            >
              {autoAction === 'confirming' ? '确认中…' : '确认生成计划'}
            </button>
          </div>
        </>
      )}

      <div className="form-actions">
        <button
          className="primary-action"
          type="button"
          onClick={() => void handleStartGeneration()}
          disabled={!isPlanConfirmed || isBusy || isDirty}
          title={!isPlanConfirmed ? '请先确认方案' : isDirty ? '请先保存所有修改' : undefined}
        >
          {autoAction === 'starting' ? '启动中…' : '启动视频生成'}
        </button>
        <Link className="secondary-action" to={`/projects/${apiProjectId}/brief`}>
          返回 brief 输入
        </Link>
      </div>

      {showNavConfirm && (
        <div className="confirm-dialog-overlay" role="dialog" aria-modal="true" aria-label="未保存变更">
          <div className="confirm-dialog">
            <h3>有未保存的修改</h3>
            <p>您对方案的修改尚未保存，离开后将丢失这些更改。确定要离开吗？</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="secondary-action" onClick={cancelNavigation}>继续编辑</button>
              <button type="button" className="primary-action danger" onClick={confirmNavigation}>放弃更改并离开</button>
            </div>
          </div>
        </div>
      )}
    </section>
    ) : (
      <InvalidProjectRoute />
    )
  );
}

function autoActionLabel(action: AutoAction): string {
  switch (action) {
    case 'parsing': return '正在解析 brief';
    case 'planning': return '正在生成分段规划';
    case 'saving_brief': return '正在保存解析结果';
    case 'saving_segments': return '正在保存分段规划';
    case 'confirming': return '正在确认生成计划';
    case 'starting': return '正在启动生成';
    default: return '处理中';
  }
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
