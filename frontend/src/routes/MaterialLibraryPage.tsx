import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialAsset, MaterialAssetType, MaterialLibraryType, MaterialSearchResponse, MaterialSearchResult, MaterialStatus } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const libraryOptions: Array<{ value: MaterialLibraryType; label: string }> = [
  { value: 'raw', label: '原始素材' },
  { value: 'finished', label: '成品素材' },
  { value: 'knowledge', label: '经验知识' },
];

const assetOptions: Array<{ value: MaterialAssetType; label: string }> = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文本' },
  { value: 'project', label: '工程源文件' },
  { value: 'other', label: '其他' },
];

const statusOptions: Array<{ value: MaterialStatus; label: string }> = [
  { value: 'received', label: '已接收' },
  { value: 'preprocessed', label: '已预处理' },
  { value: 'tagged', label: '已打标' },
  { value: 'indexed', label: '已索引' },
  { value: 'searchable', label: '可检索' },
  { value: 'blocked', label: '已阻断' },
  { value: 'failed', label: '失败' },
];

const statusLabels = Object.fromEntries(statusOptions.map((item) => [item.value, item.label])) as Record<MaterialStatus, string>;
const assetLabels = Object.fromEntries(assetOptions.map((item) => [item.value, item.label])) as Record<MaterialAssetType, string>;
const libraryLabels = Object.fromEntries(libraryOptions.map((item) => [item.value, item.label])) as Record<MaterialLibraryType, string>;

export function MaterialLibraryPage() {
  const [query, setQuery] = useState('素材');
  const [libraryType, setLibraryType] = useState('');
  const [assetType, setAssetType] = useState('');
  const [status, setStatus] = useState('');
  const [tagText, setTagText] = useState('');
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadMaterials();
  }, []);

  const visibleResults = useMemo(() => {
    if (!status) {
      return results;
    }
    return results.filter((result) => result.material.status === status);
  }, [results, status]);

  async function loadMaterials(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/materials/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim() || '素材',
          top_k: 50,
          asset_types: assetType ? [assetType] : [],
          library_types: libraryType ? [libraryType] : [],
          tags: splitTags(tagText),
          include_blocked: status === 'blocked',
          enable_rag: false,
        }),
      });
      const payload = (await response.json()) as MaterialSearchResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取素材库失败');
      }
      setResults(payload.results ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取素材库失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel material-panel">
      <p className="eyebrow">Material Library</p>
      <div className="section-header no-margin">
        <div>
          <h2>广告素材库</h2>
          <p>按库类型、素材类型、状态和标签筛选可复用资产，快速回到上传、检索与经验沉淀流程。</p>
        </div>
        <div className="material-actions">
          <Link className="secondary-action compact-action" to="/materials/search">
            多模态检索
          </Link>
          <Link className="primary-action compact-action" to="/materials/upload">
            上传素材
          </Link>
        </div>
      </div>
      <form className="material-filter-bar" onSubmit={(event) => void loadMaterials(event)}>
        <label>
          关键词
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：夏日饮料、开场 hook" />
        </label>
        <label>
          库类型
          <select value={libraryType} onChange={(event) => setLibraryType(event.target.value)}>
            <option value="">全部库类型</option>
            {libraryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          素材类型
          <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
            <option value="">全部素材类型</option>
            {assetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="full-width">
          标签
          <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="用逗号分隔，如 high_ctr, product_packshot" />
        </label>
        <button className="primary-action compact-action" type="submit" disabled={isLoading}>
          {isLoading ? '筛选中...' : '筛选素材'}
        </button>
      </form>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? (
        <p>正在读取素材库...</p>
      ) : visibleResults.length === 0 ? (
        <div className="card warning-card material-empty">
          <span>暂无素材</span>
          <h3>上传或导入素材后会在这里展示</h3>
          <p>素材入库后可继续打标、索引并进入 RAG 检索链路。</p>
          <div className="form-actions">
            <Link className="primary-action compact-action" to="/materials/upload">上传素材</Link>
            <Link className="secondary-action compact-action" to="/materials/search">去检索</Link>
          </div>
        </div>
      ) : (
        <div className="material-grid">
          {visibleResults.map((result) => (
            <MaterialCard key={result.material.id} result={result} />
          ))}
        </div>
      )}
    </section>
  );
}

function MaterialCard({ result }: { result: MaterialSearchResult }) {
  const material = result.material;
  return (
    <article className="card material-card">
      <div className="material-card-topline">
        <span>{libraryLabels[material.library_type]} · {assetLabels[material.asset_type]}</span>
        <strong>{statusLabels[material.status]}</strong>
      </div>
      <h3>{materialTitle(material)}</h3>
      <p>{material.description || '暂无描述，可通过 AI 打标和人工校准补全素材语义。'}</p>
      <div className="tag-row" aria-label="素材标签">
        {result.matched_tags.length > 0 ? result.matched_tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>) : <span className="tag-chip muted-chip">待补充标签</span>}
      </div>
      <p className="meta-line">分数：{formatScore(result.score)} · 更新：{formatDate(material.updated_at)}</p>
      <Link className="secondary-action compact-action" to={`/materials/${material.id}`} state={{ result }}>
        查看详情
      </Link>
    </article>
  );
}

function splitTags(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function materialTitle(material: MaterialAsset): string {
  return material.title || material.filename || material.source_uri || `素材 ${material.id.slice(0, 8)}`;
}

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
