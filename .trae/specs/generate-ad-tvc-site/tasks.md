# Tasks

- [x] Task 1: 搭建项目基础结构：创建前端网站和 Python 后端服务的最小可运行骨架。
  - [x] SubTask 1.1: 初始化前端应用结构，提供项目创建、brief 输入、方案确认、生成进度和成片预览的页面路由。
  - [x] SubTask 1.2: 初始化 Python 后端服务，提供健康检查、配置读取、统一错误响应和结构化日志。
  - [x] SubTask 1.3: 定义项目、文件、需求项、参考素材、片段计划、生成任务和成片结果的数据模型。
  - [x] SubTask 1.4: 配置本地开发启动命令和必要的环境变量模板。

- [x] Task 2: 实现 brief 输入与文件上传：支持 PDF/PPT brief、参考视频、参考图片、参考音频和需求文本输入。
  - [x] SubTask 2.1: 前端实现文件上传和文本输入表单，校验 PDF/PPT 与多媒体参考素材类型。
  - [x] SubTask 2.2: 后端实现本地文件接收、基础校验、元数据保存和错误提示。
  - [x] SubTask 2.3: 后端封装 Volcengine Files API，支持二进制文件上传和 URL/TOS URI 上传。
  - [x] SubTask 2.4: 将上传后的文件标识与项目、参考素材和 brief 来源关联保存。

- [x] Task 3: 实现 Seed 2.1 brief 解析：将文件内容或需求文本解析为结构化广告需求和参考项。
  - [x] SubTask 3.1: 设计 Seed 2.1 解析提示词模板，覆盖品牌、产品、受众、卖点、风格、禁用项、目标片长和交付规格。
  - [x] SubTask 3.2: 后端封装 Seed 2.1 Chat API 调用，支持文本和文件引用输入。
  - [x] SubTask 3.3: 定义并校验解析结果 JSON Schema，包含需求项、参考视频、参考图片、参考音频和待补充素材。
  - [x] SubTask 3.4: 前端展示解析结果，并允许用户查看、修改和补充需求项。

- [x] Task 4: 实现多段 TVC 规划：基于 Seed 2.1 将广告片拆解为不超过 15 秒的连续片段。
  - [x] SubTask 4.1: 设计分段规划提示词模板，明确单段最长 15 秒、不得切分同一镜头、只在完整镜头或自然转场处拆分。
  - [x] SubTask 4.2: 生成片段级提示词、负向约束、参考素材映射、建议时长、镜头描述和前后衔接说明。
  - [x] SubTask 4.3: 后端校验每段时长不超过 15 秒，并校验总时长接近目标片长。
  - [x] SubTask 4.4: 前端提供片段列表编辑能力，支持修改顺序、时长、提示词和参考素材。

- [x] Task 5: 实现用户确认流程：确保用户确认后才启动 Seedance 2.0 视频生成。
  - [x] SubTask 5.1: 后端实现生成计划保存、版本更新和确认状态流转。
  - [x] SubTask 5.2: 前端实现确认页，展示结构化需求、片段提示词、参考项和潜在缺失素材。
  - [x] SubTask 5.3: 阻止未确认计划调用视频生成接口，并返回明确错误。

- [x] Task 6: 实现 Seedance 2.0 视频生成编排：为每个确认片段创建视频生成任务并跟踪状态。
  - [x] SubTask 6.1: 后端封装 Seedance 2.0 `contents/generations/tasks` 创建任务接口。
  - [x] SubTask 6.2: 将每段提示词、参考视频、参考图片、参考音频和时长转换为 Seedance 2.0 多模态参考请求。
  - [x] SubTask 6.3: 校验参考音频不可单独输入，至少需要同时包含一个参考视频或参考图片。
  - [x] SubTask 6.4: 实现任务状态轮询、失败记录、结果 URL 保存和失败片段单独重试。
  - [x] SubTask 6.5: 前端展示每段生成状态、错误原因、重试按钮和生成片段预览。

- [x] Task 7: 实现成片合成与预览下载：将多个片段合成为完整广告 TVC。
  - [x] SubTask 7.1: 后端下载或读取每段生成视频，并按确认顺序生成合成输入列表。
  - [x] SubTask 7.2: 使用视频处理工具执行基础拼接、淡入淡出或黑场转场，并处理音频连续性。
  - [x] SubTask 7.3: 保存最终成片文件、生成下载地址，并记录合成状态和错误信息。
  - [x] SubTask 7.4: 前端展示最终成片预览、下载入口和片段级结果入口。

- [x] Task 8: 补充验证与质量保障：覆盖核心流程、异常路径和模型请求转换。
  - [x] SubTask 8.1: 为 Python 后端补充单元测试，覆盖配置、数据模型、文件上传封装、解析结果校验、分段时长校验和 Seedance 请求构建。
  - [x] SubTask 8.2: 为关键 API 补充集成测试或接口级测试，覆盖 brief 解析、确认生成、任务状态查询和失败片段重试。
  - [x] SubTask 8.3: 为前端补充核心交互测试，覆盖输入、确认、进度展示、错误提示和成片预览。
  - [x] SubTask 8.4: 运行 lint、typecheck、test 和 build，修复新增问题。

- [x] Task 9: 统一本地开发端口：后端默认端口改为 9898，前端默认端口改为 8989，并同步文档、脚本、代理和测试。
  - [x] SubTask 9.1: 更新后端默认端口、CORS 默认来源和环境变量模板。
  - [x] SubTask 9.2: 更新前端 Vite 默认端口、`/api` 代理和 API 默认地址。
  - [x] SubTask 9.3: 更新 README、前后端测试断言，并完成验证。

- [x] Task 10: 增加历史记录：持久化项目历史，并提供历史列表、详情恢复和删除能力。
  - [x] SubTask 10.1: 后端补充历史列表、历史详情和历史删除 API，返回项目状态、创建时间、更新时间、片段数量和成片状态。
  - [x] SubTask 10.2: 后端确保项目创建、brief 输入、解析、分段、确认、生成和合成阶段都会更新历史记录的可展示摘要。
  - [x] SubTask 10.3: 前端新增历史记录入口和页面，支持空状态、项目列表、按项目状态展示、继续查看和删除。
  - [x] SubTask 10.4: 前端各流程页支持从历史项目恢复当前阶段，避免刷新或重新进入后丢失进度。
  - [x] SubTask 10.5: 补充后端接口测试和前端交互测试，并运行 lint、typecheck、test、build。

- [x] Task 11: 修复 brief 文件解析：读取上传 PDF/PPT 文本并解析为具体项目需求、提示词和参考素材。
  - [x] SubTask 11.1: 后端增加 PDF/PPT 文本抽取能力，并保存抽取摘要用于解析和历史详情。
  - [x] SubTask 11.2: 将抽取出的 brief 文本注入 Seed 2.1 解析提示词和本地 fallback，生成具体需求项而非通用占位内容。
  - [x] SubTask 11.3: 解析结果应包含项目提示词、参考视频、参考图片、参考音频和待补充素材建议。
  - [x] SubTask 11.4: 使用 `/Users/bytedance/Downloads/brief-测试.pdf` 完整验证上传和解析流程。
  - [x] SubTask 11.5: 补充后端接口/单元测试和前端必要展示验证，运行 lint、typecheck、test、build。

- [x] Task 12: 增强 PDF brief 多模态解析：将 PDF 每页渲染为图片并与文本摘要一起传给 Seed 2.1。
  - [x] SubTask 12.1: 后端增加 PDF 页图像渲染能力，保存页图片路径、总页数、已渲染页数和截断信息。
  - [x] SubTask 12.2: Seed 2.1 Chat 请求支持携带 PDF 页图片内容，同时保留文本摘要和文件引用。
  - [x] SubTask 12.3: 增加配置项控制最大页数、渲染缩放和图片尺寸，避免超大 brief 请求失控。
  - [x] SubTask 12.4: 前端上传成功后展示 PDF 页图像解析摘要，让用户知道已启用视觉理解。
  - [x] SubTask 12.5: 使用 `/Users/bytedance/Downloads/brief-测试.pdf` 验证 PDF 页图片生成、请求构建和解析结果，并补充测试。

- [x] Task 13: 修复 PDF 文本乱码：识别并丢弃低质量 PDF 抽取文本，避免乱码进入展示和解析 prompt。
  - [x] SubTask 13.1: 定位 `/Users/bytedance/Downloads/brief-测试.pdf` 乱码来源，并补充可复现测试。
  - [x] SubTask 13.2: 增加 PDF 抽取文本质量评分，过滤零宽字符、控制字符、内嵌字体编码噪声和过度碎片化单字文本。
  - [x] SubTask 13.3: 当 PDF 文本质量不合格时，不保存 `extracted_text/extracted_summary`，改为记录 `text_extraction_rejected_reason` 并继续使用 PDF 页图片。
  - [x] SubTask 13.4: 确保 Seed 2.1 prompt、前端上传摘要和本地 fallback 不再展示或使用乱码。
  - [x] SubTask 13.5: 使用 `/Users/bytedance/Downloads/brief-测试.pdf` 验证上传解析无乱码，并运行后端/前端测试。

- [x] Task 14: 增加成品画廊并梳理导航栏骨架：画廊展示成品，项目详情点击具体项目后进入。
  - [x] SubTask 14.1: 后端新增画廊列表 API，只返回有最终成片或成片状态的项目摘要与预览/下载信息。
  - [x] SubTask 14.2: 前端新增成品画廊页面，展示成品卡片、空状态、预览、下载和查看项目入口。
  - [x] SubTask 14.3: 重构导航栏主层级为“新建项目、历史项目、成品画廊”，移除全局 demo 项目详情入口。
  - [x] SubTask 14.4: 确保 brief、确认方案、生成进度、成片预览只通过历史/画廊/项目流程中的具体项目 ID 进入。
  - [x] SubTask 14.5: 补充后端接口测试和前端导航/画廊交互测试，并运行 lint、typecheck、test、build。

- [ ] Task 15: 配置远程主程序和 admin 管理后台域名入口，确保部署后可访问。
  - [ ] SubTask 15.1: 增加主程序域名 `lens-rhyme.tensorbytes.com` 和 admin 域名 `admin.lens-rhyme.tensorbytes.com` 的环境变量与后端 CORS 默认/示例配置。
  - [ ] SubTask 15.2: 新增 admin 管理后台入口页面，admin 域名访问根路径时进入管理后台。
  - [ ] SubTask 15.3: 增加远程服务器反向代理配置示例，两个域名均代理 `/api` 到 Python 后端，主域名服务主程序，admin 域名服务后台入口。
  - [ ] SubTask 15.4: 更新 README 部署说明，包含 DNS、Nginx、前端构建、后端启动和健康检查命令。
  - [ ] SubTask 15.5: 补充后端配置测试和前端域名/admin 路由测试，运行 lint、typecheck、test、build，并对域名做可用性检查。

# Task Dependencies
- Task 2 depends on Task 1.
- Task 3 depends on Task 2.
- Task 4 depends on Task 3.
- Task 5 depends on Task 4.
- Task 6 depends on Task 5.
- Task 7 depends on Task 6.
- Task 8 depends on Task 1 through Task 7.
- Task 9 depends on Task 1 and Task 8.
- Task 10 depends on Task 1 through Task 9.
- Task 11 depends on Task 2, Task 3, and Task 10.
- Task 12 depends on Task 11.
- Task 13 depends on Task 12.
- Task 14 depends on Task 10 and Task 13.
- Task 15 depends on Task 14.
