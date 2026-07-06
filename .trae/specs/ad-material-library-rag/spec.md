# 广告素材库多模态检索与 RAG Spec

## Why
现有广告 TVC 制作网站已经具备 brief 解析、分段生成、成片合成和画廊能力，但缺少统一素材库，历史素材、成品素材和创意经验无法被结构化沉淀、检索和复用。需要实现技术方案中的广告素材库能力，让素材从“上传存储”升级为“可打标、可索引、可检索、可问答、可回流”的动态资产。

## What Changes
- 新增广告素材库后端领域模型、仓储、入库、预处理、AI 打标、向量化、VikingDB 知识库索引、混合检索、RAG 问答、效果回流和审计能力。
- 新增素材库前端入口，支持素材列表、上传/导入、多模态检索、素材详情和经验洞察。
- 将前端产品心智调整为“素材库驱动的广告生成工作台”，brief 解析、素材生成、成片回流围绕素材库展开。
- 将素材库核心 UI 与开发说明沉淀到 `README.md` 和开发文档中，明确信息架构、工作流、页面职责和验证方式。
- 豆包 Seed 模型统一使用 `doubao-seed-2-1-pro-260628`。
- VikingDB 使用“向量数据库（知识库版本）”接入方式，API Key 只能通过 `VIKINGDB_API_KEY` 环境变量提供，禁止写入代码、测试快照、README 示例或 spec 文档。
- 保留未配置外部服务时的 deterministic fallback，确保本地开发和自动化测试无需真实外部服务即可通过。
- 不引入破坏性变更；现有 TVC 项目创建、brief 解析、视频生成、成片画廊和 admin 路由应继续可用。

## Impact
- Affected specs: 广告 TVC 制作网站、素材库入库、AI 自动打标、向量索引、混合检索、RAG 洞察、效果回流、安全合规、前端导航。
- Affected code: `backend/app/config.py`、`backend/app/storage.py`、`backend/app/main.py`、新增 `backend/app/material_*.py`、新增 `backend/app/vikingdb_client.py`、新增后端测试、`frontend/src/main.tsx`、`frontend/src/routes/AppShell.tsx`、`frontend/src/types.ts`、新增素材库前端页面和测试、`frontend/src/styles.css`、`.env.example`、`README.md`、`docs/`。

## ADDED Requirements

### Requirement: 素材领域模型
The system SHALL model advertising materials as first-class assets with metadata, tags, index state, effect metrics and audit events.

#### Scenario: Create material asset
- **WHEN** a material is uploaded, imported or created through API
- **THEN** the system SHALL create a material record with `received` status, asset type, library type, source metadata and audit event

#### Scenario: Track lifecycle status
- **WHEN** material processing advances
- **THEN** the system SHALL represent status as one of `received`, `preprocessed`, `tagged`, `indexed`, `searchable`, `blocked`, `failed`

### Requirement: 素材接收与预处理
The system SHALL support online upload, TOS URI batch import and external API ingestion.

#### Scenario: Upload material files
- **WHEN** user uploads one or more valid material files
- **THEN** the backend SHALL save files, compute MD5, extract basic metadata and create material records

#### Scenario: Deduplicate exact files
- **WHEN** a new file has the same MD5 as an existing material
- **THEN** the system SHALL record duplicate relation and avoid creating duplicate index work

#### Scenario: Import TOS material references
- **WHEN** user submits TOS URI list
- **THEN** the system SHALL create received material records with source URI and fallback metadata

### Requirement: AI 自动打标
The system SHALL generate content, business and management tags using Doubao Seed with deterministic fallback.

#### Scenario: Use configured model
- **WHEN** AI tagging is triggered and model access is configured
- **THEN** the system SHALL use `doubao-seed-2-1-pro-260628` as the Seed model name

#### Scenario: Local fallback
- **WHEN** model access is not configured
- **THEN** the system SHALL generate deterministic fallback tags so tests and local demos remain stable

#### Scenario: Manual correction
- **WHEN** user edits material tags
- **THEN** the system SHALL persist human-sourced tags and append an audit event

### Requirement: VikingDB 知识库版本索引
The system SHALL provide a VikingDB knowledge-base-version client boundary for vector index operations.

#### Scenario: Configure VikingDB safely
- **WHEN** VikingDB is enabled
- **THEN** the system SHALL read API Key from `VIKINGDB_API_KEY` and never expose its value in public config responses, docs or logs

#### Scenario: Index material
- **WHEN** material has usable metadata and tags
- **THEN** the system SHALL create deterministic embedding in fallback mode or real embedding in configured mode, then store vector index metadata

#### Scenario: Knowledge-base-version search
- **WHEN** vector search is requested
- **THEN** the VikingDB client boundary SHALL support knowledge-base-style search payloads and preserve request/response shapes in tests without requiring network access

### Requirement: 混合检索与 RAG
The system SHALL support natural-language material search with vector recall, scalar filtering, result fusion, reranking and RAG answer generation.

#### Scenario: Search by text
- **WHEN** user submits a natural-language query
- **THEN** the system SHALL parse intent, recall matching materials, rerank results and return evidence-rich result cards

#### Scenario: Filter by tags and attributes
- **WHEN** user submits filters such as library type, asset type, brand or tags
- **THEN** the system SHALL restrict results to matching searchable materials

#### Scenario: Generate RAG answer
- **WHEN** RAG is enabled for a query
- **THEN** the system SHALL generate an answer based on Top-N material summaries and cite matching evidence

### Requirement: 数据资产分层与效果回流
The system SHALL represent raw materials, finished assets and knowledge assets as logical library views and support effect feedback.

#### Scenario: Record effect metrics
- **WHEN** exposure, click or conversion metrics are posted
- **THEN** the system SHALL update effect metrics and derive effect tags

#### Scenario: Prefer high-performing assets
- **WHEN** search results include finished assets with strong effect metrics
- **THEN** reranking SHALL boost them deterministically

#### Scenario: Generate insight records
- **WHEN** high-performing finished assets are available
- **THEN** the system SHALL create reusable creative insights with method, script template and prompt fields

### Requirement: 安全合规与审计
The system SHALL prevent blocked or risky materials from normal retrieval and preserve traceability.

#### Scenario: Block risky material
- **WHEN** material has copyright risk, compliance risk or banned content
- **THEN** the system SHALL mark it as `blocked`

#### Scenario: Hide blocked material
- **WHEN** normal search is executed
- **THEN** blocked materials SHALL NOT appear in results

#### Scenario: Audit critical actions
- **WHEN** upload, tag edit, index, search, effect feedback or block state change occurs
- **THEN** the system SHALL append an audit event

### Requirement: 前端素材库体验
The system SHALL provide user-facing material library pages with polished visual quality consistent with the existing TVC site.

#### Scenario: Browse materials
- **WHEN** user opens the material library page
- **THEN** the frontend SHALL display searchable, filterable material cards with clear status, asset type and tag indicators

#### Scenario: Search and ask
- **WHEN** user opens multimodal search page and submits a query
- **THEN** the frontend SHALL show result cards, evidence, scores and RAG answer panel

#### Scenario: Inspect material details
- **WHEN** user opens a material detail page
- **THEN** the frontend SHALL show metadata, tags, index state, effect metrics and audit events

### Requirement: 素材库核心工作台
The system SHALL make the material library the primary product surface for ingestion, brief interpretation, generation context assembly and result backflow.

#### Scenario: Material-first navigation
- **WHEN** user enters the web app
- **THEN** the navigation SHALL prioritize material workspace, material library, brief analysis, generation studio, insights/backflow and history records

#### Scenario: Workspace overview
- **WHEN** user opens the material workspace
- **THEN** the frontend SHALL show the material-driven workflow, asset health, processing queues and next actions for ingestion, brief analysis, generation and RAG search

#### Scenario: Brief around materials
- **WHEN** user prepares or reviews brief inputs
- **THEN** the UI SHALL communicate that brief parsing extracts requirements and matches reusable materials, missing assets and generation evidence from the material library

#### Scenario: Generation around asset context
- **WHEN** user reviews generation plans or outputs
- **THEN** the UI SHALL show generation as a material-context process that uses selected references, produces finished assets and feeds results back into the material library

### Requirement: 素材库方案文档化
The system SHALL document the material-library-centered product model in README and developer documentation.

#### Scenario: README explains product model
- **WHEN** a developer reads `README.md`
- **THEN** they SHALL understand that the material library is the core product surface and brief parsing/material generation are workflows around it

#### Scenario: Developer docs explain implementation
- **WHEN** a developer reads the development documentation
- **THEN** they SHALL find the information architecture, key pages, frontend routes, backend boundaries, material backflow model and verification commands

## MODIFIED Requirements

### Requirement: Backend public config
The backend public config endpoint SHALL continue to hide secret values and SHALL report only whether external service keys are configured.

#### Scenario: VikingDB API Key configured
- **WHEN** `/config` is requested
- **THEN** response SHALL show `vikingdb_api_key` as `configured` or `missing`, never the raw key

### Requirement: Existing TVC flows
Existing TVC project, history, generation, gallery and admin flows SHALL continue working after material library routes and models are added.

#### Scenario: Existing tests
- **WHEN** existing backend and frontend test suites run
- **THEN** previously passing tests SHALL continue to pass

### Requirement: Frontend information architecture
The frontend SHALL preserve existing TVC capabilities while reframing them as material-library-centered workflows rather than isolated project steps.

#### Scenario: Legacy flow compatibility
- **WHEN** existing project creation, brief input, plan confirmation, generation progress, preview, gallery, history and admin routes are used
- **THEN** they SHALL remain reachable and covered by tests after the navigation and copy changes

## REMOVED Requirements
No existing requirements are removed.
