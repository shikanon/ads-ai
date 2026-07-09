import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Eye, Play, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { MaterialAsset, MaterialAuditEvent, MaterialSearchResponse, MaterialSearchResult, MaterialTag, MaterialVectorIndex } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

interface MaterialDetailRouteState {
  result?: MaterialSearchResult;
}

const pipelineSteps = [
  { label: '接收', status: '完成', tone: 'done', detail: '记录上传、TOS 导入或外部 API 来源' },
  { label: '清洗', status: '完成', tone: 'done', detail: '完成格式、大小、完整性与可解析性校验' },
  { label: '去重', status: '完成', tone: 'done', detail: '计算 MD5 / 内容 hash 并保留重复关系' },
  { label: '元数据', status: '完成', tone: 'done', detail: '抽取尺寸、时长、编码、分辨率和文本长度' },
  { label: '打标', status: '待校准', tone: 'review', detail: 'AI 标签可确认、编辑或删除，低置信度需校准' },
  { label: '向量化', status: '完成', tone: 'done', detail: '构造 embedding 输入并记录模型版本和 fallback 状态' },
  { label: '索引完成', status: '当前', tone: 'current', detail: '写入 VikingDB collection、分区与可检索时间' },
  { label: '风险校验', status: '待复核', tone: 'review', detail: '校验版权、禁用词、合规风险和 blocked 状态' },
];

const currentPipelineStep = pipelineSteps.find((step) => step.tone === 'current') ?? pipelineSteps[pipelineSteps.length - 1];

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
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <Badge className="w-fit" variant="secondary">Material Detail</Badge>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">素材详情</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">查看素材元数据、标签、索引状态、效果指标和审计记录。</p>
        </div>
          <Button asChild className="w-fit" variant="outline">
            <Link to="/materials">返回素材库</Link>
          </Button>
      </header>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>读取素材详情失败</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {isLoading ? <p>正在读取素材详情...</p> : material ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <MaterialDetailHero result={result!} tags={tags} />
          <DetailSection className="xl:col-span-2" title="召回证据">
            <RecallEvidence result={result!} />
          </DetailSection>
          <DetailSection className="xl:col-span-2" title="入库流水线">
            <IngestionPipeline />
          </DetailSection>
          <div className="grid gap-6 xl:col-span-2 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6">
              <DetailSection title="标签">
                {tags.length > 0 ? <div className="flex flex-wrap gap-2">{tags.map((tag) => <Badge key={tag.name} variant="secondary">{tag.name}{tag.value ? `: ${tag.value}` : ''}</Badge>)}</div> : <p className="text-sm text-muted-foreground">暂无标签。</p>}
              </DetailSection>
              <DetailSection title="索引状态">
                {result?.index ? <IndexSummary index={result.index} /> : <p>暂无公开索引详情；完成索引后可在检索结果中验证召回。</p>}
              </DetailSection>
              <DetailSection title="技术元数据">
                <RecordList record={material.technical_metadata} emptyText="暂无技术元数据。" />
              </DetailSection>
              <DetailSection title="审计记录">
                <AuditList events={result?.audit_events ?? []} />
              </DetailSection>
            </div>
            <aside className="flex flex-col gap-6">
              <DetailSection title="标签管理">
                <TagGovernance tags={tags} />
              </DetailSection>
              <DetailSection title="效果指标">
                <RecordList record={material.effect_metrics} emptyText="暂无效果回流指标。" />
              </DetailSection>
              <DetailSection title="来源元数据">
                <RecordList record={material.source_metadata} emptyText="暂无来源元数据。" />
              </DetailSection>
            </aside>
          </div>
        </div>
      ) : (
        <Alert>
          <AlertTitle>未找到素材</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>请从素材列表或检索结果进入详情</span>
            <Button asChild className="w-fit"><Link to="/materials/search">去检索素材</Link></Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function MaterialDetailHero({ result, tags }: { result: MaterialSearchResult; tags: MaterialTag[] }) {
  const material = result.material;
  const media = materialMedia(material);
  const tagQuality = tags.length > 0 ? Math.round(tags.reduce((sum, tag) => sum + tag.confidence, 0) / tags.length * 100) : 0;
  const hasEffect = Object.keys(material.effect_metrics).length > 0;
  const technicalLabel = [formatValue(material.technical_metadata.width), formatValue(material.technical_metadata.height)]
    .filter((value) => value !== '无')
    .join('x') || media.ratio;
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 xl:col-span-2 xl:grid-cols-[minmax(320px,520px)_1fr]" aria-label="素材预览">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {media.videoUrl ? (
          <video className="h-full w-full object-cover" muted playsInline controls preload="metadata" poster={media.thumbnailUrl}>
            <source src={media.videoUrl} type="video/mp4" />
          </video>
        ) : media.thumbnailUrl ? (
          <img className="h-full w-full object-cover" src={media.thumbnailUrl} alt="" />
        ) : (
          <div className="flex h-full flex-col justify-between p-4">
            <Badge className="w-fit" variant="secondary">{material.asset_type}</Badge>
            <strong>{material.description || materialTitle(material)}</strong>
          </div>
        )}
        {material.asset_type === 'video' && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-xs font-medium text-white">
            <Play className="size-3" />{media.duration}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{material.library_type}</Badge>
          <Badge variant="secondary">{material.asset_type}</Badge>
          <Badge variant="outline">{material.status}</Badge>
          <Badge variant="outline">{media.channel}</Badge>
        </div>
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{materialTitle(material)}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{material.description || '暂无素材描述，已根据类型和索引状态生成基础档案。'}</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <HeroInsight title="素材档案" value={`${media.ratio} · ${media.duration}`} detail={`ID ${material.id}`} />
          <HeroInsight title="AI 标签质量" value={tagQuality ? `${tagQuality}%` : '待打标'} detail={`${tags.length || result.matched_tags.length} 个可用标签`} />
          <HeroInsight title="投放信号" value={hasEffect ? formatMetric(material.effect_metrics.ctr) : '待回流'} detail={`复用 ${formatMetric(material.effect_metrics.reuse_count ?? material.effect_metrics.reuseCount)}`} />
          <HeroInsight title="技术质量" value={technicalLabel} detail={`索引 ${result.index?.status ?? material.status}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm"><Sparkles />生成复用方案</Button>
          <Button asChild size="sm" variant="outline"><Link to="/materials/search"><Eye />查找相似</Link></Button>
        </div>
      </div>
    </section>
  );
}

function HeroInsight({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-muted/25 p-3">
      <span className="text-xs text-muted-foreground">{title}</span>
      <strong className="mt-1 block text-base">{value}</strong>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function RecallEvidence({ result }: { result: MaterialSearchResult }) {
  const material = result.material;
  const evidence = result.evidence.length > 0 ? result.evidence : ['标题、标签和向量相似度共同命中'];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-2">
        {evidence.map((item) => (
          <div className="rounded-lg border bg-background px-3 py-2 text-sm" key={item}>{item}</div>
        ))}
      </div>
      <div className="rounded-lg border bg-muted/25 p-3 text-sm leading-6">
        <strong>可复用建议</strong>
        <p className="mt-2 text-muted-foreground">
          {material.status === 'searchable' ? '可直接加入 Brief 复用；优先保留当前标签和索引分区，便于相似召回。' : '建议先完成打标、向量化和风险复核，再进入默认召回池。'}
        </p>
      </div>
    </div>
  );
}

function DetailSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle><h3>{title}</h3></CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function IndexSummary({ index }: { index: MaterialVectorIndex }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="状态" value={index.status} />
      <Metric label="分区" value={index.partition_key ?? '未设置'} />
      <Metric label="向量维度" value={index.vector_dim?.toString() ?? '未知'} />
      <Metric label="模型版本" value={index.embedding_version ?? index.embedding_model ?? '未知'} />
    </div>
  );
}

function IngestionPipeline() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/25 px-3 py-2">
        <strong>当前阶段：{currentPipelineStep.label}</strong>
        <span className="text-sm text-muted-foreground">素材已进入可检索池，等待风险复核完成后进入默认召回。</span>
      </div>
      <ol className="relative grid gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="入库流水线">
        {pipelineSteps.map((step, index) => (
          <li
            aria-label={`流水线阶段：${step.label}`}
            className="relative rounded-lg border bg-background p-3"
            key={step.label}
          >
            {index < pipelineSteps.length - 1 && (
              <span className="pointer-events-none absolute left-[calc(50%+1.5rem)] top-7 hidden h-px w-[calc(100%-3rem)] bg-border md:block" />
            )}
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  step.tone === 'current' && 'border-primary bg-primary text-primary-foreground',
                  step.tone === 'done' && 'border-primary/35 bg-primary/10 text-primary',
                  step.tone === 'review' && 'border-border bg-muted text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{step.label}</strong>
                  <Badge variant={step.tone === 'current' ? 'default' : 'secondary'}>{step.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TagGovernance({ tags }: { tags: MaterialTag[] }) {
  const visibleTags = tags.length > 0 ? tags : [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" aria-label="标签管理操作">
        <Button type="button" size="sm" variant="secondary">新增标签</Button>
        <Button type="button" size="sm" variant="secondary">编辑标签</Button>
        <Button type="button" size="sm" variant="destructive">删除标签</Button>
        <Button type="button" size="sm">确认 AI 标签</Button>
      </div>
      {visibleTags.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无可治理标签。</p>
      ) : (
        <div className="grid gap-3">
          {visibleTags.map((tag) => {
            const dimension = tag.dimension ?? tag.category;
            const isEffect = dimension === 'effect';
            const isCompliance = dimension === 'compliance';
            const isAi = tag.source === 'ai';
            const isLocked = Boolean(tag.locked);
            return (
              <article className="grid gap-4 rounded-xl border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_auto]" key={tag.id}>
                <div className="flex flex-col gap-2">
                  <strong>{tag.name}{tag.value ? `: ${tag.value}` : ''}</strong>
                  <span className="text-sm text-muted-foreground">{dimension} · {sourceLabel(tag.source)} · 置信度 {Math.round(tag.confidence * 100)}%</span>
                  <span className="text-sm text-muted-foreground">创建人 {tag.createdBy ?? 'system'} · 更新 {tag.updatedAt ?? tag.updated_at}</span>
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  <Button type="button" size="sm" disabled={!isAi || isLocked}>{isAi ? '确认 AI 标签' : '已人工校准'}</Button>
                  <Button type="button" size="sm" variant="secondary" disabled={isLocked}>编辑</Button>
                  <Button type="button" size="sm" variant="destructive" disabled={isEffect || isLocked}>{isCompliance ? '需二次确认后删除' : '删除'}</Button>
                  {isEffect && <Badge variant="outline">效果标签不可直接删除，只能隐藏或标记不参与排序</Badge>}
                  {isCompliance && <Badge variant="outline">合规标签删除需二次确认文案，并写入审计记录</Badge>}
                  {isLocked && <Badge variant="outline">locked 标签只读</Badge>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Separator />
      <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
        <p>AI 标签确认后会作为人工校准结果参与检索排序。</p>
        <p>效果标签默认不可直接删除，只允许隐藏或标记不参与排序。</p>
        <p>合规标签删除需要二次确认文案，并展示审计记录要求。</p>
        <p>locked 标签表现为只读或禁用状态。</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-muted/35 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{value}</strong></div>;
}

function RecordList({ record, emptyText }: { record: Record<string, unknown>; emptyText: string }) {
  const entries = Object.entries(record ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return <dl className="grid gap-3 md:grid-cols-2">{entries.map(([key, value]) => <div className="rounded-xl border bg-background p-3" key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 text-sm font-medium">{formatValue(value)}</dd></div>)}</dl>;
}

function AuditList({ events }: { events: MaterialAuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无公开审计记录。</p>;
  }
  return <ul className="grid gap-3">{events.map((event) => <li className="rounded-xl border bg-background p-3" key={event.id}><strong>{event.action}</strong><span className="mt-1 block text-sm text-muted-foreground">{new Date(event.created_at).toLocaleString()} · {event.actor ?? 'system'}</span></li>)}</ul>;
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
      dimension: 'content',
    name: tag,
    value: null,
    confidence: 1,
    source: 'system',
    needs_review: false,
      createdBy: 'system',
      updatedAt: result.material.updated_at,
    created_at: result.material.created_at,
    updated_at: result.material.updated_at,
  }));
}

function sourceLabel(source: MaterialTag['source']): string {
  const labels: Record<MaterialTag['source'], string> = {
    ai: 'AI 自动打标',
    human: '人工校准',
    system: '系统派生',
    effect_backflow: '效果回流',
    system_rule: '系统规则',
  };
  return labels[source];
}

function materialMedia(material: MaterialAsset) {
  const metadata = material.source_metadata;
  return {
    thumbnailUrl: stringMetadata(metadata, 'thumbnail_url') || (material.asset_type === 'image' ? material.source_uri ?? '' : ''),
    videoUrl: stringMetadata(metadata, 'preview_video_url') || (material.asset_type === 'video' ? material.source_uri ?? '' : ''),
    ratio: stringMetadata(metadata, 'ratio') || 'Auto',
    duration: stringMetadata(metadata, 'duration') || (typeof material.technical_metadata.duration_seconds === 'number' ? `${material.technical_metadata.duration_seconds}s` : 'Asset'),
    channel: stringMetadata(metadata, 'channel') || '未标注渠道',
  };
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function materialTitle(material: MaterialAsset): string {
  return material.title || material.filename || material.source_uri || `素材 ${material.id.slice(0, 8)}`;
}

function formatMetric(value: unknown): string {
  if (typeof value !== 'number') {
    return '-';
  }
  if (value > 0 && value < 1) {
    return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
  }
  if (value >= 1000) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return String(value);
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
