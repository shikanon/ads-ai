# Tasks

- [x] Task 1: 建立素材库领域基础，定义素材、标签、向量索引、检索结果、经验洞察和审计事件模型。
  - [x] SubTask 1.1: 新增 `backend/app/material_models.py`，定义 `MaterialAsset`、`MaterialTag`、`MaterialVectorIndex`、`MaterialSearchQuery`、`MaterialSearchResult`、`MaterialInsight`、`MaterialAuditEvent`。
  - [x] SubTask 1.2: 新增 `backend/app/material_storage.py`，封装素材创建、列表查询、状态更新、标签 upsert、索引状态保存、效果数据保存和审计事件追加。
  - [x] SubTask 1.3: 扩展本地 JSON metadata collection，增加 `materials`、`material_tags`、`material_indexes`、`material_effects`、`material_insights`、`material_audit_events`。
  - [x] SubTask 1.4: 增加素材状态机：`received`、`preprocessed`、`tagged`、`indexed`、`searchable`、`blocked`、`failed`。
  - [x] SubTask 1.5: 补充 `backend/tests/test_material_models.py` 和 `backend/tests/test_material_storage.py`，覆盖模型序列化、默认状态、仓储 round-trip、标签 upsert 和审计追加。

- [x] Task 2: 实现素材接收与预处理，支持在线上传、TOS 批量导入和外部 API 接入的开发态闭环。
  - [x] SubTask 2.1: 新增 `backend/app/material_ingestion.py`，复用现有文件校验逻辑校验图片、视频、音频、文本和工程源文件。
  - [x] SubTask 2.2: 新增 `POST /api/materials/upload`，接收一个或多个素材文件并创建 `received` 状态素材。
  - [x] SubTask 2.3: 新增 `POST /api/materials/import`，接收 TOS URI 列表并创建批量导入记录。
  - [x] SubTask 2.4: 新增 `POST /api/materials`，允许外部系统提交素材 URI、基础元数据、业务标签和来源系统。
  - [x] SubTask 2.5: 计算 MD5 exact dedupe，发现重复素材时记录 duplicate relation，不重复进入后续索引流程。
  - [x] SubTask 2.6: 提取基础技术元数据，包括文件大小、MIME、图片尺寸、视频时长、音频时长、编码信息；不可用时写入 fallback reason。
  - [x] SubTask 2.7: 补充入库测试，覆盖成功上传、重复上传、非法类型、TOS 导入和 API 接入。

- [x] Task 3: 实现 AI 自动打标与人工校准，把素材转为可检索标签数据。
  - [x] SubTask 3.1: 新增 `backend/app/material_tagging.py`，定义视觉、语音、文本、品牌元素四类打标输入。
  - [x] SubTask 3.2: 在 `backend/app/config.py` 增加 Doubao Seed 模型、打标超时、低置信度阈值配置，Seed 模型默认值必须为 `doubao-seed-2-1-pro-260628`。
  - [x] SubTask 3.3: 设计打标 prompt，输出内容标签、业务标签、效果/管理标签三类维度。
  - [x] SubTask 3.4: 实现未配置模型时的 deterministic fallback，保证本地测试可稳定运行。
  - [x] SubTask 3.5: 聚合并去重模型标签，保留最高置信度；低置信度标签标记为 `needs_review`。
  - [x] SubTask 3.6: 新增 `POST /api/materials/{material_id}/tag` 触发打标。
  - [x] SubTask 3.7: 新增 `PUT /api/materials/{material_id}/tags` 支持人工校准，写入 `source=human` 和审计记录。
  - [x] SubTask 3.8: 补充打标测试，覆盖 fallback、标签合并、低置信度、人工修正和状态流转。

- [x] Task 4: 实现向量化与 VikingDB 知识库版本索引边界，为多模态检索提供可替换底座。
  - [x] SubTask 4.1: 新增 `backend/app/material_embedding.py`，封装文本、图片、视频关键帧、音频文本的 embedding 请求构建。
  - [x] SubTask 4.2: 新增 `backend/app/vikingdb_client.py`，提供知识库版本的 `upsert_vector`、`search_vector`、`hybrid_search`、`delete_vector` 客户端边界方法。
  - [x] SubTask 4.3: 在 `backend/app/config.py` 增加 embedding 模型、向量维度、VikingDB knowledge base endpoint、collection、partition 字段、hybrid index mode 配置。
  - [x] SubTask 4.4: 实现 deterministic vector fallback，保证测试不依赖外部模型。
  - [x] SubTask 4.5: 根据 `material_type` 或 `brand_id` 生成 partition key，符合低基数字段分区策略。
  - [x] SubTask 4.6: 新增 `POST /api/materials/{material_id}/index`，完成 embedding、VikingDB upsert、索引状态保存。
  - [x] SubTask 4.7: 记录 embedding model version，支持后续模型升级后的回填。
  - [x] SubTask 4.8: 确保 VikingDB API Key 只从 `VIKINGDB_API_KEY` 环境变量读取，`/config`、日志、README 和测试快照不得输出明文值。
  - [x] SubTask 4.9: 补充向量化测试，覆盖 knowledge-base payload shape、fallback 稳定性、partition key、索引状态、密钥脱敏和错误处理。

- [x] Task 5: 实现混合检索与 RAG 工作流，支持自然语言检索、多路召回、重排和可解释回答。
  - [x] SubTask 5.1: 新增 `backend/app/material_search.py`，实现 query parser，识别相似素材查找、特定内容查找和问答意图。
  - [x] SubTask 5.2: 新增 `POST /api/materials/search`，接收文本 Query、过滤条件、TopK、是否启用 RAG。
  - [x] SubTask 5.3: 实现向量相似度召回，调用 VikingDB 或本地 fallback。
  - [x] SubTask 5.4: 实现标量过滤召回，通过本地元数据和标签匹配素材 ID。
  - [x] SubTask 5.5: 实现召回结果融合，对相同素材合并来源证据、向量分、标量分。
  - [x] SubTask 5.6: 实现重排逻辑，结合相关性、标签命中、素材状态和效果指标排序。
  - [x] SubTask 5.7: 新增 `POST /api/materials/rag`，把 Top-N 素材摘要组织为 prompt，调用 Doubao Seed 或 fallback 生成回答。
  - [x] SubTask 5.8: 补充检索测试，覆盖文本检索、标签过滤、多路去重、重排顺序和 RAG answer shape。

- [x] Task 6: 实现数据资产分层与效果回流，沉淀原始素材库、成品库和经验库。
  - [x] SubTask 6.1: 在素材模型中支持 `library_type=raw|finished|knowledge`，用于原始素材、成品、经验知识逻辑视图。
  - [x] SubTask 6.2: 新增 `POST /api/materials/effects`，接收曝光、点击、转化、CTR、CVR 等投放效果数据。
  - [x] SubTask 6.3: 将效果数据写回素材 effect metrics，并同步生成效果/管理标签。
  - [x] SubTask 6.4: 在检索重排中加入高效果素材 boost，保证“能打的成品”优先推荐。
  - [x] SubTask 6.5: 新增 `backend/app/material_insights.py`，从高效果成品提炼创意方法论、脚本模板、Prompt 和可复用套路。
  - [x] SubTask 6.6: 新增 `GET /api/materials/insights`，返回经验库洞察列表。
  - [x] SubTask 6.7: 补充效果回流测试，覆盖指标更新、标签生成、排序 boost 和经验洞察创建。

- [x] Task 7: 实现素材安全、合规与审计，避免版权、禁用内容和越权访问风险。
  - [x] SubTask 7.1: 在素材模型中增加 `copyright_status`、`compliance_status`、`visibility`、`owner_id`、`brand_id` 字段。
  - [x] SubTask 7.2: 入库和打标时识别禁用词、版权未知、合规风险，命中时将素材状态置为 `blocked`。
  - [x] SubTask 7.3: 检索接口默认排除 `blocked` 素材，除非请求显式带管理态过滤参数。
  - [x] SubTask 7.4: 对上传、标签修改、索引、检索、效果回写、阻断状态变更写入审计事件。
  - [x] SubTask 7.5: 补充安全测试，覆盖 blocked 素材不可检索、审计记录完整、权限字段被保留。

- [x] Task 8: 实现前端素材库体验，提供上传、列表、检索、详情和洞察页面。
  - [x] SubTask 8.1: 在 `frontend/src/types.ts` 增加素材、标签、索引状态、检索结果、RAG 回答、经验洞察类型。
  - [x] SubTask 8.2: 新增 `MaterialLibraryPage.tsx`，展示素材列表、库类型筛选、素材类型筛选、状态筛选和标签筛选。
  - [x] SubTask 8.3: 新增 `MaterialUploadPage.tsx`，支持文件上传和 TOS URI 批量导入。
  - [x] SubTask 8.4: 新增 `MaterialSearchPage.tsx`，支持自然语言输入、过滤条件、结果卡片和 RAG 洞察面板。
  - [x] SubTask 8.5: 新增 `MaterialDetailPage.tsx`，展示素材元数据、标签、索引状态、效果指标和审计记录。
  - [x] SubTask 8.6: 新增 `MaterialInsightsPage.tsx`，展示高效果成品、创意方法论、脚本模板和 Prompt。
  - [x] SubTask 8.7: 更新 `AppShell.tsx` 和 `main.tsx`，加入素材库导航与路由。
  - [x] SubTask 8.8: 补充前端测试，覆盖列表空态、上传表单、检索结果、RAG 回答和详情展示。

- [x] Task 9: 更新配置、文档与本地验证，保证开发者可独立启动和验证素材库能力。
  - [x] SubTask 9.1: 更新 `.env.example`，新增 TOS、Doubao Seed、Doubao Embedding、VikingDB、RAG 相关环境变量。
  - [x] SubTask 9.2: 更新 `README.md`，说明素材库能力、外部服务配置、本地 fallback 行为和 API 示例；不得写入真实 API Key。
  - [x] SubTask 9.3: 增加 curl 示例，覆盖上传、打标、索引、搜索、RAG、效果回写。
  - [x] SubTask 9.4: 运行后端全量验证：`cd backend && python3 -m pytest && python3 -m compileall app`。
  - [x] SubTask 9.5: 运行前端全量验证：`cd frontend && npm run lint && npm run typecheck && npm run test && npm run build`。
  - [x] SubTask 9.6: 如生成 `frontend/dist` 且未纳入版本管理，验证后清理构建产物。

- [x] Task 10: 沉淀素材库核心产品方案到 README 和开发文档: 说明素材库是主产品表面，brief 解析、素材生成、成片回流都围绕素材库展开。
  - [x] SubTask 10.1: 更新 `README.md`，加入素材库驱动工作流、信息架构、核心页面和本地验证入口。
  - [x] SubTask 10.2: 新增或更新开发文档，说明素材库核心 UI、路由职责、后端边界、素材回流和验证命令。
  - [x] SubTask 10.3: 确认文档中不包含真实 API Key，仅说明通过环境变量配置密钥。

- [x] Task 11: 重构前端导航与入口为素材库核心工作台: 让用户从素材库开始完成入库、brief 解析、生成、检索和回流。
  - [x] SubTask 11.1: 新增或改造素材工作台首页，展示素材驱动流程、处理队列、关键入口和下一步动作。
  - [x] SubTask 11.2: 调整 `AppShell` 导航顺序和文案，突出素材工作台、素材库、Brief 解析、生成工坊、洞察回流和历史记录。
  - [x] SubTask 11.3: 保留现有项目创建、brief、生成、预览、画廊、历史、admin 路由的可达性。

- [x] Task 12: 改造 brief 与生成页面文案和布局: 表达 brief 解析与素材生成均基于素材库证据和素材上下文。
  - [x] SubTask 12.1: 改造 brief 输入或确认页面，展示需求理解、素材匹配、缺失素材和生成准备度的说明或区域。
  - [x] SubTask 12.2: 改造生成进度或成片预览页面，展示素材上下文、参考素材使用和生成结果回流素材库的提示。
  - [x] SubTask 12.3: 统一相关页面的视觉层级、按钮文案和空状态，使其符合素材库核心心智。

- [x] Task 13: 补充前端测试并运行验证: 覆盖素材库核心导航、工作台文案、brief/生成围绕素材库的关键 UI。
  - [x] SubTask 13.1: 更新或新增前端测试，覆盖素材工作台入口和导航文案。
  - [x] SubTask 13.2: 更新或新增前端测试，覆盖 brief 页面素材匹配/缺失素材/生成准备度文案。
  - [x] SubTask 13.3: 更新或新增前端测试，覆盖生成/预览页面素材上下文和回流提示。
  - [x] SubTask 13.4: 运行 `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build`。

- [x] Task 14: 实现 PC-only 素材工作台展示增强: 基于 `docs/plans/2026-07-07-material-library-display-ui-plan.md` 增加 mock 展示和改造前后效果区域，让素材库不仅能上传，也能直接展示资产价值。
  - [x] SubTask 14.1: 在 `MaterialWorkspacePage.tsx` 增加改造前后效果区域，展示复用率、检索耗时、重复创作减少、高效果素材复用和风险拦截。
  - [x] SubTask 14.2: 补充真实感 mock/demo 数据，覆盖 raw 原始素材、finished 成品库和 knowledge 经验库。
  - [x] SubTask 14.3: 保持 PC 桌面信息密度和视觉层级，不引入移动端折叠、抽屉或触屏优先交互。
  - [x] SubTask 14.4: 更新 `MaterialWorkspacePage.test.tsx` 覆盖改造前后效果指标和三类资产展示。

- [x] Task 15: 重构素材库浏览页为 PC 资产流与解释性检索界面: 展示资产行、筛选、Inspector、索引与召回解释、批量操作条。
  - [x] SubTask 15.1: 将 `MaterialLibraryPage.tsx` 从单纯卡片网格升级为 PC 三栏或近似三栏布局，包含筛选区、资产流和 MaterialInspector。
  - [x] SubTask 15.2: 增加索引与召回解释区域，展示向量召回、标签过滤、效果加权、RAG 引用来源和召回来源占比。
  - [x] SubTask 15.3: 资产行展示缩略图/摘要、库类型、素材类型、状态、标签、CTR/CVR/复用次数、匹配原因和快捷动作。
  - [x] SubTask 15.4: 增加桌面固定批量操作条，支持批量加标签、批量移除标签、批量确认 AI 标签。
  - [x] SubTask 15.5: 更新 `MaterialLibraryPage.test.tsx` 覆盖三类库筛选、召回解释、资产行和批量操作文案。

- [x] Task 16: 增强素材详情页与 MaterialInspector 标签治理: 增加入库流水线和标签管理规则，明确 AI、效果、合规、locked 标签行为。
  - [x] SubTask 16.1: 扩展 `frontend/src/types.ts` 的标签展示模型或派生类型，支持 `name`、`dimension`、`source`、`confidence`、`createdBy`、`updatedAt`、`locked`、`hidden`、`excludedFromRanking`。
  - [x] SubTask 16.2: 在 `MaterialDetailPage.tsx` 增加入库流水线模块，覆盖接收、清洗、去重、元数据、打标、向量化、索引完成、风险校验。
  - [x] SubTask 16.3: 在详情或 Inspector 区域增加标签管理 UI，支持新增、删除、编辑、确认 AI 标签的可见操作。
  - [x] SubTask 16.4: 展示效果标签不可直接删除、合规标签删除需二次确认、locked 标签只读的规则说明和禁用态。
  - [x] SubTask 16.5: 更新 `MaterialDetailPage.test.tsx` 覆盖入库流水线、标签管理、AI 标签确认、效果标签保护和合规标签审计提示。

- [x] Task 17: 运行 impeccable UI 检查并按建议迭代: 对实现后的 PC 素材库 UI 做产品界面审查，输出优化建议并完成一轮合理改进。
  - [x] SubTask 17.1: 使用 impeccable 产品 UI 规则审查素材工作台、素材库浏览页和素材详情页的视觉层级、PC 密度、解释性、标签治理、文案和禁用反模式。
  - [x] SubTask 17.2: 记录详细优化建议到 `progress.md` 的本轮总结中，不额外创建非 spec 报告文档。
  - [x] SubTask 17.3: 根据建议完成一轮可执行 UI 改进，优先修正层级混乱、信息拥挤、文案不清、状态不明确或交互不可见问题。

- [x] Task 18: 前端验证与构建: 对本次 UI 改造运行相关测试、lint、typecheck 和 build，确保现有素材库与 TVC 路由不回退。
  - [x] SubTask 18.1: 运行 `cd frontend && npm run lint`。
  - [x] SubTask 18.2: 运行 `cd frontend && npm run typecheck`。
  - [x] SubTask 18.3: 运行 `cd frontend && npm run test`。
  - [x] SubTask 18.4: 运行 `cd frontend && npm run build`。
  - [x] SubTask 18.5: 如生成 `frontend/dist` 且未纳入版本管理，验证后清理构建产物。

# Task Dependencies

- Task 2 depends on Task 1.
- Task 3 depends on Task 1 and Task 2.
- Task 4 depends on Task 1 and Task 3.
- Task 5 depends on Task 1, Task 3, and Task 4.
- Task 6 depends on Task 1 and Task 5.
- Task 7 depends on Task 1 through Task 6.
- Task 8 depends on Task 1 through Task 7.
- Task 9 depends on Task 1 through Task 8.
- Task 10 depends on Task 1 through Task 9.
- Task 11 depends on Task 10.
- Task 12 depends on Task 11.
- Task 13 depends on Task 11 and Task 12.
- Task 14 depends on Task 13.
- Task 15 depends on Task 14.
- Task 16 depends on Task 15.
- Task 17 depends on Task 14 through Task 16.
- Task 18 depends on Task 17.

# Acceptance Criteria

- 素材可通过在线上传、TOS 批量导入、外部 API 三种方式进入系统。
- 每个素材都有可追踪状态、技术元数据、标签、索引状态和审计事件。
- 未配置外部服务时，本地 fallback 能完成入库、打标、向量化、检索和 RAG 演示。
- 配置 Doubao 与 VikingDB 后，客户端边界可替换为真实向量化和向量检索。
- 检索支持语义召回和标签/属性过滤，结果包含可解释的匹配证据。
- RAG 回答基于 Top-N 素材上下文生成，并能引用素材摘要或标签依据。
- 效果数据回流后，高效果素材在排序和经验库中体现。
- blocked 或合规风险素材默认不出现在普通检索结果中。
- 前端提供素材库列表、上传、检索、详情、经验洞察的完整入口。
- 后端 `pytest`、`compileall` 和前端 `lint`、`typecheck`、`test`、`build` 全部通过。
- README 和开发文档清楚描述素材库为核心的产品模型、信息架构、页面职责和本地验证命令。
- 前端默认入口和主导航体现素材工作台优先，brief 解析、素材生成、成片回流都围绕素材库上下文。
- 新增或更新前端测试覆盖素材库核心工作台、导航、brief 素材匹配说明和生成回流提示。
- 素材工作台展示三类资产 mock/demo 数据和改造前后效果指标。
- 素材库浏览页以 PC 资产流为核心，展示索引与召回解释、资产行、Inspector 和批量标注操作。
- 素材详情页展示入库流水线和标签治理规则。
- 标签管理支持新增、删除、编辑、确认 AI 标签，并明确效果标签、合规标签和 locked 标签限制。
- 使用 impeccable 产品 UI 规则完成审查，并至少进行一轮合理 UI 改进。
- 前端 `lint`、`typecheck`、`test`、`build` 全部通过。
