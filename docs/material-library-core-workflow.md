# 素材库核心工作流开发文档

## 产品定位

素材库是广告 TVC 制作网站的主产品表面。项目创建、brief 解析、分段生成、成片预览、画廊展示和投放复盘都应围绕素材库上下文运转：

- 原始素材进入 `raw` 库，用于后续检索、引用和生成。
- 生成成片进入 `finished` 库，用于复用、效果回流和投放复盘。
- 高效果成品沉淀为 `knowledge` 视图中的经验洞察，用于 RAG 问答、脚本模板和 Prompt 复用。

## 核心工作流

1. 入库：用户在 `/materials/upload` 上传本地文件，或提交 `tos://` URI 批量导入；外部系统可调用 `POST /api/materials` 创建素材引用。
2. 预处理：后端校验素材类型和大小、计算 MD5、提取基础技术元数据，并创建审计事件。
3. 打标：`POST /api/materials/{material_id}/tag` 使用 Doubao Seed 或 deterministic fallback 生成标签；人工校准通过 `PUT /api/materials/{material_id}/tags` 写入 `source=human` 标签。
4. 索引：`POST /api/materials/{material_id}/index` 构造 embedding 输入并调用 VikingDB 知识库版本客户端边界；缺少外部配置时只返回 fallback 结果，不发起网络请求。
5. 检索：`POST /api/materials/search` 进行自然语言解析、向量召回、标量过滤、融合重排和可解释证据返回；`POST /api/materials/rag` 强制启用 RAG 回答。
6. 生成消费：brief 解析和分段生成应把素材库检索结果视为可复用证据，引用已有图片、视频、音频、文本和工程源文件。
7. 成片回流：投放或生成后的结果通过 `POST /api/materials/effects` 回写曝光、点击、转化、CTR、CVR 等指标，高效果成品会影响排序并生成经验洞察。

## 前端信息架构

| 路由 | 页面 | 职责 |
| --- | --- | --- |
| `/materials` | `MaterialLibraryPage` | 素材库列表，提供关键词、库类型、素材类型、状态和标签筛选，并进入详情、上传和检索流程。 |
| `/materials/upload` | `MaterialUploadPage` | 本地文件上传与 TOS URI 批量导入，提交品牌 ID、操作人和审计相关字段。 |
| `/materials/search` | `MaterialSearchPage` | 多模态自然语言检索，支持属性过滤、证据卡片、RAG 回答和详情跳转。 |
| `/materials/:materialId` | `MaterialDetailPage` | 展示素材元数据、标签、索引状态、效果指标、来源信息、技术信息和审计记录。 |
| `/materials/insights` | `MaterialInsightsPage` | 展示高效果成品素材沉淀的方法论、脚本模板和可复用 Prompt。 |
| `/projects/new` | `ProjectCreatePage` | 保留原有项目创建入口，后续应与素材工作台联动。 |
| `/projects/:projectId/brief` | `BriefInputPage` | 上传或输入 brief，后续应表达需求理解、素材匹配、缺失素材和生成准备度。 |
| `/projects/:projectId/confirm` | `ConfirmPlanPage` | 确认分段生成计划，后续应展示参考素材和素材证据。 |
| `/projects/:projectId/progress` | `GenerationProgressPage` | 展示生成进度，后续应呈现素材上下文和成片回流提示。 |
| `/projects/:projectId/preview` | `ResultPreviewPage` | 预览成片，后续应引导将结果回流到素材库。 |
| `/history`、`/gallery`、`/admin` | 历史、画廊、管理页 | 保留原有能力，作为素材回流和运营管理的辅助入口。 |

## 后端边界

| 模块 | 职责 |
| --- | --- |
| `material_models.py` | 定义素材、标签、索引、检索、RAG、洞察、审计等领域模型。 |
| `material_storage.py` | 封装本地 JSON collection 的素材、标签、索引、效果、洞察和审计读写。 |
| `material_ingestion.py` | 处理上传、TOS URI 导入、外部 API 接入、MD5 去重、技术元数据和安全预检。 |
| `material_tagging.py` | 构造打标输入和 prompt，合并 AI/fallback/human 标签，标记低置信度标签。 |
| `material_embedding.py` | 构造素材 embedding 输入、生成 fallback 向量、保存索引状态和模型版本。 |
| `vikingdb_client.py` | 提供 VikingDB 知识库版本 `upsert_vector`、`search_vector`、`hybrid_search`、`delete_vector` 客户端边界。 |
| `material_search.py` | 实现 query parser、向量召回、标量过滤、结果融合、重排和 RAG 回答。 |
| `material_insights.py` | 处理效果回写、高效果排序 boost 和经验洞察生成。 |
| `material_safety.py` | 执行禁用词、版权、合规和 blocked 状态相关判断。 |

## API 边界

| API | 用途 |
| --- | --- |
| `POST /api/materials/upload` | 上传一个或多个本地素材文件，创建 `received` 状态素材。 |
| `POST /api/materials/import` | 接收 `tos://` URI 列表并创建批量导入素材记录。 |
| `POST /api/materials` | 供外部系统提交素材 URI、基础元数据、业务标签和来源系统。 |
| `POST /api/materials/{material_id}/tag` | 触发 AI/fallback 自动打标。 |
| `PUT /api/materials/{material_id}/tags` | 写入人工校准标签并记录审计事件。 |
| `POST /api/materials/{material_id}/index` | 生成 embedding 并写入 VikingDB 客户端边界或 fallback 索引记录。 |
| `POST /api/materials/search` | 执行素材混合检索，可选返回 RAG 回答。 |
| `POST /api/materials/rag` | 强制使用素材上下文生成 RAG 回答。 |
| `POST /api/materials/effects` | 回写投放效果指标，并生成效果标签或经验洞察。 |
| `GET /api/materials/insights` | 读取经验洞察列表。 |

## 素材回流模型

- `raw`：来自上传、TOS 导入或外部系统的原始素材，主要承担 brief 匹配和生成参考。
- `finished`：来自生成结果、成片画廊或外部投放系统的成品素材，主要承担复用、排序 boost 和投放复盘。
- `knowledge`：来自高效果 `finished` 素材的经验视图，包含方法论、脚本模板、Prompt 和指标快照。
- 效果指标：`impressions`、`clicks`、`conversions`、`ctr`、`cvr` 等指标写入素材 `effect_metrics`，并派生效果/管理标签。
- 审计链路：上传、打标、人工改标、索引、检索、效果回写和 blocked 状态变更都应追加审计事件。

## 配置与密钥

真实密钥禁止写入代码、文档、测试快照、提交记录或截图。所有外部服务密钥都只能通过本地 `.env` 或部署环境变量注入：

- `ARK_API_KEY`：Doubao Seed Chat 鉴权；为空时打标和 RAG 使用 fallback。
- `VIKINGDB_API_KEY`：VikingDB 知识库版本鉴权；`/config` 只返回 `configured` 或 `missing`。
- `TOS_ACCESS_KEY_ID`、`TOS_SECRET_ACCESS_KEY`、`TOS_SECURITY_TOKEN`：对象存储配置占位；当前导入接口只记录 `tos://` URI。

## 本地验证

后端验证：

```bash
cd backend
python3 -m pytest
python3 -m compileall app
```

前端验证：

```bash
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

文档与密钥验证：

```bash
grep -R "sk-\\|AKIA\\|BEGIN .*PRIVATE KEY\\|SECRET_ACCESS_KEY=.*[^ ]" README.md docs .trae/specs || true
```

该命令只用于发现疑似真实密钥模式；示例文档可以出现环境变量名，但不得出现明文密钥值。
