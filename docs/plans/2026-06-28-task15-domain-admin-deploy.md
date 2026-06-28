# Task15 Domain And Admin Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configure the production main domain and admin domain entry points for the ads TVC app.

**Architecture:** Keep the FastAPI backend on port 9898 and allow both production origins in CORS. Serve one Vite build through Nginx, route `/api` and `/health` to the backend, and let the frontend switch the root page based on hostname.

**Tech Stack:** FastAPI, Pydantic Settings, React, Vite, Vitest, Nginx.

---

### Task 1: Backend Domain Configuration

**Files:**
- Modify: `.env.example`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_core_units.py`

**Steps:**
1. Add `https://lens-rhyme.tensorbytes.com` and `https://admin.lens-rhyme.tensorbytes.com` to the example `CORS_ORIGINS`.
2. Add both production origins to the `Settings.cors_origins` default.
3. Extend the settings test to assert the production origins are present by default.

### Task 2: Frontend Admin Host Entry

**Files:**
- Create: `frontend/src/routes/AdminHomePage.tsx`
- Create: `frontend/src/routes/deploymentHosts.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/routes/AdminHomePage.test.tsx`

**Steps:**
1. Implement admin hostname detection with configurable `VITE_ADMIN_APP_HOST`.
2. Render the admin entry page for `/` when the hostname is `admin.lens-rhyme.tensorbytes.com`.
3. Keep the main project creation page for the main domain and local development.
4. Cover host detection and admin page rendering with Vitest.

### Task 3: Deployment Documentation

**Files:**
- Create: `deploy/nginx/lens-rhyme.conf`
- Modify: `README.md`
- Modify: `.trae/specs/generate-ad-tvc-site/tasks.md`
- Modify: `.trae/specs/generate-ad-tvc-site/checklist.md`

**Steps:**
1. Add an Nginx reverse proxy example for both domains.
2. Document DNS, build, backend startup, Nginx enablement, and health checks.
3. Record `nslookup` and `curl` verification outcomes.
4. Mark Task15 and its checklist items complete.

### Task 4: Verification

**Commands:**
```bash
cd backend && .venv/bin/pytest && .venv/bin/python -m compileall app
cd frontend && npm run lint && npm run typecheck && npm run test && npm run build
nslookup lens-rhyme.tensorbytes.com
nslookup admin.lens-rhyme.tensorbytes.com
curl -I https://lens-rhyme.tensorbytes.com/health
curl -I https://admin.lens-rhyme.tensorbytes.com/health
```

**Cleanup:**
- Remove generated `frontend/dist` after build verification.
