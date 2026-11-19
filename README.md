# 拼豆图纸生成器 (Perler Pattern Generator)

一个 React 应用，可将上传的图片转换为可打印的拼豆图纸。图像量化在浏览器端通过 Canvas API 完成，默认输出 **MARD 221 国产色号**（如 `A01`、`B12`），侧栏可切换 **Hama** 色卡；HEX 为社区近似值，购料请以实物编号为准。 **AI 生成** 模式通过服务端代理（本地 Node 或 Cloudflare Pages Function）调用大模型。

仓库里还包含一套纯本地的[微信 / 小红书小程序](#小程序微信--小红书)客户端，复用同一套量化算法。

## 本地开发

```bash
npm install          # 安装依赖
cp .env.example .env # 配置 AI_DEFAULT_API_KEY（AI 生成功能需要）
npm run dev:proxy    # 终端 1：启动 AI API 代理（默认 8787 端口）
npm run dev          # 终端 2：启动开发服务器（默认 http://127.0.0.1:5173）
npm run lint         # 运行 ESLint
npm run build        # 类型检查（tsc -b）并构建生产产物到 dist/
npm run preview      # 本地预览生产构建
```

### AI 生成拼豆图

侧栏切换到 **AI 生成** 模式，上传参考图并选择风格，点击「AI 生成拼豆图」。流程为：

1. 前端调用本地代理 `/api/agnes/generate`
2. 代理默认通过 ModelMux `/v1/responses` 调用 `gpt-5.6-sol` 的 `image_generation` 工具做图生图
3. 返回的图片再走现有 Canvas 量化流程，输出可打印拼豆图纸

环境变量见 [`.env.example`](.env.example)：

- `AI_DEFAULT_API_KEY` — 默认模型 API 密钥（必填，仅存在于服务端）
- `AI_DEFAULT_PROVIDER` — 默认 `openai-responses`
- `AI_DEFAULT_API_BASE` — 默认 `https://modelmux.io/v1`
- `AI_DEFAULT_MODEL` — 默认 `gpt-5.6-sol`
- `AI_FALLBACK_MODEL` — 备用模型（如 `agnes-image-2.5-flash`）；设置后默认模型任何失败都会自动用备用模型重试一次，留空则不启用
- `AGNES_PROXY_PORT` — 代理端口，默认 `8787`

默认模型与备用模型都可以通过 `AI_DEFAULT_*` / `AI_FALLBACK_*` 独立配置 provider、Key、地址、模型和超时，详见 [`.env.example`](.env.example)。服务端代码在 [`server/ai/`](server/ai/)，本地代理与 Cloudflare Pages Function 共用。`GET /api/agnes/generate` 会返回当前生效的默认/备用模型（不含密钥），可用于排查配置。

**本地转换** 模式行为不变：上传后直接在浏览器端量化，无需 API Key。

## 小程序（微信 / 小红书）

小程序是纯本地版本：选图或创建空白画板 → 本机量化 → 预览、编辑、导出 PNG。图片不上传，不需要登录、服务器和 API Key，也不包含 AI 生成、图库和付费功能。

### 目录

| 路径 | 说明 |
|---|---|
| [`miniapp/`](miniapp/) | Taro 4 + React 18 工程，同一套页面代码构建微信小程序和小红书小程序 |
| [`miniapp-xhs-widget/`](miniapp-xhs-widget/) | 小红书个人小组件版，使用原生 `xhs` API 的独立工程，说明见其 [README](miniapp-xhs-widget/README.md) |
| [`src/miniapp/`](src/miniapp/) | 两端共用的核心（量化结果 → 图纸快照）和平台接口类型，设计边界见其 [README](src/miniapp/README.md) |
| [`src/quantize/rgba.ts`](src/quantize/rgba.ts) | 不依赖 DOM 的 RGBA 量化入口，Web 与小程序共用 |

平台 API 的封装集中在 `miniapp/src/platform/`（选图、Canvas 解码、PNG 导出、保存相册）；画布绘制与手势在 `miniapp/src/components/PatternCanvas.tsx`，缩放 / 平移的纯计算在 `miniapp/src/pattern-view/`。

### 功能

- 从相册或拍照选图，或创建空白画板
- 图纸尺寸 32–104 格，方形或原比例；最多 4–24 色；MARD 221 色卡
- 预览：图纸完整居中显示，双指缩放、单指拖动，支持镜像预览
- 编辑：画布占满屏幕，画笔 / 橡皮可点可拖，移动工具平移，撤销 / 重做（30 步）；选色弹窗先列图纸上的颜色，再列全部 221 色
- 导出 PNG 到相册：四周带从 0 开始的行列索引，从左上角起每 10 格一条红色辅助线，附色号用量清单

### 构建

```bash
cd miniapp
npm install --include=optional
npm run typecheck
npm run build:weapp   # 微信小程序 → miniapp/dist
npm run build:xhs     # 小红书小程序 → miniapp/dist-xhs
```

开发时可用 `npm run dev:weapp` / `npm run dev:xhs` 监听构建。小红书小组件在仓库根目录执行 `npm run build:xhs-widget`（依赖 `miniapp/node_modules` 里的 esbuild，需先安装 `miniapp/` 的依赖），产物在 `miniapp-xhs-widget/dist`。

### 导入开发者工具

- **微信**：在微信开发者工具中导入 `miniapp/` 目录（`project.config.json` 的 `miniprogramRoot` 指向 `dist/`），并把 `appid` 换成自己的。
- **小红书**：在小红书 IDE 中导入 `miniapp/dist-xhs/`。

两端产物目录是分开的，不要把小红书产物写进 `dist/`。

### 注意事项

- **保持「将 JS 编译成 ES5」关闭**（`miniapp/project.config.json` 中 `"es6": false`）。Taro 的产物已经是 ES5；开启后开发者工具会再编译一次，iOS 真机调试会在启动时报 `Maximum call stack size exceeded`，随后页面报 `undefined is not an object (evaluating 'd.mw.trigger')`。
- **画布尺寸只能用 `style` 设置**。页面使用旧版 `canvasId` 画布（小红书的 Taro 模板不支持 Canvas 2D），`width` / `height` 属性不会生效，未设置样式时画布是默认的 300×150，超出部分画不上也读不到。
- **弹层打开时画布会被隐藏**。旧版画布是原生组件，可能盖在页面弹层之上，所以选色弹窗和「更多」抽屉打开期间画布显示为占位，关闭后重绘。
- **导出画布有尺寸上限**。导出图按设备像素比等比缩小绘制，使画布长边不超过 3600 物理像素。

## 部署（Cloudflare Pages，推荐）

静态前端与 AI 代理在同一次 Pages 部署中发布：`dist/` 托管页面，[`functions/api/agnes/generate.js`](functions/api/agnes/generate.js) 提供 `/api/agnes/generate`。

### 1. 连接 Git 仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择本仓库，Production branch 设为 `main`

### 2. 构建设置

| 项 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |

### 3. 环境变量

在 Pages 项目 → **Settings** → **Environment variables** 中配置（Production 必填）：

| 变量名 | 类型 | 说明 |
|---|---|---|
| `AI_DEFAULT_API_KEY` | Encrypted | 默认模型 API 密钥（必填） |
| `AI_FALLBACK_MODEL` | Plaintext（可选） | 备用模型，如 `agnes-image-2.5-flash`；默认模型失败时自动重试一次，留空不启用 |
| `AI_DEFAULT_*` / `AI_FALLBACK_*` | 可选 | 按需独立配置 `PROVIDER`、`API_KEY`、`API_BASE`、`MODEL`、`TIMEOUT_MS`，见 `.env.example` |
| `ADMIN_GALLERY_TOKEN` | Encrypted | 图库审核口令，配在 Pages 的 Preview 环境。后台地址是 `/admin` |

Preview 环境的图库数据库是 D1 `perler-gallery-preview`，绑定名 `GALLERY_DB`，已写在 `wrangler.toml`。表已经建好。本地 `npm run dev` 会把图库记在 `.wrangler/gallery-dev.json`，不需要连这块远程库。

### 4. 部署与验证

保存后 CF 会自动构建部署。访问 `https://<project>.pages.dev`：

- **本地转换**：上传图片即可，无需 Key
- **AI 生成**：上传参考图 → 选风格 → 生成；DevTools 中 `POST /api/agnes/generate` 应返回 200

部署后访问 `GET /api/agnes/generate` 可确认两组模型是否按预期生效。

可选绑定自定义域名：Pages 项目 → **Custom domains**。

### 5. 本地模拟 Pages 生产环境

```bash
cp .dev.vars.example .dev.vars   # 填入 AI_DEFAULT_API_KEY
npm run pages:dev                # 构建并用 wrangler 本地跑 Pages + Functions
```

### 6. 查看 Functions 日志（排查 AI 调用问题）

`/api/agnes/generate` 每次请求都会打结构化日志，key 只显示末 4 位：

```
[ai] request count=1 size=1K ratio=3:4 image=312KB effect=no default=gpt-5.6-sol key=****ab12 fallback=none
[ai] default gpt-5.6-sol key=****ab12 status=200 ok 28.4s
```

两种查看方式（Pages Functions 的日志是实时流，不会持久保存，需要先开着再复现）：

- Dashboard：Pages 项目 → **Deployments** → 点开某次部署 → **Functions** 标签 → **Begin log stream**
- 命令行：`npx wrangler pages deployment tail --project-name perler-pattern-generator`（需先 `npx wrangler login`；加 `--environment preview` 看预览环境）

接口响应里也带 `attempts` 数组（每次 provider 调用的 `provider / model / ok / status / reason / durationMs`），成功和失败都有，前端据此上报 PostHog 事件 `ai_provider_attempt`，可按 `provider` 维度统计成功率和失败原因。

### 注意事项

- AI 生成约需 30–90 秒；若遇超时，检查 CF Workers 时长限制，必要时升级 Paid 计划
- 只需 **本地转换** 时，可不配置 `AI_DEFAULT_API_KEY`，AI 模式会报错但不影响本地模式

## 免费站与付费站

生产环境使用两个独立的 Cloudflare Pages 项目，共用同一套量化、AI、生图后处理、编辑和导出代码：

- 免费站：<https://perler-pattern-generator-37c.pages.dev>
- 付费站：<https://perler-pattern-generator-pro.pages.dev>

两个项目都监听 `main` 分支，但使用不同的构建配置：

| 项目 | 构建命令 | Wrangler 配置 | 站点模式 |
|---|---|---|---|
| 免费站 | `npm run build` | `wrangler.toml` | `free` |
| 付费站 | `cp wrangler.paid.toml wrangler.toml && VITE_SITE_MODE=pro npm run build` | `wrangler.paid.toml` | `pro` |

付费站使用独立的 D1 数据库 `perler-paid-production`，Binding 名为 `PAID_DB`。数据库迁移文件位于 [`migrations-paid/`](migrations-paid/)，不要把生产 `PAID_DB` 绑定到免费站。

付费项目的 Production 环境还需要配置以下加密变量：

| 变量名 | 说明 |
|---|---|
| `AI_DEFAULT_API_KEY` | ModelMux 或默认 AI Provider 的 API Key |
| `ADMIN_TOKEN` | 专属链接管理后台及管理接口口令 |
| `AI_FALLBACK_API_KEY` | 可选，备用 AI Provider 的 API Key |
| `PAID_SITE_ORIGIN` | 可选，生成专属链接时使用的付费站自有 Origin；未配置时使用管理接口当前域名 |

更完整的双站点部署和回滚说明见 [`doc/paid-site-deployment.md`](doc/paid-site-deployment.md)。

### 生成付费专属链接

#### 使用管理后台

访问付费站的 `/admin/access`，例如：

```text
https://perler-pattern-generator-pro.pages.dev/admin/access
```

输入 Production 环境中的 `ADMIN_TOKEN` 后，可以：

- 创建专属链接并设置备注、生成次数和有效期
- 查看剩余次数、预占次数、生成任务和额度流水
- 追加次数
- 停用或恢复链接
- 清理超过 10 分钟的异常预占

Token 明文只在创建时返回一次，应立即复制并通过安全渠道交付给客户。数据库只保存 Token 的 SHA-256 哈希。

#### 使用管理接口

创建一个永久有效、可成功生成 10 次的专属链接：

```bash
curl -X POST \
  'https://perler-pattern-generator-pro.pages.dev/api/admin/passes' \
  -H 'Authorization: Bearer <ADMIN_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data '{
    "label": "客户名称或订单号",
    "totalCredits": 10,
    "expiresAt": null
  }'
```

`expiresAt` 使用 Unix 毫秒时间戳，`null` 表示永久有效。响应中的 `url` 就是需要交付给客户的完整专属链接：

```json
{
  "pass": {
    "id": "pass_xxx",
    "label": "客户名称或订单号",
    "totalCredits": 10,
    "remainingCredits": 10,
    "status": "active"
  },
  "token": "仅本次响应返回的明文Token",
  "url": "https://perler-pattern-generator-pro.pages.dev/access/专属Token"
}
```

查询全部专属链接：

```bash
curl \
  'https://perler-pattern-generator-pro.pages.dev/api/admin/passes' \
  -H 'Authorization: Bearer <ADMIN_TOKEN>'
```

订单系统可以在支付成功回调中调用创建接口，并将响应中的 `url` 自动发送给客户。`ADMIN_TOKEN` 只能保存在服务端 Secret 中，禁止写入浏览器代码、日志或 Git 仓库。

### 次数扣减规则

- AI 请求开始时先预占 1 次额度，避免并发透支。
- AI 成功返回图片后正式扣减 1 次。
- AI 配置错误、网络失败或 Provider 失败时释放预占，不扣次数。
- 本地量化、图纸编辑和导出不消耗次数。
- 剩余次数为 0 时，接口返回 `402 CREDITS_EXHAUSTED`，前端禁用生成入口并显示明确提示。
- `Idempotency-Key` 用于避免同一请求因重复提交而重复扣费。

## 部署（使用 Nginx）

本项目构建后是一组静态文件，使用 Nginx 托管即可。以下流程以 Ubuntu/Debian 为例。

### 1. 构建生产产物

在项目目录下执行：

```bash
npm install
npm run build
```

构建完成后，所有静态文件位于 `dist/` 目录。

### 2. 安装 Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### 3. 部署静态文件

将 `dist/` 中的内容拷贝到 Web 根目录（例如 `/var/www/perler`）：

```bash
sudo mkdir -p /var/www/perler
sudo cp -r dist/* /var/www/perler/
sudo chown -R www-data:www-data /var/www/perler
```

### 4. 配置 Nginx

创建站点配置文件 `/etc/nginx/sites-available/perler`：

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 替换为你的域名或服务器 IP

    root /var/www/perler;
    index index.html;

    # 单页应用（SPA）路由回退：未匹配到的路径都返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 对带哈希的静态资源做长期缓存
    location ~* \.(?:js|css|woff2?|png|jpe?g|gif|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # 开启 gzip 压缩
    gzip on;
    gzip_types text/css application/javascript image/svg+xml;
    gzip_min_length 1024;

    # AI 生成代理（需先启动 server/agnes-proxy.mjs）
    location /api/agnes/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_read_timeout 360s;
        client_max_body_size 10m;
    }
}
```

启用站点并重载 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/perler /etc/nginx/sites-enabled/
sudo nginx -t           # 校验配置语法
sudo systemctl reload nginx
```

完成后访问 `http://your-domain.com` 即可使用。

### 5.（可选）配置 HTTPS

推荐使用 [Certbot](https://certbot.eff.org/) 自动申请并配置 Let's Encrypt 证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot 会自动修改上面的 Nginx 配置以启用 443 端口，并设置证书自动续期。

### 更新部署

每次发布新版本时，重新构建并覆盖 Web 根目录即可：

```bash
npm run build
sudo cp -r dist/* /var/www/perler/
sudo systemctl reload nginx
```

## 技术栈

- React 19 + TypeScript + Vite
- Canvas API（图像量化与图纸生成，全部在浏览器端运行）
- html-to-image + file-saver（导出 PNG）
- Cloudflare Pages Functions（生产环境 AI 代理，见 `functions/api/agnes/generate.js`）
- Taro 4 + React 18（微信 / 小红书小程序，见 `miniapp/`）
