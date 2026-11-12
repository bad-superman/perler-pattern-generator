# 免费站与付费站 Cloudflare 部署说明

## Pages 项目

两个 Cloudflare Pages 项目连接同一仓库和同一生产分支，输出目录均为 `dist`。

- 免费站构建命令：`npm run build`，使用仓库根目录的 `wrangler.toml`。
- 付费站构建命令：`cp wrangler.paid.toml wrangler.toml && VITE_SITE_MODE=pro npm run build`，使用独立的生产付费库配置。

这样免费站不会获得 `PAID_DB` Binding，付费站也不会误用免费站的图库数据库。

免费站变量：

```text
VITE_SITE_MODE=free
SITE_MODE=free
```

付费站变量：

```text
VITE_SITE_MODE=pro
SITE_MODE=pro
PAID_SITE_ORIGIN=https://你的付费站自有域名
```

`PAID_SITE_ORIGIN` 用于管理员创建专属链接时拼接 `/access/:token`。可填写完整 Origin（推荐，例如 `https://pro.example.com`），也可只填写域名；未配置或留空时继续使用当前管理接口请求的 Origin。

`VITE_*` 会进入浏览器资源，不能写入密钥。`SITE_MODE`、`PAID_SITE_ORIGIN`、AI Key 和 `ADMIN_TOKEN` 只配置在 Pages Functions 环境。

## Binding 与 Secret

免费站保留：

```text
GALLERY_DB
AI_DEFAULT_API_KEY
AI_FALLBACK_API_KEY（如启用）
ADMIN_TOKEN
```

付费站配置：

```text
GALLERY_DB（需要图库时）
PAID_DB
PAID_SITE_ORIGIN（可选，专属链接使用的自有域名）
AI_DEFAULT_API_KEY
AI_FALLBACK_API_KEY（如启用）
ADMIN_TOKEN
```

`PAID_DB` 必须绑定独立 D1 数据库。不要让免费站绑定生产付费库。

功能分支 `codex/paid-access` 的 Cloudflare Git Preview 有一项受主机名严格限制的兼容逻辑：在该 Preview 尚未配置 `PAID_DB` 时，临时使用 Preview `GALLERY_DB` 并以 `CREATE TABLE IF NOT EXISTS` 初始化付费表。该逻辑不会在其他 Preview、正式免费站或正式付费站启用；正式付费站仍必须配置独立 `PAID_DB`。

## 创建和迁移付费数据库

先在 Cloudflare 创建付费 D1 数据库，然后执行独立迁移目录：

```bash
npx wrangler d1 migrations apply <付费数据库名称> --remote --migrations-dir migrations-paid
```

迁移完成后，在付费 Pages 项目的 Production 和 Preview 环境分别添加 `PAID_DB` Binding。Preview 应使用独立测试数据库，避免测试链接消耗生产额度。

## 发布前检查

```bash
npm ci
VITE_SITE_MODE=free npm run build
VITE_SITE_MODE=pro npm run build
npm test
```

发布付费站后完成以下冒烟测试：

1. 打开 `/admin/access` 创建 2 次测试链接，确认链接使用 `PAID_SITE_ORIGIN`；清空该配置后确认回退到当前请求域名。
2. 不带专属链接直接打开付费站，确认本地转换、画板、编辑和导出可正常使用，点击 AI 生成时才提示需要专属链接。
3. 使用专属链接进入，确认地址栏中的 Token 被立即移除。
4. 成功生成一次，确认余额从 2 变为 1。
5. 使用错误 AI 配置模拟失败，确认余额仍为 1。
6. 成功生成第二次，确认余额为 0。
7. 再次调用生成接口，确认返回 `402 CREDITS_EXHAUSTED`。
8. 重复提交相同 `Idempotency-Key`，确认不会重复扣费。
9. 在管理后台追加次数、停用和恢复链接。
10. 点击“清理超时预占”，确认超过 10 分钟的中断任务被释放。

## 回滚

前端或 Functions 出现问题时，在对应 Pages 项目中回滚到上一部署。两个站点是独立项目，可以单独回滚。

数据库 migration 只新增表和索引，不删除现有数据。应用回滚后保留付费表，修复版本重新发布即可。
