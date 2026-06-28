import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProjectDraft } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const hasRequirementText = Boolean(requirementText.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage('请输入项目名称。');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          requirement_text: requirementText.trim() || undefined,
          target_duration_seconds: targetDurationSeconds ? Number(targetDurationSeconds) : undefined,
        }),
      });
      const payload = (await response.json()) as { project?: ProjectDraft; error?: { message?: string } };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error?.message ?? '创建项目失败');
      }
      navigate(`/projects/${payload.project.id}/brief`);
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
      <p>填写项目名称、目标片长和基础需求，后续可上传 PDF/PPT brief 或补充参考素材。</p>
      <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          项目名称
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
          需求摘要
          <textarea
            placeholder="输入品牌、产品、受众、卖点、风格和禁用项"
            value={requirementText}
            onChange={(event) => setRequirementText(event.target.value)}
          />
        </label>
        <div className={`input-readiness full-width ${hasRequirementText ? 'readiness-ready' : 'readiness-draft'}`}>
          <span>需求输入完整度</span>
          <h3>{hasRequirementText ? '已具备文本需求输入' : '将创建为待补充 brief 草稿'}</h3>
          <p>
            {hasRequirementText
              ? '当前需求摘要会作为初始需求文本保存，进入 Brief 输入页后可继续补充 brief 文件、URL/TOS 或参考素材。'
              : '需求摘要为空时仍可先创建项目，但创建后会成为“待补充 brief 草稿”。下一步需要在 Brief 输入页上传 brief 文件、填写 URL/TOS、提供参考素材或输入需求文本后才能解析。'}
          </p>
        </div>
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        <div className="form-actions full-width">
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '创建中...' : hasRequirementText ? '创建并进入 brief 输入' : '创建草稿并补充 brief'}
          </button>
          <Link className="secondary-action" to="/history">
            查看历史记录
          </Link>
        </div>
      </form>
    </section>
  );
}
