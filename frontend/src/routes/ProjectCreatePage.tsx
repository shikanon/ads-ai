import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProjectDraft } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

type CreateMode = 'quick' | 'with-requirement';

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('quick');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const trimmedName = name.trim();
  const trimmedRequirement = requirementText.trim();
  const nameValid = trimmedName.length > 0;
  const hasRequirement = trimmedRequirement.length > 0;

  const canSubmit = useMemo(() => {
    if (!nameValid) {
      return false;
    }
    if (createMode === 'with-requirement' && !hasRequirement) {
      return false;
    }
    return true;
  }, [createMode, hasRequirement, nameValid]);

  const submitHint = useMemo(() => {
    if (!nameValid) {
      return '请先输入项目名称。';
    }
    if (createMode === 'quick') {
      return '将创建草稿项目，下一步可上传 PDF/PPT brief、参考素材或输入需求文本。';
    }
    if (!hasRequirement) {
      return '请填写需求摘要，或切换到"快速建项"稍后补充 brief。';
    }
    return '将创建项目并携带初始需求摘要，下一步仍可补充文件和素材。';
  }, [createMode, hasRequirement, nameValid]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!nameValid) {
      setErrorMessage('请输入项目名称。');
      return;
    }
    if (createMode === 'with-requirement' && !hasRequirement) {
      setErrorMessage('请填写需求摘要，或选择"快速建项（稍后补充 brief）"。');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          requirement_text: hasRequirement ? trimmedRequirement : undefined,
          target_duration_seconds: targetDurationSeconds ? Number(targetDurationSeconds) : undefined,
        }),
      });
      const payload = (await response.json()) as { project?: ProjectDraft; error?: { message?: string } };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error?.message ?? '创建项目失败');
      }
      navigate(`/projects/${payload.project.id}/brief`, {
        state: {
          createdDraft: !hasRequirement,
          projectName: payload.project.name,
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Step 1</p>
      <h2>创建广告 TVC 项目</h2>
      <p>填写项目名称和目标片长。你可以快速建项后在下一步上传 brief 和参考素材，也可以先输入需求摘要。</p>

      <div className="mode-selector" role="radiogroup" aria-label="创建模式">
        <label className="mode-card">
          <input
            type="radio"
            name="createMode"
            value="quick"
            checked={createMode === 'quick'}
            onChange={() => setCreateMode('quick')}
          />
          <div>
            <strong>快速建项（推荐）</strong>
            <small>先创建草稿，下一步上传 PDF/PPT brief、参考视频/图片/音频或输入需求文本。</small>
          </div>
        </label>
        <label className="mode-card">
          <input
            type="radio"
            name="createMode"
            value="with-requirement"
            checked={createMode === 'with-requirement'}
            onChange={() => setCreateMode('with-requirement')}
          />
          <div>
            <strong>携带需求摘要创建</strong>
            <small>创建时直接输入品牌、卖点、受众等摘要，适合需求已经明确的场景。</small>
          </div>
        </label>
      </div>

      <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          项目名称 <span className="required-mark">*</span>
          <input placeholder="例如：夏季新品 60 秒广告" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          目标片长（秒）
          <input
            type="number"
            min="1"
            placeholder="60"
            value={targetDurationSeconds}
            onChange={(event) => setTargetDurationSeconds(event.target.value)}
          />
        </label>
        <label className="full-width">
          需求摘要{createMode === 'with-requirement' ? ' <span className="required-mark">*</span>' : '（可选）'}
          <textarea
            placeholder={createMode === 'with-requirement' ? '输入品牌、产品、受众、卖点、风格和禁用项' : '可选：先输入核心需求，后续可在 brief 页补充文件和参考素材'}
            value={requirementText}
            onChange={(event) => setRequirementText(event.target.value)}
          />
        </label>
        <div className="full-width hint-box">
          <span>下一步：Step 2 输入 brief 与参考素材</span>
          <p>{submitHint}</p>
        </div>
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        <div className="form-actions full-width">
          <button className="primary-action" type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? '创建中...' : createMode === 'quick' ? '创建草稿并进入 brief 输入' : '创建项目并进入 brief 输入'}
          </button>
          <Link className="secondary-action" to="/history">
            查看历史记录
          </Link>
        </div>
      </form>
    </section>
  );
}
