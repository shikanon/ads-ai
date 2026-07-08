import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MaterialAsset, MaterialAssetType, MaterialLibraryType, MaterialSearchResponse, MaterialSearchResult, MaterialStatus, MaterialTag } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';
const ALL_VALUE = '__all__';

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
const statusTone: Record<MaterialStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  received: 'neutral',
  preprocessed: 'neutral',
  tagged: 'warning',
  indexed: 'success',
  searchable: 'success',
  blocked: 'danger',
  failed: 'danger',
};

const recallExplainItems = [
  { label: '向量召回', value: '42 条', detail: 'doubao embedding fallback，相似度 0.72-0.91' },
  { label: '标签过滤', value: '命中 6 组', detail: '家庭伦理、9:16、信息流、高 CTR' },
  { label: '效果加权', value: '+0.14', detail: 'CTR 高于库均值 22%，复用次数进入排序' },
  { label: 'RAG 引用来源', value: '3 类', detail: '素材摘要、经验模板、成品投放复盘' },
];

export function MaterialLibraryPage() {
  const [query, setQuery] = useState('素材');
  const [libraryType, setLibraryType] = useState('');
  const [assetType, setAssetType] = useState('');
  const [status, setStatus] = useState('');
  const [tagText, setTagText] = useState('');
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [isRecallOpen, setIsRecallOpen] = useState(false);
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

  const selectedResult = useMemo(() => {
    return visibleResults.find((result) => result.material.id === selectedMaterialId) ?? visibleResults[0] ?? null;
  }, [selectedMaterialId, visibleResults]);

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
      const nextResults = payload.results ?? [];
      setResults(nextResults);
      setSelectedMaterialId(nextResults[0]?.material.id ?? '');
      setSelectedIds([]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取素材库失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <Badge className="w-fit" variant="secondary">Material Library</Badge>
          <CardTitle><h2 className="text-3xl font-semibold tracking-tight">广告素材库</h2></CardTitle>
          <CardDescription className="text-base leading-7">
            按库类型、素材类型、状态和标签筛选可复用资产，快速回到上传、检索与经验沉淀流程。
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <Button asChild size="lg" variant="outline">
              <Link to="/materials/search">多模态检索</Link>
            </Button>
            <Button asChild size="lg">
              <Link to="/materials/upload">上传素材</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 rounded-xl border bg-muted/35 p-4 md:grid-cols-[auto_1fr_auto]" aria-label="素材库当前视图摘要">
            <span className="text-sm text-muted-foreground">当前视图</span>
            <strong>{isLoading ? '读取素材资产' : `${visibleResults.length} 条可见资产`}</strong>
            <span className="text-sm text-muted-foreground">{status ? `状态筛选：${statusLabels[status as MaterialStatus]}` : '普通检索默认排除风险素材'}</span>
          </div>
        </CardContent>
      </Card>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>读取素材库失败</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle><h3>筛选 Rail</h3></CardTitle>
            <CardDescription>组合语义、标签和状态过滤。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void loadMaterials(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="material-query">关键词</FieldLabel>
                  <Input id="material-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：夏日饮料、开场 hook" />
                </Field>
                <FilterSelect label="库类型" options={libraryOptions} placeholder="全部库类型" value={libraryType} onChange={setLibraryType} />
                <FilterSelect label="素材类型" options={assetOptions} placeholder="全部素材类型" value={assetType} onChange={setAssetType} />
                <FilterSelect label="状态" options={statusOptions} placeholder="全部状态" value={status} onChange={setStatus} />
                <Field>
                  <FieldLabel htmlFor="material-tags">标签</FieldLabel>
                  <Input id="material-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="high_ctr, product_packshot" />
                </Field>
                <Button className="w-full" type="submit" disabled={isLoading}>
                  {isLoading ? '筛选中...' : '筛选素材'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <main className="flex min-w-0 flex-col gap-4">
          <Card aria-label="索引与召回解释">
            <CardHeader>
              <CardTitle><h3>索引与召回解释</h3></CardTitle>
              <CardDescription>向量召回、标签过滤、效果加权与 RAG 引用共同影响排序</CardDescription>
              <CardAction>
                <Button type="button" onClick={() => setIsRecallOpen((current) => !current)} aria-expanded={isRecallOpen} variant="outline" size="sm">
                  {isRecallOpen ? '折叠召回解释' : '展开召回解释'}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className={cn('grid gap-3 md:grid-cols-4', !isRecallOpen && 'md:grid-cols-4')}>
                {recallExplainItems.map((item) => (
                  <article className="rounded-xl border bg-background p-3" key={item.label}>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <strong className="mt-1 block">{item.value}</strong>
                    {isRecallOpen && <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>}
                  </article>
                ))}
              </div>
              {isRecallOpen && (
                <div className="flex h-8 overflow-hidden rounded-full border bg-muted text-xs font-medium" aria-label="召回来源占比">
                  <span className="flex items-center justify-center bg-primary text-primary-foreground" style={{ width: '42%' }}>向量 42%</span>
                  <span className="flex items-center justify-center bg-chart-2/70" style={{ width: '26%' }}>标签 26%</span>
                  <span className="flex items-center justify-center bg-chart-3/70" style={{ width: '20%' }}>效果 20%</span>
                  <span className="flex items-center justify-center bg-chart-5/70 text-primary-foreground" style={{ width: '12%' }}>人工 12%</span>
                </div>
              )}
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingAssetSkeleton />
          ) : visibleResults.length === 0 ? (
            <Alert>
              <AlertTitle>暂无匹配资产</AlertTitle>
              <AlertDescription className="flex flex-col gap-4">
                <span>调整筛选，或先看素材入库链路</span>
                <span>素材入库后可继续打标、索引并进入 RAG 检索链路；blocked 素材只在风险筛选下展示。</span>
                <span className="flex flex-wrap gap-2">
                  <Button asChild><Link to="/materials/upload">上传素材</Link></Button>
                  <Button asChild variant="outline"><Link to="/materials/search">去检索</Link></Button>
                </span>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-3" aria-label="PC 资产流">
              {visibleResults.map((result) => (
                <MaterialAssetRow
                  key={result.material.id}
                  result={result}
                  isSelected={selectedIds.includes(result.material.id)}
                  isInspected={selectedResult?.material.id === result.material.id}
                  onSelect={(checked) => setSelectedIds((current) => checked ? [...current, result.material.id] : current.filter((id) => id !== result.material.id))}
                  onInspect={() => setSelectedMaterialId(result.material.id)}
                />
              ))}
            </div>
          )}
        </main>

        <MaterialInspector result={selectedResult} />
      </div>
      {selectedIds.length > 0 && (
        <Card className="sticky bottom-4 z-10 shadow-lg" aria-label="桌面固定批量操作条">
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <strong>已选择 {selectedIds.length} 条素材</strong>
            <Button type="button" size="sm" variant="secondary">批量加标签</Button>
            <Button type="button" size="sm" variant="secondary">批量移除标签</Button>
            <Button type="button" size="sm">批量确认 AI 标签</Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function MaterialAssetRow({
  result,
  isSelected,
  isInspected,
  onSelect,
  onInspect,
}: {
  result: MaterialSearchResult;
  isSelected: boolean;
  isInspected: boolean;
  onSelect: (checked: boolean) => void;
  onInspect: () => void;
}) {
  const material = result.material;
  const tone = statusTone[material.status];
  return (
    <Card className={cn('transition-colors', isInspected && 'ring-primary/45 bg-accent/35')}>
      <CardContent className="grid gap-4 py-4 lg:grid-cols-[auto_88px_minmax(0,1fr)]">
        <label className="flex items-start pt-1" aria-label={`选择 ${materialTitle(material)}`}>
          <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelect(checked === true)} />
        </label>
        <Button className="h-20 w-full rounded-xl" type="button" onClick={onInspect} aria-label={`检查 ${materialTitle(material)}`} variant="secondary">
          {assetLabels[material.asset_type]}
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{libraryLabels[material.library_type]} · {assetLabels[material.asset_type]}</span>
            <Badge variant={tone === 'danger' ? 'destructive' : tone === 'success' ? 'default' : 'secondary'}>{statusLabels[material.status]}</Badge>
            <Badge variant="outline">匹配 {formatScore(result.score)}</Badge>
          </div>
          <h3 className="mt-2 text-lg font-medium">{materialTitle(material)}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{material.description || '暂无描述，可通过 AI 打标和人工校准补全素材语义。'}</p>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="素材标签">
            {result.matched_tags.length > 0 ? result.matched_tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>) : <Badge variant="outline">待补充标签</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>CTR {formatMetric(material.effect_metrics.ctr)}</span>
            <span>CVR {formatMetric(material.effect_metrics.cvr)}</span>
            <span>复用 {formatMetric(material.effect_metrics.reuse_count ?? material.effect_metrics.reuseCount)}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">匹配原因：{result.evidence[0] ?? result.matched_tags[0] ?? '标签和向量相似度共同命中'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onInspect} size="sm" variant="outline">打开 Inspector</Button>
            <Button asChild size="sm" variant="outline"><Link to={`/materials/${material.id}`} state={{ result }}>查看详情</Link></Button>
            <Button type="button" size="sm" variant="secondary">加入素材篮</Button>
            <Button type="button" size="sm" variant="secondary">找相似</Button>
            <Button type="button" size="sm" variant="secondary">生成同款</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect<TValue extends string>({
  label,
  options,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: TValue; label: string }>;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value || ALL_VALUE} onValueChange={(nextValue) => onChange(nextValue === ALL_VALUE ? '' : nextValue)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function MaterialInspector({ result }: { result: MaterialSearchResult | null }) {
  if (!result) {
    return (
      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader>
          <Badge className="w-fit" variant="secondary">MaterialInspector</Badge>
          <CardTitle><h3>选择素材查看上下文</h3></CardTitle>
          <CardDescription>Inspector 会展示标签、索引、效果、相似素材和可执行动作。</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const material = result.material;
  const tags = result.tags?.length ? result.tags : result.matched_tags.map((tag, index): MaterialTag => ({
    id: `${material.id}-${tag}-${index}`,
    material_id: material.id,
    category: 'content',
    name: tag,
    confidence: 1,
    source: 'system',
    needs_review: false,
    created_at: material.created_at,
    updated_at: material.updated_at,
  }));
  const auditCount = result.audit_events?.length ?? 0;
  const tone = statusTone[material.status];

  return (
    <Card className="h-fit xl:sticky xl:top-6">
      <CardHeader>
        <Badge className="w-fit" variant="secondary">MaterialInspector</Badge>
        <CardTitle><h3>{materialTitle(material)}</h3></CardTitle>
        <CardDescription>{material.description || '暂无素材描述。'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tone === 'danger' ? 'destructive' : tone === 'success' ? 'default' : 'secondary'}>{statusLabels[material.status]}</Badge>
          <Badge variant="outline">{libraryLabels[material.library_type]} · {assetLabels[material.asset_type]}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricBlock label="索引状态" value={result.index?.status ?? material.status} />
          <MetricBlock label="召回来源" value={`${result.evidence.length || result.matched_tags.length} 条证据`} />
          <MetricBlock label="复用次数" value={formatMetric(material.effect_metrics.reuse_count ?? material.effect_metrics.reuseCount)} />
          <MetricBlock label="审计事件" value={`${auditCount} 条`} />
        </div>
        <Separator />
        <section className="flex flex-col gap-3">
          <h4 className="font-medium">标签管理</h4>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant={tag.source === 'ai' ? 'default' : 'secondary'}>
                {tag.name}{tag.source === 'ai' ? ' · AI' : ''}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary">新增标签</Button>
            <Button type="button" size="sm" variant="secondary">编辑标签</Button>
            <Button type="button" size="sm">确认 AI 标签</Button>
          </div>
        </section>
        <Separator />
        <section className="flex flex-col gap-3">
          <h4 className="font-medium">可执行动作</h4>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline">加入素材篮</Button>
            <Button type="button" size="sm" variant="outline">查看相似素材</Button>
            <Button type="button" size="sm" variant="outline">生成同款</Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/35 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-sm">{value}</strong>
    </div>
  );
}

function LoadingAssetSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="素材加载骨架">
      {[0, 1, 2].map((item) => (
        <Card key={item}>
          <CardContent className="grid gap-4 py-4 lg:grid-cols-[auto_88px_minmax(0,1fr)]">
            <Skeleton className="size-4" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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

function formatMetric(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  if (value > 0 && value < 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return String(value);
}
