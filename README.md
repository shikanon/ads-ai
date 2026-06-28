# 广告 TVC 制作网站

最小可运行全栈骨架，包含 React/Vite 前端与 FastAPI 后端。

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

## 验证命令

```bash
cd backend && python3 -m compileall app
cd frontend && npm install && npm run build
```
