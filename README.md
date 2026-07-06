# 广告 TVC 制作网站

广告 TVC 制作与素材复用工作台，包含 React/Vite 前端与 FastAPI 后端。现有能力覆盖 brief 解析、分段生成、成片合成和画廊；素材库能力支持素材入库、AI 自动打标、向量索引、混合检索、RAG 问答、效果回流和经验洞察沉淀。

## 本地启动

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 启动后端：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9898
```

3. 启动前端：

```bash
cd frontend
npm install
npm run dev
```

前端默认访问 `http://localhost:8989`，后端健康检查为 `http://localhost:9898/health`。
Vite 开发代理会将 `/api` 请求转发到 `VITE_API_BASE_URL`，默认值为 `http://localhost:9898`。

## 素材库能力

- 素材接收：支持本地文件上传、`tos://` URI 批量导入和外部系统 API 入库。
- 素材分层：通过 `library_type=raw|finished|knowledge` 区分原始素材、成品素材和经验知识。
- AI 打标：使用 Doubao Seed 生成内容、业务、管理和效果标签，并支持人工校准。
- 向量索引：基于 Doubao Embedding 请求形态生成向量，写入 VikingDB 知识库版本客户端边界。
- 混合检索：支持自然语言查询、素材类型/库类型/标签过滤、向量召回与标量召回融合重排。
- RAG 问答：基于 Top-N 素材证据生成回答，返回答案、引用和检索结果。
- 效果回写：接收曝光、点击、转化、CTR、CVR 等指标，更新素材效果标签并生成经验洞察。
- 安全审计：blocked 或合规风险素材默认不进入普通检索，上传、打标、索引、搜索和效果回写都会记录审计事件。

## 外部服务配置

复制 `.env.example` 到 `.env` 后按需填写外部服务配置。请勿把真实 API Key 写入 README、测试、代码、提交记录或截图。

- `ARK_API_KEY`：Doubao Seed Chat 接口鉴权，用于 brief 解析、素材打标和 RAG 生成；为空时使用本地 fallback。
- `SEED_TAGGING_MODEL_NAME`：素材打标/RAG 使用的 Seed 模型，默认 `doubao-seed-2-1-pro-260628`。
- `MATERIAL_EMBEDDING_MODEL_NAME`、`MATERIAL_EMBEDDING_MODEL_VERSION`、`MATERIAL_EMBEDDING_VECTOR_DIM`：素材 embedding 的模型名、版本和向量维度。
- `VIKINGDB_API_KEY`：VikingDB 知识库版本 API Key，只能通过环境变量提供；`/config` 仅返回 `configured` 或 `missing`。
- `VIKINGDB_KNOWLEDGE_BASE_ENDPOINT`、`VIKINGDB_KNOWLEDGE_BASE_COLLECTION`、`VIKINGDB_PARTITION_FIELD`、`VIKINGDB_HYBRID_INDEX_MODE`：VikingDB 知识库版本 endpoint、collection、分区字段和混合检索模式。
- `OBJECT_STORAGE_*`、`TOS_*`：TOS 对象存储和素材 URI 相关占位配置；当前素材库导入接口只校验并记录 `tos://` URI，不要求本地访问真实 TOS。
- `RAG_TOP_K`、`RAG_EVIDENCE_LIMIT`：RAG 本地调试占位配置；当前 API 通过请求体 `top_k` 与服务端 Top-N 证据逻辑控制返回。

## 本地 Fallback

未配置外部服务时，素材库仍可在本地稳定运行：

- `ARK_API_KEY` 为空时，AI 打标和 RAG 使用 deterministic fallback，输出稳定标签和回答。
- `VIKINGDB_API_KEY` 或 `VIKINGDB_KNOWLEDGE_BASE_ENDPOINT` 为空时，VikingDB 客户端返回 `fallback=true` 的请求回显，不发起网络请求。
- Embedding 当前使用 deterministic vector fallback，保证本地测试和演示无需真实向量模型。
- TOS 批量导入只保存 `tos://` 引用和 fallback metadata，不下载云端对象。

## 素材库 API 示例

以下示例默认后端运行在 `http://localhost:9898`。示例中的 `MATERIAL_ID` 需替换为实际返回的素材 ID，所有密钥均从本地 `.env` 读取，不在 curl 中传递。

### 上传素材

```bash
curl -X POST "http://localhost:9898/api/materials/upload" \
  -F "files=@/path/to/material.png" \
  -F "library_type=raw" \
  -F "source_system=local-demo" \
  -F "visibility=private" \
  -F "brand_id=demo-brand" \
  -F "actor=developer"
```

### TOS 批量导入

```bash
curl -X POST "http://localhost:9898/api/materials/import" \
  -H "Content-Type: application/json" \
  -d '{
    "uris": ["tos://demo-bucket/ad-materials/summer-video.mp4"],
    "library_type": "finished",
    "source_metadata": {"campaign": "summer_launch"},
    "visibility": "brand",
    "brand_id": "demo-brand",
    "actor": "developer"
  }'
```

### 触发 AI 打标

```bash
curl -X POST "http://localhost:9898/api/materials/MATERIAL_ID/tag" \
  -H "Content-Type: application/json" \
  -d '{"actor": "developer"}'
```

### 写入向量索引

```bash
curl -X POST "http://localhost:9898/api/materials/MATERIAL_ID/index" \
  -H "Content-Type: application/json" \
  -d '{"actor": "developer"}'
```

### 混合搜索

```bash
curl -X POST "http://localhost:9898/api/materials/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "夏日饮料 高转化 适合开屏的短视频素材",
    "top_k": 5,
    "asset_types": ["video"],
    "library_types": ["finished"],
    "tags": ["夏日", "饮料"],
    "enable_rag": false,
    "actor": "developer"
  }'
```

### RAG 问答

```bash
curl -X POST "http://localhost:9898/api/materials/rag" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "有哪些高点击素材可以复用到夏日饮料新品？",
    "top_k": 5,
    "library_types": ["finished"],
    "enable_rag": true,
    "actor": "developer"
  }'
```

### 效果回写

```bash
curl -X POST "http://localhost:9898/api/materials/effects" \
  -H "Content-Type: application/json" \
  -d '{
    "material_id": "MATERIAL_ID",
    "impressions": 100000,
    "clicks": 4200,
    "conversions": 380,
    "ctr": 0.042,
    "cvr": 0.0038,
    "actor": "developer"
  }'
```

## 验证命令

```bash
cd backend && python3 -m pytest && python3 -m compileall app
cd frontend && npm run lint && npm run typecheck && npm run test && npm run build
```
