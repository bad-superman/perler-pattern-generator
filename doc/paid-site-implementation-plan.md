# 付费站专属链接与 AI 次数控制实施计划

## 目标

- 保持现有免费站功能和部署不受影响。
- 同一仓库、同一 `main` 代码线部署免费站和付费站。
- 量化、AI provider、提示词、编辑、导出和图库代码全部复用。
- 付费站通过不可猜测的专属链接访问 AI 生图。
- AI 请求成功扣减一次；失败释放预占额度；额度为零时阻止请求并提示。
- 提供管理员创建链接、追加额度、禁用/启用链接和查看流水的能力。

## 部署模型

- 免费 Pages 项目：`VITE_SITE_MODE=free`、`SITE_MODE=free`。
- 付费 Pages 项目：`VITE_SITE_MODE=pro`、`SITE_MODE=pro`。
- 两个项目连接同一 Git 仓库和生产分支。
- 免费站继续使用 `GALLERY_DB`；付费站增加独立的 `PAID_DB`。
- `ADMIN_TOKEN`、AI API Key 只配置为服务端 Secret。

## 实施阶段

### 1. 站点模式

- 新增前端和服务端站点模式配置。
- 免费站继续调用 `/api/agnes/generate`。
- 付费站调用 `/api/pro/generate`。
- 付费站每次请求固定生成一张候选图，一次成功请求扣一次额度。

### 2. 数据层

- 在独立的 `migrations-paid` 目录新增 `access_passes`、`generation_jobs`、`credit_ledger` 表。
- Token 只存 SHA-256 哈希，明文只在创建时返回一次。
- 通过条件更新预占额度，防止最后一次额度被并发消费。
- 使用任务状态保证确认扣费和失败释放均幂等。

### 3. API

- `POST /api/access/verify`：验证专属链接并返回余额。
- `POST /api/pro/generate`：鉴权、预占、调用共享 AI、确认或释放额度。
- `GET/POST /api/admin/passes`：列表和创建链接。
- `GET/PATCH /api/admin/passes/:id`：详情、追加额度、启停链接。

### 4. 前端

- `/access/:token` 验证后将 Token 保存到 `sessionStorage`，并从地址栏移除。
- 付费站展示余额、过期/禁用/耗尽状态。
- AI 成功后刷新余额；失败提示“本次未扣次数”。
- 量化、编辑和导出不消耗次数。
- `/admin/access` 提供专属链接管理界面。

### 5. 测试与上线门槛

- Token、额度服务和并发场景单元测试。
- 免费与付费 API 集成测试。
- 免费、付费两种模式均通过 TypeScript 构建。
- ESLint 和现有测试全部通过。
- 验证成功一次只扣一次、失败不扣、重复请求不重复扣、零余额被阻止。
- 补充 Cloudflare 双项目、D1 migration、Binding 和 Secret 部署说明。

## 验收清单

- [x] 免费站现有功能无回归。
- [x] 付费站没有有效专属链接时不能调用 AI。
- [x] 有效链接可查看剩余次数。
- [x] AI 成功后余额减一。
- [x] AI 失败后余额不变。
- [x] 并发请求不能透支额度。
- [x] 相同幂等键不能重复扣费。
- [x] 次数为零时返回明确错误并禁用生成入口。
- [x] 管理员可创建、查询、追加额度和启停链接。
- [x] 数据库有完整额度流水和任务记录。
- [x] 免费和付费站可由现有 CI/CD 分别部署。
