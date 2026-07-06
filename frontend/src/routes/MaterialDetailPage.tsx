import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { MaterialAsset, MaterialAuditEvent, MaterialSearchResponse, MaterialSearchResult, MaterialTag, MaterialVectorIndex } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

interface MaterialDetailRouteState {
  result?: MaterialSearchResult;
}

export function MaterialDetailPage() {
  const { materialId } = useParams();
  const location = useLocation();
  const stateResult = (location.state as MaterialDetailRouteState | null)?.result;
  const [result, setResult] = useState<MaterialSearchResult | null>(stateResult ?? null);
  const [isLoading, setIsLoading] = useState(!stateResult);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (stateResult || !materialId) {
      return;
    }
    void loadMaterial(materialId);
  }, [materialId, stateResult]);

  const material = result?.material ?? null;
  const tags = useMemo(() => normalizeTags(result), [result]);

  async function loadMaterial(id: string) {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/materials/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: id, top_k: 10, asset_types: [], library_types: [], tags: [], include_blocked: true, enable_rag: false }),
      });
      const payload = (await response.json()) as MaterialSearchResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取素材详情失败');
      }
      const exact = (payload.results ?? []).find((item) => item.material.id === id) ?? null;
      setResult(exact);
      if (!exact) {
        setErrorMessage('未找到该素材详情，请从素材库或检索结果进入。');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取素材详情失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel material-panel">
      <p className="eyebrow">Material Detail</p>
      <div className="section-header no-margin">
        <div>
          <h2>素材详情</h2>
          <p>查看素材元数据、标签、索引状态、效果指标和审计记录。</p>
        </div>
        <Link className="secondary-action compact-action" to="/materials">返回素材库</Link>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? <p>正在读取素材详情...</p> : material ? (
        <div className="material-detail-layout">
          <article className="card detail-hero">
            <span>{material.library_type} · {material.asset_type} · {material.status}</span>
            <h3>{materialTitle(material)}</h3>
            <p>{material.description || '暂无素材描述。'}</p>
            <p className="meta-line">ID：{material.id}</p>
            <p className="meta-line">版权：{material.copyright_status} · 合规：{material.compliance_status} · 可见性：{material.visibility}</p>
          </article>
          <DetailSection title="标签">
            {tags.length > 0 ? <div className="tag-row">{tags.map((tag) => <span className="tag-chip" key={tag.name}>{tag.name}{tag.value ? `: ${tag.value}` : ''}</span>)}</div> : <p>暂无标签。</p>}
          </DetailSection>
          <DetailSection title="索引状态">
            {result?.index ? <IndexSummary index={result.index} /> : <p>暂无公开索引详情；完成索引后可在检索结果中验证召回。</p>}
          </DetailSection>
          <DetailSection title="效果指标">
            <RecordList record={material.effect_metrics} emptyText="暂无效果回流指标。" />
          </DetailSection>
          <DetailSection title="技术元数据">
            <RecordList record={material.technical_metadata} emptyText="暂无技术元数据。" />
          </DetailSection>
          <DetailSection title="来源元数据">
            <RecordList record={material.source_metadata} emptyText="暂无来源元数据。" />
          </DetailSection>
          <DetailSection title="审计记录">
            <AuditList events={result?.audit_events ?? []} />
          </DetailSection>
        </div>
      ) : (
        <div className="card warning-card material-empty">
          <span>未找到素材</span>
          <h3>请从素材列表或检索结果进入详情</h3>
          <Link className="primary-action compact-action" to="/materials/search">去检索素材</Link>
        </div>
      )}
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card detail-section"><h3>{title}</h3>{children}</section>;
}

function IndexSummary({ index }: { index: MaterialVectorIndex }) {
  return (
    <div className="metric-grid">
      <Metric label="状态" value={index.status} />
      <Metric label="分区" value={index.partition_key ?? '未设置'} />
      <Metric label="向量维度" value={index.vector_dim?.toString() ?? '未知'} />
      <Metric label="模型版本" value={index.embedding_version ?? index.embedding_model ?? '未知'} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

function RecordList({ record, emptyText }: { record: Record<string, unknown>; emptyText: string }) {
  const entries = Object.entries(record ?? {});
  if (entries.length === 0) {
    return <p>{emptyText}</p>;
  }
  return <dl className="metadata-list">{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatValue(value)}</dd></div>)}</dl>;
}

function AuditList({ events }: { events: MaterialAuditEvent[] }) {
  if (events.length === 0) {
    return <p>暂无公开审计记录。</p>;
  }
  return <ul className="audit-list">{events.map((event) => <li key={event.id}><strong>{event.action}</strong><span>{new Date(event.created_at).toLocaleString()} · {event.actor ?? 'system'}</span></li>)}</ul>;
}

function normalizeTags(result: MaterialSearchResult | null): MaterialTag[] {
  if (!result) {
    return [];
  }
  if (result.tags?.length) {
    return result.tags;
  }
  return result.matched_tags.map((tag, index) => ({
    id: `${result.material.id}-${tag}-${index}`,
    material_id: result.material.id,
    category: 'content',
    name: tag,
    value: null,
    confidence: 1,
    source: 'system',
    needs_review: false,
    created_at: result.material.created_at,
    updated_at: result.material.updated_at,
  }));
}

function materialTitle(material: MaterialAsset): string {
  return material.title || material.filename || material.source_uri || `素材 ${material.id.slice(0, 8)}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '无';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
