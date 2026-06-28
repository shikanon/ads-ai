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
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        <div className="form-actions full-width">
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '创建中...' : '创建并进入 brief 输入'}
          </button>
          <Link className="secondary-action" to="/history">
            查看历史记录
          </Link>
        </div>
      </form>
    </section>
  );
}
