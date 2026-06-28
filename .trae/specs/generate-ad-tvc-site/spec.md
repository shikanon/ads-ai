# 广告 TVC 制作网站 Spec

## Why
广告 TVC 通常需要从 brief 文件或自然语言需求中提炼创意、镜头、素材参考和投放目标，并生成 30 秒到 90 秒以上的成片。由于 Seedance 2.0 单次最多生成 15 秒视频，系统需要将广告片拆解成连续、不突兀的多段生成任务，并在用户确认后自动生成和合成完整广告片。

## What Changes
- 新增一个广告 TVC 制作网站，支持用户上传 brief 文件（PDF/PPT）或输入需求文本。
- 使用 Seed 2.1 多模态大模型解析 brief/文本，输出结构化需求项、广告片策略、镜头段落、提示词和多模态参考项。
- 将广告片拆解为多个不超过 15 秒的视频片段，并要求拆分边界只出现在完整镜头或自然转场处，避免将同一个镜头切成两段。
- 提供用户确认与编辑流程，允许用户确认或调整需求项、片段提示词、参考视频、参考图片、参考音频、时长和镜头顺序。
- 使用 Seedance 2.0 多模态参考能力为每个片段生成视频，并在后端编排任务提交、状态轮询、失败重试和结果回收。
- 支持将多段视频合成为完整广告 TVC，并尽量保持叙事、视觉、音乐、角色、品牌资产和转场连续。
- 支持历史记录，用户完成或中断项目后可在网站中查看、继续编辑、预览或删除历史项目，避免每次操作后无处存储。
- 后端语言使用 Python，提供文件上传、brief 解析、方案确认、视频生成、任务查询和成片合成相关 API。
- 集成火山方舟 Files API 上传参考素材或 brief 文件，集成 Seedance 2.0 视频生成 API 和 Seed 2.1 Chat API。
- 不在本次规格中要求账号体系、在线支付、团队协作、复杂资产库和商业化发布流程。

## Impact
- Affected specs: 广告 TVC brief 解析、分镜规划、多模态参考管理、视频生成任务编排、视频合成、生成结果确认。
- Affected code: Python 后端服务、Web 前端页面、任务队列/异步任务模块、文件存储模块、Volcengine API 客户端、视频合成模块、配置与密钥管理。

## ADDED Requirements

### Requirement: Brief 输入
The system SHALL allow users to create a TVC project from either uploaded brief files or free-form requirement text.

#### Scenario: Upload PDF or PPT brief
- **WHEN** 用户上传 PDF/PPT brief 文件并提交解析
- **THEN** 系统应保存文件、校验格式和大小，并将文件内容或可访问文件引用提供给 brief 解析流程

#### Scenario: Enter requirement text
- **WHEN** 用户直接输入广告需求文本并提交解析
- **THEN** 系统应跳过文件解析步骤，并使用该文本作为 Seed 2.1 的需求输入

#### Scenario: Invalid input
- **WHEN** 用户未上传文件且未输入需求文本
- **THEN** 系统应提示至少提供一种输入方式，且不得创建解析任务

### Requirement: Brief 解析
The system SHALL use Seed 2.1 to parse input into structured advertising requirements.

#### Scenario: Parse brand and campaign requirements
- **WHEN** brief 解析任务执行成功
- **THEN** 系统应输出品牌信息、产品卖点、目标人群、传播目标、广告调性、片长建议、语言风格、禁用元素和交付规格

#### Scenario: Extract multimodal references
- **WHEN** brief 中包含或引用参考视频、参考图片、参考音频
- **THEN** 系统应将参考项结构化为类型、用途、来源、关联镜头、使用说明和上传后的文件标识

#### Scenario: Missing reference assets
- **WHEN** brief 描述了参考项但未提供素材文件
- **THEN** 系统应将该参考项标记为待补充，并允许用户继续编辑或上传素材

#### Scenario: Parse uploaded PDF or PPT content
- **WHEN** 用户上传 PDF/PPT brief 文件并触发解析
- **THEN** 后端应抽取 brief 文件文本内容，并将抽取内容提供给 Seed 2.1 或本地 fallback 解析流程，输出具体项目需求、提示词、参考视频、参考图片和参考音频

#### Scenario: Parse PDF pages as images
- **WHEN** 用户上传 PDF brief 文件并触发 Seed 2.1 解析
- **THEN** 后端应将 PDF 每一页渲染为图片，并将页图像与文本摘要一起提供给 Seed 2.1 多模态理解，以减少版式、图片、表格和视觉参考信息丢失

#### Scenario: Limit visual context safely
- **WHEN** PDF 页数较多或图片体积较大
- **THEN** 系统应按配置限制传入 Seed 2.1 的页数和单页图片尺寸，同时在 metadata 中记录总页数、已渲染页数和是否截断

#### Scenario: Avoid garbled PDF text
- **WHEN** PDF 文本抽取结果疑似由内嵌字体、自定义 CMap 或编码流导致乱码
- **THEN** 系统应丢弃该低质量文本，不得将乱码展示给用户或注入 Seed 2.1 prompt，并应优先使用 PDF 页图片进行视觉理解

#### Scenario: Local brief fallback
- **WHEN** 模型 API 不可用或未配置 API Key
- **THEN** 系统仍应基于本地抽取的 PDF/PPT 文本生成可编辑的结构化需求初稿，而不是只返回通用占位文案

### Requirement: 多段视频规划
The system SHALL split the TVC into multiple video segments where each segment duration is no more than 15 seconds.

#### Scenario: Long TVC decomposition
- **WHEN** 用户需求的广告总时长超过 15 秒
- **THEN** 系统应生成多个片段规划，每段时长不超过 15 秒，且总时长接近用户目标片长

#### Scenario: Shot boundary preservation
- **WHEN** Seed 2.1 拆解广告片段
- **THEN** 系统应要求拆分边界位于完整镜头、自然转场或情绪段落结束处，不得把同一个镜头强行切成两段

#### Scenario: Continuity planning
- **WHEN** 系统生成多段提示词
- **THEN** 每段提示词应包含连续性约束，包括角色一致、品牌资产一致、色彩风格一致、场景衔接、动作承接、声音/音乐承接和转场意图

#### Scenario: Segment references
- **WHEN** 系统生成片段规划
- **THEN** 每段应包含文本提示词、负向约束、参考视频列表、参考图片列表、参考音频列表、建议时长、镜头描述和与前后片段的衔接说明

### Requirement: 用户确认与编辑
The system SHALL require user confirmation before invoking video generation.

#### Scenario: Review parsed requirements
- **WHEN** brief 解析和片段规划完成
- **THEN** 前端应展示结构化需求项、片段列表、提示词和参考项，供用户确认

#### Scenario: Edit generation plan
- **WHEN** 用户修改需求项、提示词、参考素材、片段顺序或片段时长
- **THEN** 系统应保存修改后的生成计划，并以用户确认后的版本作为视频生成输入

#### Scenario: Confirm generation
- **WHEN** 用户点击确认生成
- **THEN** 系统才可以创建 Seedance 2.0 视频生成任务

### Requirement: 文件上传与素材管理
The system SHALL integrate Volcengine Files API for uploading files used by model calls.

#### Scenario: Upload local file
- **WHEN** 系统需要向模型提供 brief 或参考素材
- **THEN** 后端应调用 `POST https://ark.cn-beijing.volces.com/api/v3/files` 上传文件，并记录返回的文件标识、用途和来源

#### Scenario: Upload by URL
- **WHEN** 用户提供公网 URL 或 TOS URI
- **THEN** 后端应支持按 Files API 的 URL 方式上传或引用素材，并记录可追溯信息

#### Scenario: Unsupported asset
- **WHEN** 文件类型、大小或 URL 不符合接口限制
- **THEN** 系统应返回明确错误，并提示用户替换或压缩素材

### Requirement: 视频生成编排
The system SHALL use Seedance 2.0 multimodal reference video generation for each confirmed segment.

#### Scenario: Create segment generation task
- **WHEN** 用户确认生成计划
- **THEN** 后端应为每个片段调用 `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks` 创建视频生成任务

#### Scenario: Multimodal reference constraints
- **WHEN** 片段包含参考音频
- **THEN** 系统应确保请求中至少同时包含一个参考视频或参考图片，避免单独输入音频

#### Scenario: Track task status
- **WHEN** 视频生成任务提交成功
- **THEN** 系统应记录每段任务 ID、状态、请求参数摘要、重试次数、错误信息和生成结果 URL

#### Scenario: Partial failure
- **WHEN** 某个片段生成失败
- **THEN** 系统应允许用户重试失败片段，而不是强制重新生成全部片段

### Requirement: 成片合成
The system SHALL merge generated segments into a final TVC output.

#### Scenario: All segments completed
- **WHEN** 所有片段均生成成功
- **THEN** 系统应按用户确认的顺序合成完整 TVC，并生成可播放、可下载的成片文件

#### Scenario: Smooth transition
- **WHEN** 系统合成多段视频
- **THEN** 应根据片段衔接说明应用基础转场、音频连续性处理和必要的黑场/淡入淡出，减少拼接突兀感

#### Scenario: Preview final output
- **WHEN** 成片合成完成
- **THEN** 前端应展示最终视频预览、下载入口和每段生成结果的查看入口

### Requirement: 前端体验
The system SHALL provide a web interface for creating, reviewing, generating, and previewing TVC projects.

#### Scenario: Project workflow
- **WHEN** 用户进入网站
- **THEN** 用户应能按“输入 brief/需求 -> 解析需求 -> 确认方案 -> 生成片段 -> 合成成片 -> 预览下载”的流程完成制作

#### Scenario: Progress visibility
- **WHEN** 系统正在解析、生成或合成
- **THEN** 前端应展示任务状态、当前阶段、每段进度和错误提示

### Requirement: 历史记录
The system SHALL persist TVC projects as history records that users can revisit after leaving or completing a workflow.

#### Scenario: List history records
- **WHEN** 用户进入历史记录页面
- **THEN** 系统应展示已创建项目列表，包括项目标题、状态、创建时间、更新时间、目标片长、片段数量和最终成片状态

#### Scenario: Resume a history project
- **WHEN** 用户点击历史记录中的项目
- **THEN** 系统应打开该项目的当前阶段，并允许用户继续查看、编辑、生成或预览

#### Scenario: Delete a history project
- **WHEN** 用户删除某条历史记录
- **THEN** 系统应删除项目元数据及其关联的本地文件记录、解析结果、分段计划、生成任务和成片结果

#### Scenario: Empty history
- **WHEN** 尚无历史项目
- **THEN** 前端应展示空状态，并提供创建新 TVC 项目的入口

### Requirement: 成品画廊与导航骨架
The system SHALL provide a gallery for finished TVC outputs and keep project details behind explicit project entry points.

#### Scenario: Gallery shows finished outputs
- **WHEN** 用户进入画廊页面
- **THEN** 系统应只展示已有最终成片的项目卡片，包括成片预览、项目名称、更新时间、目标片长、成片状态和下载/查看入口

#### Scenario: Project details are hidden until selected
- **WHEN** 用户浏览导航栏或画廊/历史列表
- **THEN** 系统不得在全局导航中直接暴露 demo 项目的 brief、确认方案、生成进度和成片预览入口，项目详情只能在用户点击具体项目后进入

#### Scenario: Navigation skeleton
- **WHEN** 用户查看应用导航栏
- **THEN** 导航应按“新建项目、历史项目、成品画廊”的主层级组织，并用项目内页面承载 brief、方案、生成、预览等详情步骤

#### Scenario: Empty gallery
- **WHEN** 尚无已完成成品
- **THEN** 画廊应展示空状态，并引导用户从历史项目继续制作或新建项目

### Requirement: 后端服务
The system SHALL provide a Python backend for API orchestration, model integration, and media processing.

#### Scenario: API structure
- **WHEN** 前端调用后端
- **THEN** 后端应提供项目创建、历史列表、画廊列表、历史详情、历史删除、文件上传、brief 解析、方案更新、生成启动、任务状态查询、片段重试和成片下载接口

### Requirement: 远程域名入口
The system SHALL provide deployable domain configuration for the public application and admin management entry.

#### Scenario: Public application domain
- **WHEN** 用户访问 `https://lens-rhyme.tensorbytes.com`
- **THEN** 系统应进入广告 TVC 主程序，并能通过同域名 `/api` 访问后端能力

#### Scenario: Admin management domain
- **WHEN** 用户访问 `https://admin.lens-rhyme.tensorbytes.com`
- **THEN** 系统应进入 admin 管理后台入口，并能查看项目、成品和系统健康入口

#### Scenario: Domain CORS and reverse proxy
- **WHEN** 远程服务器按部署配置启动
- **THEN** 后端 CORS 应允许主域名和 admin 域名，反向代理应把两个域名的 `/api` 请求转发到 Python 后端

#### Scenario: Domain verification
- **WHEN** 完成域名配置
- **THEN** 应提供可执行的健康检查方式验证主域名、admin 域名和 API 健康检查可访问

#### Scenario: Configuration
- **WHEN** 服务启动
- **THEN** 后端应从环境变量读取火山方舟 API Key、模型名称、存储路径、任务轮询间隔和视频合成配置，不得硬编码密钥

#### Scenario: Observability
- **WHEN** 任务执行或失败
- **THEN** 后端应记录结构化日志，便于定位模型请求、文件上传、视频任务和合成失败原因

## MODIFIED Requirements
无。

## REMOVED Requirements
无。
