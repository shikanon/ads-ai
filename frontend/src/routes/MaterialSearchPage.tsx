import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialAssetType, MaterialLibraryType, MaterialRagAnswer, MaterialSearchResponse, MaterialSearchResult } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

const assetOptions: Array<{ value: MaterialAssetType; label: string }> = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文本' },
  { value: 'project', label: '工程源文件' },
  { value: 'other', label: '其他' },
];

const libraryOptions: Array<{ value: MaterialLibraryType; label: string }> = [
  { value: 'raw', label: '原始素材' },
  { value: 'finished', label: '成品素材' },
  { value: 'knowledge', label: '经验知识' },
];

export function MaterialSearchPage() {
  const [query, setQuery] = useState('哪些高转化素材适合夏日饮料开场？');
  const [assetType, setAssetType] = useState('');
  const [libraryType, setLibraryType] = useState('');
  const [tagText, setTagText] = useState('');
  const [enableRag, setEnableRag] = useState(true);
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [answer, setAnswer] = useState<MaterialRagAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setAnswer(null);
    setResults([]);
    if (!query.trim()) {
      setErrorMessage('请输入检索问题。');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/materials/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          top_k: 8,
          asset_types: assetType ? [assetType] : [],
          library_types: libraryType ? [libraryType] : [],
          tags: splitTags(tagText),
          include_blocked: false,
          enable_rag: enableRag,
        }),
      });
      const payload = (await response.json()) as MaterialSearchResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '素材检索失败');
      }
      setResults(payload.results ?? []);
      setAnswer(payload.answer ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '素材检索失败');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="panel material-panel material-search-panel">
      <p className="eyebrow">RAG Search</p>
      <div className="section-header no-margin">
        <div>
          <h2>多模态素材检索</h2>
          <p>用自然语言召回素材，查看证据、匹配标签与 RAG 回答，辅助创意复用和投放复盘。</p>
        </div>
        <Link className="secondary-action compact-action" to="/materials/insights">查看洞察</Link>
      </div>
      <form className="material-search-form" onSubmit={(event) => void handleSearch(event)}>
        <label className="full-width">
          检索问题
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：推荐适合新品上市的高 CTR 片头素材" />
        </label>
        <label>
          素材类型
          <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
            <option value="">全部类型</option>
            {assetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          库类型
          <select value={libraryType} onChange={(event) => setLibraryType(event.target.value)}>
            <option value="">全部库</option>
            {libraryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          标签过滤
          <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="high_ctr, 夏日" />
        </label>
        <label className="inline-field rag-toggle">
          <input type="checkbox" checked={enableRag} onChange={(event) => setEnableRag(event.target.checked)} />
          生成 RAG 回答
        </label>
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        <button className="primary-action" type="submit" disabled={isSearching}>{isSearching ? '检索中...' : '开始检索'}</button>
      </form>
      {answer && <RagAnswerPanel answer={answer} />}
      {results.length > 0 && (
        <div className="material-results">
          {results.map((result) => (
            <article className="card search-result-card" key={result.material.id}>
              <div className="material-card-topline">
                <span>Score {Math.round(result.score * 100)}%</span>
                <strong>{result.material.asset_type} / {result.material.library_type}</strong>
              </div>
              <h3>{result.material.title || result.material.filename || `素材 ${result.material.id.slice(0, 8)}`}</h3>
              <p>{result.material.description || '暂无描述'}</p>
              <div className="tag-row">
                {result.matched_tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
              </div>
              {result.evidence.length > 0 && (
                <ul className="evidence-list">
                  {result.evidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              <Link className="secondary-action compact-action" to={`/materials/${result.material.id}`} state={{ result }}>查看详情</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RagAnswerPanel({ answer }: { answer: MaterialRagAnswer }) {
  return (
    <aside className="rag-answer" aria-label="RAG 回答">
      <span>{answer.fallback ? 'Fallback Answer' : 'Model Answer'}</span>
      <h3>RAG 回答</h3>
      <p>{answer.answer}</p>
      {answer.citations.length > 0 && <p className="meta-line">引用：{answer.citations.join('、')}</p>}
    </aside>
  );
}

function splitTags(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}
