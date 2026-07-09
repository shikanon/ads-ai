import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ShoppingBag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const adFormatOptions = ['信息流广告', '原生广告', '非原生广告', '达人广告', '端原生投流', '星广联投', '真人合集', '真人高光', '漫剧合集', '漫剧高光'];
const sortOptions = ['最近出现', '出现次数', '最多计划使用', '最多投放天数', '最多曝光', '最多转化', '最多点赞', '最多评论'];
const dateOptions = ['今天', '昨天', '3天', '7天', '30天', '全周期'];

const mockMaterialResults: MaterialSearchResult[] = [
  {
    material: createMockMaterial({
      id: 'mock-finished-drama-hook',
      status: 'searchable',
      asset_type: 'video',
      library_type: 'finished',
      title: '乡村湖边道路突发近景素材',
      description: '车内视角竖屏 5 秒外景素材，山村湖边道路从远景推进到骑乘动物近景，适合做生活化开场和突发注意力钩子。',
      source_uri: '/mock-assets/drama-hook.mp4',
      source_metadata: {
        preview_video_url: '/mock-assets/drama-hook.mp4',
        thumbnail_url: '/mock-assets/drama-hook-cover.jpg',
        channel: '山村湖边',
        ratio: '9:16',
        duration: '5.1s',
        risk_level: '低风险',
        effect_boost: '首帧环境信息完整，3 秒内出现近景动作',
        camera_view: '车内前挡风玻璃视角',
        scene_path: '湖边村道、山景、村屋、垂钓者',
        hook_moment: '骑乘动物从道路中央靠近镜头',
      },
      technical_metadata: {
        width: 720,
        height: 1280,
        duration_seconds: 5.06195,
        frame_rate: 24,
        codec: 'h264',
        audio_codec: 'aac',
        file_size_bytes: 813285,
      },
      effect_metrics: { ctr: 0.036, cvr: 0.0048, reuse_count: 12, impressions: 860000 },
    }),
    score: 0.86,
    vector_score: 0.8,
    scalar_score: 0.68,
    evidence: ['画面含山村湖边、村屋、道路和近景骑行动作', '9:16 竖屏短素材适合信息流首屏开场'],
    matched_tags: ['山村湖边', '车内视角', '突发近景', '生活化外景'],
    tags: [
      createMockTag('mock-finished-drama-hook', '山村湖边', 'scene', 'ai', 0.96),
      createMockTag('mock-finished-drama-hook', '车内视角', 'content', 'ai', 0.91),
      createMockTag('mock-finished-drama-hook', '突发近景', 'content', 'ai', 0.89),
      createMockTag('mock-finished-drama-hook', '信息流', 'business', 'human', 1),
    ],
    index: { status: 'indexed', embedding_model: 'doubao-embedding', embedding_version: '2026-07-05', vector_dim: 1024, partition_key: 'mock-rural-broll' },
    audit_events: [
      createMockAuditEvent('mock-finished-drama-hook', 'material.created'),
      createMockAuditEvent('mock-finished-drama-hook', 'material.index_saved'),
    ],
  },
  {
    material: createMockMaterial({
      id: 'mock-raw-outdoor-demo',
      status: 'tagged',
      asset_type: 'video',
      library_type: 'raw',
      title: '防晒喷雾户外实测原始片段',
      description: '强光户外实测素材，产品使用动作清楚，可补充为电商详情页和种草短视频。',
      source_uri: '/mock-assets/outdoor-demo.mp4',
      source_metadata: {
        preview_video_url: '/mock-assets/outdoor-demo.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=720&q=80',
        channel: '电商详情页',
        ratio: '4:5',
        duration: '18s',
        risk_level: '待人工复核',
        effect_boost: 'CVR 高于同类原始素材 12%',
      },
      effect_metrics: { ctr: 0.031, cvr: 0.0094, reuse_count: 7, impressions: 640000 },
    }),
    score: 0.82,
    evidence: ['标签命中产品实拍', '使用演示场景可复用'],
    matched_tags: ['产品实拍', '使用演示', '强光场景', '信任背书'],
    tags: [
      createMockTag('mock-raw-outdoor-demo', '产品实拍', 'content', 'ai', 0.88),
      createMockTag('mock-raw-outdoor-demo', '待索引', 'management', 'system_rule', 1),
    ],
    index: { status: 'pending', embedding_model: 'doubao-embedding' },
  },
  {
    material: createMockMaterial({
      id: 'mock-knowledge-hook-template',
      status: 'searchable',
      asset_type: 'text',
      library_type: 'knowledge',
      title: '短剧前贴 3 秒强钩子脚本结构',
      description: '经验资产，沉淀异常细节、冲突升级和未完成动作三段式脚本模板。',
      source_metadata: {
        thumbnail_url: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=720&q=80',
        channel: '脚本模板',
        ratio: 'Template',
        duration: '复用 18 次',
        risk_level: '无风险',
        effect_boost: '平均 CTR lift +22%',
      },
      effect_metrics: { reuse_count: 18, avg_ctr_lift: 0.22 },
    }),
    score: 0.88,
    evidence: ['RAG 引用脚本模板', '适配短剧拉新场景'],
    matched_tags: ['脚本模板', '强冲突', '悬念提问', '完播提升'],
    tags: [
      createMockTag('mock-knowledge-hook-template', '脚本模板', 'management', 'human', 1),
      createMockTag('mock-knowledge-hook-template', '完播提升', 'effect', 'effect_backflow', 0.93),
    ],
    index: { status: 'indexed', embedding_model: 'doubao-embedding' },
  },
  {
    material: createMockMaterial({
      id: 'mock-raw-product-packshot',
      status: 'indexed',
      asset_type: 'image',
      library_type: 'raw',
      title: '品牌产品图原始素材',
      description: '高分辨率产品静物，适合补齐 Brief 中的包装展示和规格说明镜头。',
      source_uri: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=720&q=80',
      source_metadata: {
        thumbnail_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=720&q=80',
        channel: '品牌资产',
        ratio: '1:1',
        duration: '4K',
        risk_level: '授权素材',
        effect_boost: '包装识别清晰',
      },
      effect_metrics: { reuse_count: 11 },
    }),
    score: 0.77,
    evidence: ['标签命中产品实拍', '可补齐品牌包装镜头'],
    matched_tags: ['产品实拍', '包装展示', '品牌资产'],
    index: { status: 'indexed' },
  },
  {
    material: createMockMaterial({
      id: 'mock-finished-treasure-case',
      status: 'searchable',
      asset_type: 'video',
      library_type: 'finished',
      title: '金匣反转高光短剧片段',
      description: '财宝揭晓与身份反转组合，适合剧情承接和高停留素材复用。',
      source_uri: '/mock-assets/drama-hook.mp4',
      source_metadata: {
        preview_video_url: '/mock-assets/drama-hook.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=720&q=80',
        channel: '漫剧高光',
        ratio: '9:16',
        duration: '12s',
        risk_level: '低风险',
        effect_boost: '曝光量 9.0k',
      },
      effect_metrics: { ctr: 0.027, cvr: 0.004, reuse_count: 12, impressions: 9000 },
    }),
    score: 0.79,
    evidence: ['高光片段可作为二跳承接'],
    matched_tags: ['身份反转', '财宝线索', '高光片段'],
    index: { status: 'indexed' },
  },
  {
    material: createMockMaterial({
      id: 'mock-finished-guardian-night',
      status: 'searchable',
      asset_type: 'video',
      library_type: 'finished',
      title: '守宅夜戏氛围短剧素材',
      description: '夜景、危险临近和群像背影，适合悬疑投流封面和前贴开场。',
      source_uri: '/mock-assets/outdoor-demo.mp4',
      source_metadata: {
        preview_video_url: '/mock-assets/outdoor-demo.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=720&q=80',
        channel: '真人高光',
        ratio: '16:9',
        duration: '6s',
        risk_level: '无风险',
        effect_boost: '完播率高于均值 15%',
      },
      effect_metrics: { ctr: 0.018, cvr: 0.003, reuse_count: 5, impressions: 9200 },
    }),
    score: 0.74,
    evidence: ['夜景情绪和危险提示匹配悬疑 brief'],
    matched_tags: ['悬疑', '夜景', '群像'],
    index: { status: 'indexed' },
  },
  {
    material: createMockMaterial({
      id: 'mock-raw-office-shot',
      status: 'preprocessed',
      asset_type: 'image',
      library_type: 'raw',
      title: '办公场景人物关系素材',
      description: '双人对话与空间纵深明确，可作为职场剧情和产品讲解转场。',
      source_uri: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=720&q=80',
      source_metadata: {
        thumbnail_url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=720&q=80',
        channel: '原生广告',
        ratio: '16:9',
        duration: 'Still',
        risk_level: '授权素材',
        effect_boost: '适配职场场景',
      },
      effect_metrics: { reuse_count: 4, impressions: 8300 },
    }),
    score: 0.7,
    evidence: ['场景标签命中办公关系'],
    matched_tags: ['办公场景', '人物关系', '转场'],
    index: { status: 'pending' },
  },
  {
    material: createMockMaterial({
      id: 'mock-finished-snow-action',
      status: 'tagged',
      asset_type: 'video',
      library_type: 'finished',
      title: '雪地动作真人高光片段',
      description: '强动作和冷色调画面，适合真人高光和开屏视觉冲击素材。',
      source_uri: '/mock-assets/drama-hook.mp4',
      source_metadata: {
        preview_video_url: '/mock-assets/drama-hook.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=720&q=80',
        channel: '真人高光',
        ratio: '9:16',
        duration: '5s',
        risk_level: '待人工复核',
        effect_boost: '近期新增素材',
      },
      effect_metrics: { ctr: 0.021, reuse_count: 2, impressions: 5700 },
    }),
    score: 0.69,
    evidence: ['动作强度适合开屏前 2 秒'],
    matched_tags: ['动作', '雪地', '真人高光'],
    index: { status: 'pending' },
  },
];

export function MaterialLibraryPage() {
  const [query, setQuery] = useState('素材');
  const [libraryType, setLibraryType] = useState('');
  const [assetType, setAssetType] = useState('');
  const [status, setStatus] = useState('');
  const [tagText, setTagText] = useState('');
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [mockDataNotice, setMockDataNotice] = useState('');

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
      const nextResults = payload.results ?? [];
      if (nextResults.length === 0) {
        setResults(mockMaterialResults);
        setIsUsingMockData(true);
        setMockDataNotice('真实素材库暂无匹配资产');
      } else {
        setResults(nextResults);
        setIsUsingMockData(false);
        setMockDataNotice('');
      }
      setSelectedIds([]);
    } catch (error) {
      setResults(mockMaterialResults);
      setSelectedIds([]);
      setIsUsingMockData(true);
      setMockDataNotice('真实素材库暂不可用');
      setErrorMessage(error instanceof Error ? error.message : '读取素材库失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <Badge className="w-fit" variant="secondary">Material Library</Badge>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">广告素材库</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">按库类型、素材类型、状态和标签筛选可复用资产。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border bg-muted/35 px-3 py-2 text-sm" aria-label="素材库当前视图摘要">
            <strong>{isLoading ? '读取素材资产' : `${visibleResults.length} 条可见资产`}</strong>
            <span className="ml-2 text-muted-foreground">
              {isUsingMockData ? '展示 mock 示例素材' : status ? statusLabels[status as MaterialStatus] : '默认排除风险素材'}
            </span>
          </div>
          <Button asChild variant="outline">
            <Link to="/materials/search">多模态检索</Link>
          </Button>
          <Button asChild>
            <Link to="/materials/upload">上传素材</Link>
          </Button>
        </div>
      </div>

      {errorMessage && !isUsingMockData && (
        <Alert variant="destructive">
          <AlertTitle>读取素材库失败</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {isUsingMockData && mockDataNotice && (
        <Alert>
          <AlertTitle>{mockDataNotice}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>当前展示 mock 示例素材，用于预览素材库层级、卡片密度和详情入口。</span>
            <Button asChild size="sm"><Link to="/materials/upload">上传素材</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 py-3">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b pb-3 text-sm">
            <span className="font-medium text-muted-foreground">广告形式：</span>
            {adFormatOptions.map((option, index) => (
              <button
                className={cn('font-medium text-muted-foreground transition hover:text-foreground', index === 0 && 'text-primary')}
                key={option}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <form className="grid gap-3 border-b pb-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto]" onSubmit={(event) => void loadMaterials(event)}>
            <Field>
              <FieldLabel htmlFor="material-query">关键词</FieldLabel>
              <Input id="material-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="3 秒钩子、竖版、家庭伦理" />
            </Field>
            <FilterSelect label="库类型" options={libraryOptions} placeholder="全部库类型" value={libraryType} onChange={setLibraryType} />
            <FilterSelect label="素材类型" options={assetOptions} placeholder="全部素材类型" value={assetType} onChange={setAssetType} />
            <FilterSelect label="状态" options={statusOptions} placeholder="全部状态" value={status} onChange={setStatus} />
            <Field>
              <FieldLabel htmlFor="material-tags">标签</FieldLabel>
              <Input id="material-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="high_ctr" />
            </Field>
            <Button className="md:col-span-2 xl:col-span-1 xl:self-end" type="submit" disabled={isLoading}>
              {isLoading ? '筛选中...' : '筛选素材'}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-medium text-muted-foreground">排序方式：</span>
            {sortOptions.map((option, index) => (
              <button
                className={cn('font-medium text-muted-foreground transition hover:text-foreground', index === 0 && 'text-primary')}
                key={option}
                type="button"
              >
                {option}
              </button>
            ))}
            {dateOptions.map((option) => (
              <button
                className={cn('rounded-md border px-3 py-1.5 font-medium transition hover:border-primary hover:text-primary', option === '30天' && 'border-primary text-primary')}
                key={option}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm" aria-label="索引与召回解释">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">索引与召回解释</h3>
              {recallExplainItems.map((item) => (
                <span className="rounded-lg border bg-background px-3 py-1.5" key={item.label}>
                  <span className="text-muted-foreground">{item.label}</span>
                  <strong className="ml-2">{item.value}</strong>
                </span>
              ))}
            </div>
            <Button type="button" onClick={() => setIsRecallOpen((current) => !current)} aria-expanded={isRecallOpen} variant="outline" size="sm">
              {isRecallOpen ? '折叠召回解释' : '展开召回解释'}
            </Button>
            {isRecallOpen && (
              <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {recallExplainItems.map((item) => (
                  <p className="rounded-lg border bg-background p-2 text-muted-foreground" key={item.label}>{item.detail}</p>
                ))}
              </div>
            )}
          </div>
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [@media(min-width:1400px)]:grid-cols-4" aria-label="素材卡片网格">
          {visibleResults.map((result) => (
            <MaterialAssetCard
              key={result.material.id}
              result={result}
              isSelected={selectedIds.includes(result.material.id)}
              onToggleSelect={() => setSelectedIds((current) => current.includes(result.material.id) ? current.filter((id) => id !== result.material.id) : [...current, result.material.id])}
            />
          ))}
        </section>
      )}
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

function MaterialAssetCard({
  result,
  isSelected,
  onToggleSelect,
}: {
  result: MaterialSearchResult;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const material = result.material;
  const tone = statusTone[material.status];
  const media = materialMedia(material);
  return (
    <Card className={cn('overflow-hidden py-0 transition hover:-translate-y-0.5 hover:shadow-md', isSelected && 'ring-2 ring-primary/40')}>
      <CardHeader className="gap-2 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <strong className="block truncate text-base">{media.channel}</strong>
            <p className="mt-1 truncate text-xs text-muted-foreground">{libraryLabels[material.library_type]} · {assetLabels[material.asset_type]}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label="更多操作" type="button">...</Button>
        </div>
      </CardHeader>
      <AssetPreview material={material} result={result} />
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tone === 'danger' ? 'destructive' : tone === 'success' ? 'default' : 'secondary'}>{statusLabels[material.status]}</Badge>
          <Badge variant="outline">匹配 {formatScore(result.score)}</Badge>
        </div>
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold">{materialTitle(material)}</h3>
          <p className="mt-1 line-clamp-1 text-sm leading-5 text-muted-foreground">{material.description || '暂无描述，可通过 AI 打标和人工校准补全素材语义。'}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <CompactMetric label="曝光量" value={formatMetric(material.effect_metrics.impressions)} />
          <CompactMetric label="CTR" value={formatMetric(material.effect_metrics.ctr)} />
          <CompactMetric label="复用" value={formatMetric(material.effect_metrics.reuse_count ?? material.effect_metrics.reuseCount)} />
          <CompactMetric label="CVR" value={formatMetric(material.effect_metrics.cvr)} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" size="sm" variant={isSelected ? 'default' : 'secondary'} onClick={onToggleSelect} aria-label={`${isSelected ? '移除' : '添加'} ${materialTitle(material)}`}>
            <ShoppingBag />{isSelected ? '已添加' : '添加'}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/materials/${material.id}`} state={{ result }}><Eye />查看详情</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetPreview({ material, result }: { material: MaterialAsset; result: MaterialSearchResult }) {
  const media = materialMedia(material);
  return (
    <Link
      className="group relative block aspect-video overflow-hidden bg-muted text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50"
      to={`/materials/${material.id}`}
      state={{ result }}
      aria-label={`素材预览 ${materialTitle(material)}`}
    >
      {media.videoUrl ? (
        <video className="h-full w-full object-cover" muted playsInline preload="metadata" poster={media.thumbnailUrl}>
          <source src={media.videoUrl} type="video/mp4" />
        </video>
      ) : media.thumbnailUrl ? (
        <img className="h-full w-full object-cover" src={media.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <div className="flex h-full flex-col justify-between bg-muted p-3">
          <span className="text-xs font-medium text-muted-foreground">{assetLabels[material.asset_type]}</span>
          <strong className="line-clamp-3 text-sm">{material.description || materialTitle(material)}</strong>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-slate-950/75 to-transparent p-3 text-xs text-white">
        <div className="flex items-center justify-between gap-2">
          <span>{media.ratio}</span>
          <span>{media.duration}</span>
        </div>
      </div>
      {material.asset_type === 'video' && (
        <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/50 text-white transition group-hover:bg-primary">
          ▶
        </span>
      )}
    </Link>
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

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <strong className="block truncate text-sm font-semibold">{value}</strong>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
    </span>
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

function materialMedia(material: MaterialAsset) {
  const metadata = material.source_metadata;
  return {
    thumbnailUrl: stringMetadata(metadata, 'thumbnail_url') || (material.asset_type === 'image' ? material.source_uri ?? '' : ''),
    videoUrl: stringMetadata(metadata, 'preview_video_url') || (material.asset_type === 'video' ? material.source_uri ?? '' : ''),
    ratio: stringMetadata(metadata, 'ratio') || 'Auto',
    duration: stringMetadata(metadata, 'duration') || (material.asset_type === 'image' ? 'Still' : 'Asset'),
    channel: stringMetadata(metadata, 'channel') || '未标注渠道',
  };
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function createMockMaterial(overrides: Partial<MaterialAsset> & Pick<MaterialAsset, 'id' | 'status' | 'asset_type' | 'library_type'>): MaterialAsset {
  return {
    copyright_status: 'cleared',
    compliance_status: 'approved',
    visibility: 'brand',
    source_metadata: {},
    technical_metadata: {},
    effect_metrics: {},
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
    ...overrides,
  };
}

function createMockTag(
  materialId: string,
  name: string,
  category: MaterialTag['category'],
  source: MaterialTag['source'],
  confidence: number,
): MaterialTag {
  return {
    id: `${materialId}-${name}`,
    material_id: materialId,
    category,
    name,
    confidence,
    source,
    needs_review: source === 'ai' && confidence < 0.9,
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
  };
}

function createMockAuditEvent(materialId: string, action: string) {
  return {
    id: `${materialId}-${action}`,
    material_id: materialId,
    action,
    details: { source: 'mock' },
    created_at: '2026-07-05T00:00:00',
  };
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
