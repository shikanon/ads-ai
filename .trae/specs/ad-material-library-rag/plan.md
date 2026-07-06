# 广告素材库多模态检索与 RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有广告 TVC 制作网站中扩展“广告素材库”能力，支持素材统一入库、AI 自动打标、VikingDB 多模态索引、混合检索、RAG 洞察、成品/经验沉淀与效果数据回流。

**Architecture:** 采用增量式架构，不重写现有 TVC 生成链路。后端继续以 FastAPI 提供 REST API，本地 JSON 存储先承载开发态元数据，同时新增 TOS、Doubao、VikingDB 的客户端边界；前端新增素材库、检索、详情、洞察与管理入口，后续可替换为真实数据库和异步队列。

**Tech Stack:** FastAPI, Pydantic, Python, React, Vite, TypeScript, Vitest, Pytest, Volcengine TOS, Doubao Seed, Doubao Embedding, VikingDB, FFmpeg.

**Source:** 飞书 Wiki 技术方案 `Qd5wdYZC5owqdAxAvXfcN2plnZc`, revision `627`, 原链接 `https://bytedance.larkoffice.com/wiki/RIOuwbfdziCESSk1j8ncNK9PnMd?from=from_copylink`。

---

## Scope

本计划覆盖技术方案中的核心能力：

- 素材统一接收：在线上传、批量导入、API 接入。
- 素材清洗预处理：格式校验、元数据提取、MD5/pHash 去重。
- AI 自动打标：视觉、语音、文本、品牌定制标签，并支持人工校准。
- 向量化与索引：Doubao 多模态 Embedding、VikingDB HNSW/Hybrid、INT8、分区与分片策略。
- 多模态检索：文本/图片/视频 Query 解析，多路召回、融合、重排。
- RAG 洞察：基于检索结果生成可解释答案和运营建议。
- 数据资产化：原始素材库、成品库、经验库。
- 效果回流：曝光、点击、转化等投放数据回写并反哺排序与经验沉淀。
- 安全合规：权限、版权、禁用内容、审计留痕。

首期不做的内容：

- 不引入真实消息队列，使用同步/本地任务状态模拟队列消费者。
- 不强制接入真实关系型数据库，先沿用现有 `JsonRepository`。
- 不实现完整 AI 搜索引擎商品化配置台，只实现业务所需的素材检索体验。
- 不实现组织级账号体系，只基于现有接口预留 `owner_id`、`brand_id`、`visibility` 字段。

## File Structure

- Create: `backend/app/material_models.py`，素材库领域模型、标签模型、索引状态、检索请求响应。
- Create: `backend/app/material_storage.py`，素材、标签、向量索引状态、效果数据、审计记录的仓储封装。
- Create: `backend/app/material_ingestion.py`，素材接收、预处理、去重、元数据提取。
- Create: `backend/app/material_tagging.py`，Doubao Seed/多模态打标边界与本地 fallback。
- Create: `backend/app/material_embedding.py`，Doubao Embedding 请求构建与向量化 fallback。
- Create: `backend/app/vikingdb_client.py`，VikingDB upsert/search/hybrid search 客户端边界。
- Create: `backend/app/material_search.py`，查询解析、多路召回、融合、重排、RAG 编排。
- Modify: `backend/app/main.py`，挂载素材库相关 API。
- Modify: `backend/app/config.py`，新增 TOS、VikingDB、Embedding、RAG 配置项。
- Modify: `backend/app/storage.py`，初始化素材库 collection，或委托 `material_storage.py` 独立维护。
- Create: `backend/tests/test_material_models.py`，领域模型与状态转换测试。
- Create: `backend/tests/test_material_ingestion.py`，入库、校验、去重、元数据测试。
- Create: `backend/tests/test_material_search.py`，检索、融合、RAG fallback 测试。
- Create: `frontend/src/routes/MaterialLibraryPage.tsx`，素材库总览与过滤入口。
- Create: `frontend/src/routes/MaterialUploadPage.tsx`，在线上传与批量导入入口。
- Create: `frontend/src/routes/MaterialSearchPage.tsx`，文本/图片检索与 RAG 问答。
- Create: `frontend/src/routes/MaterialDetailPage.tsx`，素材详情、标签、索引状态、审计信息。
- Create: `frontend/src/routes/MaterialInsightsPage.tsx`，效果回流与经验库洞察。
- Modify: `frontend/src/routes/AppShell.tsx`，新增素材库导航。
- Modify: `frontend/src/main.tsx`，新增素材库相关路由。
- Modify: `frontend/src/types.ts`，新增素材库前端类型。
- Create: `frontend/src/routes/MaterialLibraryPage.test.tsx`，素材库列表测试。
- Create: `frontend/src/routes/MaterialSearchPage.test.tsx`，检索与 RAG 展示测试。
- Modify: `.env.example`，新增外部服务环境变量。
- Modify: `README.md`，新增素材库能力、启动配置与验证命令。

## Data Model

核心实体：

- `MaterialAsset`：素材主表，包含 `id`、`asset_type`、`library_type`、`status`、`storage_uri`、`checksum_md5`、`phash`、`technical_metadata`、`business_tags`、`effect_metrics`。
- `MaterialTag`：标签表，包含 `id`、`asset_id`、`dimension`、`name`、`value`、`confidence`、`source`、`review_status`。
- `MaterialVectorIndex`：索引表，包含 `asset_id`、`embedding_model`、`vector_id`、`partition_key`、`index_status`、`last_indexed_at`。
- `MaterialSearchQuery`：检索请求，支持 `text`、`image_file_id`、`video_file_id`、`filters`、`top_k`、`rag_enabled`。
- `MaterialSearchResult`：检索结果，包含素材卡片、召回来源、向量分、标量分、rerank 分、解释信息。
- `MaterialInsight`：经验沉淀，包含来源成品、创意方法论、脚本模板、Prompt、效果依据。
- `MaterialAuditEvent`：审计记录，记录上传、审核、索引、检索、下载、删除等动作。

状态机：

- `received`：已接收原始文件。
- `preprocessed`：完成格式校验、元数据提取和去重判断。
- `tagged`：完成 AI 打标或人工标注。
- `indexed`：完成向量写入和标量索引。
- `searchable`：元数据与向量均可用，可以被检索。
- `blocked`：版权、合规或禁用词风险阻断。
- `failed`：入库、打标、向量化或索引过程失败。

## API Design

- `POST /api/materials/upload`：在线上传单个或多个素材文件。
- `POST /api/materials/import`：按 TOS 路径批量导入素材。
- `POST /api/materials`：外部系统 API 接入素材和基础元数据。
- `GET /api/materials`：素材列表，支持库类型、素材类型、标签、状态过滤。
- `GET /api/materials/{material_id}`：素材详情。
- `POST /api/materials/{material_id}/preprocess`：触发清洗与预处理。
- `POST /api/materials/{material_id}/tag`：触发 AI 打标。
- `PUT /api/materials/{material_id}/tags`：人工校准标签。
- `POST /api/materials/{material_id}/index`：触发向量化与 VikingDB 写入。
- `POST /api/materials/search`：多模态混合检索。
- `POST /api/materials/rag`：基于素材检索结果进行问答或洞察。
- `POST /api/materials/effects`：回写投放效果数据。
- `GET /api/materials/insights`：经验库和高效果素材洞察。

## Task Plan

### Task 1: Material Domain Foundation

**Files:**
- Create: `backend/app/material_models.py`
- Create: `backend/app/material_storage.py`
- Modify: `backend/app/storage.py`
- Create: `backend/tests/test_material_models.py`
- Create: `backend/tests/test_material_storage.py`

**Steps:**
- [ ] Define Pydantic models for material assets, tags, vector index states, search requests, search results, insights and audit events.
- [ ] Extend local metadata initialization with collections `materials`, `material_tags`, `material_indexes`, `material_effects`, `material_insights`, `material_audit_events`.
- [ ] Implement repository helpers for creating assets, listing assets, updating status, upserting tags, storing index metadata, appending audit events.
- [ ] Add tests for default status, enum serialization, repository round-trip, tag upsert and audit append.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_models.py tests/test_material_storage.py -v`.
- [ ] Commit with `feat: add material library domain foundation`.

### Task 2: Ingestion And Preprocessing

**Files:**
- Create: `backend/app/material_ingestion.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_material_ingestion.py`

**Steps:**
- [ ] Implement material upload API using existing upload validation patterns from `backend/app/file_validation.py`.
- [ ] Compute MD5 for exact deduplication and store duplicate relation when the same file already exists.
- [ ] Extract basic metadata for image/video/audio/text files, using safe fallback when local codec tools are unavailable.
- [ ] Add batch import request model that accepts TOS URI list and creates `received` assets without downloading in development mode.
- [ ] Add API tests covering upload, duplicate upload, unsupported file type and TOS import.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_ingestion.py tests/test_api_flow.py -v`.
- [ ] Commit with `feat: add material ingestion and preprocessing`.

### Task 3: AI Tagging Pipeline

**Files:**
- Create: `backend/app/material_tagging.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_material_tagging.py`

**Steps:**
- [ ] Add config for Doubao Seed model, tagging timeout and low-confidence review threshold.
- [ ] Implement deterministic local fallback tags for tests and unconfigured environments.
- [ ] Build prompt templates for visual, speech and text tag dimensions: content, business, effect/management.
- [ ] Aggregate generated tags by dimension and name, keep the highest confidence, and mark low-confidence tags as `needs_review`.
- [ ] Add manual tag update API that records `source=human` and writes audit events.
- [ ] Add tests for fallback tags, duplicate tag merge, low-confidence review and manual correction.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_tagging.py tests/test_material_storage.py -v`.
- [ ] Commit with `feat: add material ai tagging pipeline`.

### Task 4: Embedding And VikingDB Index

**Files:**
- Create: `backend/app/material_embedding.py`
- Create: `backend/app/vikingdb_client.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_material_embedding.py`

**Steps:**
- [ ] Add config for embedding model, vector dimension, VikingDB collection, partition field and hybrid index mode.
- [ ] Implement embedding request construction for text, image, video keyframe and audio transcript inputs.
- [ ] Implement local deterministic vector fallback for tests.
- [ ] Implement VikingDB client boundary with `upsert_vector`, `search_vector`, `hybrid_search`, and `delete_vector`.
- [ ] Store vector metadata with model version, partition key and index status.
- [ ] Add tests for embedding fallback stability, partition key selection, index status transition and client payload shape.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_embedding.py tests/test_material_models.py -v`.
- [ ] Commit with `feat: add material embedding and vikingdb index boundary`.

### Task 5: Hybrid Search And RAG

**Files:**
- Create: `backend/app/material_search.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_material_search.py`

**Steps:**
- [ ] Implement query parser that extracts intent, keywords, filters and whether RAG is needed.
- [ ] Implement vector recall through `vikingdb_client.search_vector`.
- [ ] Implement scalar recall over local metadata and tags for development mode.
- [ ] Merge recall results by material id, preserve source evidence and compute a deterministic fused score.
- [ ] Implement rerank fallback using score, tag match count and effect metrics.
- [ ] Implement RAG answer generation fallback that cites top material summaries and explains why they match.
- [ ] Add tests for text search, filtered search, duplicate recall merge, rerank order and RAG answer shape.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_search.py tests/test_api_flow.py -v`.
- [ ] Commit with `feat: add material hybrid search and rag`.

### Task 6: Effect Feedback And Insight Library

**Files:**
- Create: `backend/app/material_insights.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_material_insights.py`

**Steps:**
- [ ] Add effect metrics ingestion for impressions, clicks, conversions, CTR and CVR.
- [ ] Update material effect tags after metrics ingestion.
- [ ] Adjust rerank input so high-performing searchable materials receive deterministic boost.
- [ ] Generate insight records from high-effect finished materials with method, script template and prompt fields.
- [ ] Add tests for effect update, rank boost and insight creation.
- [ ] Run `cd backend && python3 -m pytest tests/test_material_insights.py tests/test_material_search.py -v`.
- [ ] Commit with `feat: add material effect feedback and insights`.

### Task 7: Frontend Material Library UX

**Files:**
- Create: `frontend/src/routes/MaterialLibraryPage.tsx`
- Create: `frontend/src/routes/MaterialUploadPage.tsx`
- Create: `frontend/src/routes/MaterialSearchPage.tsx`
- Create: `frontend/src/routes/MaterialDetailPage.tsx`
- Create: `frontend/src/routes/MaterialInsightsPage.tsx`
- Modify: `frontend/src/routes/AppShell.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/routes/MaterialLibraryPage.test.tsx`
- Create: `frontend/src/routes/MaterialSearchPage.test.tsx`

**Steps:**
- [ ] Add front-end types that mirror backend material assets, tags, search results and insights.
- [ ] Add navigation items for “素材库”, “素材上传”, “多模态检索”, “经验洞察”.
- [ ] Implement list page with filters for library type, asset type, status and tags.
- [ ] Implement upload/import page with online file upload and TOS URI batch import input.
- [ ] Implement search page with text query, filter chips, result cards and RAG answer panel.
- [ ] Implement detail page with metadata, tags, index status, effect metrics and audit events.
- [ ] Implement insights page with high-effect finished assets and reusable creative methods.
- [ ] Add Vitest coverage for list rendering, search request, RAG answer and empty states.
- [ ] Run `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build`.
- [ ] Commit with `feat: add material library frontend`.

### Task 8: Documentation And Release Validation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `.trae/specs/ad-material-library-rag/tasks.md`

**Steps:**
- [ ] Document environment variables for TOS, Doubao Seed, Doubao Embedding and VikingDB.
- [ ] Document local fallback behavior when external services are not configured.
- [ ] Add API examples for upload, tag, index, search, RAG and effect feedback.
- [ ] Update task checklist statuses after implementation.
- [ ] Run `cd backend && python3 -m pytest && python3 -m compileall app`.
- [ ] Run `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build`.
- [ ] Remove generated `frontend/dist` after build verification if it is not tracked.
- [ ] Commit with `docs: document material library workflow`.

## Verification Matrix

- Backend models: `cd backend && python3 -m pytest tests/test_material_models.py -v`
- Backend ingestion: `cd backend && python3 -m pytest tests/test_material_ingestion.py -v`
- Backend tagging: `cd backend && python3 -m pytest tests/test_material_tagging.py -v`
- Backend embedding: `cd backend && python3 -m pytest tests/test_material_embedding.py -v`
- Backend search/RAG: `cd backend && python3 -m pytest tests/test_material_search.py -v`
- Backend insights: `cd backend && python3 -m pytest tests/test_material_insights.py -v`
- Backend full suite: `cd backend && python3 -m pytest && python3 -m compileall app`
- Frontend checks: `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build`

## Risks

- VikingDB、Doubao Embedding、Doubao Seed 的真实接口字段可能与本地边界假设不同，需要以官方 SDK/文档校准 payload。
- 视频关键帧、音频转写、pHash 依赖本地多媒体工具，开发态需要 fallback，生产态需要异步任务和重试。
- 现有本地 JSON 存储适合验证流程，不适合大规模素材库；生产化需要迁移到数据库、队列和对象存储。
- 效果回流依赖投放侧数据口径，必须确认素材 ID 与投放素材 ID 的映射规则。
- 权限、版权、审计属于生产必备能力，首期至少要有字段、状态和阻断逻辑，不能只做前端提示。
