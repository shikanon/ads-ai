import { Link } from 'react-router-dom';
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
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

const workflowSteps = [
  {
    title: '1. 素材入库',
    description: '上传原始素材、导入 TOS URI 或接收外部 API 素材，让资产先进入可追踪状态。',
    action: '上传素材',
    to: '/materials/upload',
  },
  {
    title: '2. Brief 解析',
    description: '从品牌、产品、受众和禁用项中抽取需求，并匹配可复用素材与缺失素材。',
    action: '进入 Brief 解析',
    to: '/projects/new',
  },
  {
    title: '3. 生成工坊',
    description: '基于素材标签、检索证据和参考资产组织生成上下文，产出新的广告片段。',
    action: '创建生成任务',
    to: '/projects/new',
  },
  {
    title: '4. 回流复用',
    description: '将成片和效果数据沉淀为 finished 素材与经验洞察，持续提升下一轮检索质量。',
    action: '查看洞察回流',
    to: '/materials/insights',
  },
];

const healthMetrics = [
  { label: '入库通道', value: '3 类', hint: '上传 / TOS / 外部 API' },
  { label: '素材状态', value: '7 个', hint: '接收、打标、索引、可检索等' },
  { label: '资产分层', value: '3 层', hint: '原始素材、成品素材、经验知识' },
];

const impactMetrics = [
  { label: '复用率', before: '靠人工记忆复用', after: '素材被 Brief / 生成任务引用 42 次', proof: '高复用素材排行常驻展示' },
  { label: '检索耗时', before: '目录翻找 20 分钟', after: '自然语言 + 标签秒级定位', proof: '平均定位耗时降至 38 秒' },
  { label: '重复创作减少', before: '同类开场反复制作', after: '相似素材和经验模板优先推荐', proof: '重复创作减少 31%' },
  { label: '高效果素材复用', before: '高 CTR 成品分散在历史里', after: '高效果成品加权进入素材篮', proof: 'CTR 高于库均值 22%' },
  { label: '风险拦截', before: '版权和禁用词人工排查', after: '入库和检索阶段显示风险链路', proof: '本周拦截 7 条风险素材' },
];

const demoMaterials = [
  {
    id: 'demo-raw-product-001',
    title: '防晒喷雾户外实测原始片段',
    libraryType: 'raw',
    assetType: '视频',
    status: '已打标，待索引',
    tags: ['使用演示', '强光场景', '产品实拍'],
    metric: 'CVR 0.94%',
    insight: '实测画面可信，但 CTA 出现偏晚',
  },
  {
    id: 'demo-finished-drama-002',
    title: '烟洞线索抓奸反转短剧前贴',
    libraryType: 'finished',
    assetType: '竖版视频',
    status: '可检索',
    tags: ['3 秒钩子', '家庭伦理', '高 CTR'],
    metric: 'CTR 4.8%',
    insight: '异常细节 + 背叛线索提升完播',
  },
  {
    id: 'demo-knowledge-hook-003',
    title: '短剧前贴 3 秒强钩子脚本结构',
    libraryType: 'knowledge',
    assetType: '脚本模板',
    status: '经验库可引用',
    tags: ['脚本模板', '强冲突', '完播提升'],
    metric: '复用 18 次',
    insight: '开篇异常细节建立疑问，中段升级冲突',
  },
];

const queueItems = [
  { label: '待补充标签', value: '低置信度标签需人工校准' },
  { label: '待索引素材', value: '完成打标后进入向量化与混合检索' },
  { label: '待回流成片', value: '成品素材写入效果指标后生成经验洞察' },
];

const nextActions = [
  { label: '检索夏日饮料开场 hook', to: '/materials/search' },
  { label: '导入一批 TOS 素材', to: '/materials/upload' },
  { label: '从素材库开始新 Brief', to: '/projects/new' },
  { label: '查看历史生成记录', to: '/history' },
];

export function MaterialWorkspacePage() {
  return (
    <section className="flex flex-col gap-6">
      <Card className="overflow-hidden border-border/80 bg-card">
        <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge className="w-fit" variant="secondary">Material Workspace</Badge>
            <div className="flex flex-col gap-3">
              <CardTitle>
                <h2 className="text-3xl font-semibold tracking-tight">素材工作台</h2>
              </CardTitle>
              <CardDescription className="text-base leading-7">
                从素材库开始完成入库、Brief 解析、素材生成、检索问答和成片回流。这里是素材驱动广告生产的默认入口。
              </CardDescription>
            </div>
          </div>
          <CardAction className="flex items-center gap-2">
            <Button asChild size="lg">
              <Link to="/materials/upload">入库素材</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/materials/search">RAG 检索问答</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3" aria-label="资产健康概览">
            {healthMetrics.map((metric) => (
              <div className="rounded-xl border bg-muted/35 p-4" key={metric.label}>
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <strong className="mt-2 block text-2xl font-semibold">{metric.value}</strong>
                <p className="mt-1 text-sm text-muted-foreground">{metric.hint}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><h3>改造前后效果</h3></CardTitle>
          <CardDescription>Before / After Impact，展示素材库从上传入口升级为资产指挥台后的业务收益。</CardDescription>
          <CardAction>
            <Badge variant="outline">资产价值可见化</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-5" aria-label="改造前后效果指标">
            {impactMetrics.map((metric, index) => (
              <article className="flex flex-col gap-3 rounded-xl border bg-background p-4" key={metric.label}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{metric.label}</h3>
                  <Badge variant="secondary">{index + 1}</Badge>
                </div>
                <div className="flex flex-col gap-2 text-sm leading-6">
                  <p><span className="text-muted-foreground">改造前：</span>{metric.before}</p>
                  <p><span className="text-muted-foreground">改造后：</span>{metric.after}</p>
                </div>
                <Progress className="mt-auto" value={62 + index * 7} />
                <strong className="text-sm text-primary">{metric.proof}</strong>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><h3>三类资产展示</h3></CardTitle>
          <CardDescription>Demo Assets，覆盖 raw、finished、knowledge 三层素材资产。</CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link to="/materials">打开资产流</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-3" aria-label="raw finished knowledge 三类素材示例">
            {demoMaterials.map((material) => (
              <article className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 rounded-xl border bg-background p-4" key={material.id}>
                <div className="flex h-24 items-center justify-center rounded-lg bg-muted text-xs font-semibold uppercase text-muted-foreground">
                  {material.libraryType}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">{material.libraryType} · {material.assetType} · {material.status}</p>
                  <h3 className="mt-1 line-clamp-2 font-medium">{material.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{material.insight}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {material.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                  <strong className="mt-3 block text-sm text-primary">{material.metric}</strong>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle><h3>素材驱动流程</h3></CardTitle>
            <CardDescription>Material-driven flow，从素材入库到回流复用的主路径。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {workflowSteps.map((step) => (
                <article className="flex flex-col gap-3 rounded-xl border bg-background p-4" key={step.title}>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                  <Button asChild className="mt-auto w-fit" size="sm" variant="outline">
                    <Link to={step.to}>{step.action}</Link>
                  </Button>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle><h3>处理队列</h3></CardTitle>
              <CardDescription>Processing Queue</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4">
                {queueItems.map((item) => (
                  <li className="flex flex-col gap-1" key={item.label}>
                    <strong className="text-sm">{item.label}</strong>
                    <span className="text-sm leading-6 text-muted-foreground">{item.value}</span>
                    <Separator className="mt-2 last:hidden" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle><h3>下一步动作</h3></CardTitle>
              <CardDescription>Next Actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {nextActions.map((action) => (
                  <Button asChild className="justify-start" key={action.label} size="sm" variant="secondary">
                    <Link to={action.to}>{action.label}</Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
