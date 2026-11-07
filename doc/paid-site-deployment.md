# 免费站与付费站 Cloudflare 部署说明

## Pages 项目

两个 Cloudflare Pages 项目连接同一仓库和同一生产分支，构建命令均为 `npm run build`，输出目录均为 `dist`。

免费站变量：

```text
VITE_SITE_MODE=free
SITE_MODE=free
```

付费站变量：

```text
VITE_SITE_MODE=pro
SITE_MODE=pro
```

`VITE_*` 会进入浏览器资源，不能写入密钥。`SITE_MODE`、AI Key 和 `ADMIN_TOKEN` 只配置在 Pages Functions 环境。

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
AI_DEFAULT_API_KEY
AI_FALLBACK_API_KEY（如启用）
ADMIN_TOKEN
```

`PAID_DB` 必须绑定独立 D1 数据库。不要让免费站绑定生产付费库。

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

1. 打开 `/admin/access` 创建 2 次测试链接。
2. 使用专属链接进入，确认地址栏中的 Token 被立即移除。
3. 成功生成一次，确认余额从 2 变为 1。
4. 使用错误 AI 配置模拟失败，确认余额仍为 1。
5. 成功生成第二次，确认余额为 0 且按钮禁用。
6. 再次调用生成接口，确认返回 `402 CREDITS_EXHAUSTED`。
7. 重复提交相同 `Idempotency-Key`，确认不会重复扣费。
8. 在管理后台追加次数、停用和恢复链接。
9. 点击“清理超时预占”，确认超过 10 分钟的中断任务被释放。

## 回滚

前端或 Functions 出现问题时，在对应 Pages 项目中回滚到上一部署。两个站点是独立项目，可以单独回滚。

数据库 migration 只新增表和索引，不删除现有数据。应用回滚后保留付费表，修复版本重新发布即可。
