# 拼豆图纸生成器 (Perler Pattern Generator)

一个 React 应用，可将上传的图片转换为可打印的拼豆（perler bead）图纸。图像量化在浏览器端通过 Canvas API 完成；**AI 生成** 模式通过 Agnes API 代理（本地 Node 或 Cloudflare Pages Function）调用大模型。

## 本地开发

```bash
npm install          # 安装依赖
cp .env.example .env # 配置 Agnes API Key（AI 生成功能需要）
npm run dev:proxy    # 终端 1：启动 Agnes API 代理（默认 8787 端口）
npm run dev          # 终端 2：启动开发服务器（默认 http://127.0.0.1:5173）
npm run lint         # 运行 ESLint
npm run build        # 类型检查（tsc -b）并构建生产产物到 dist/
npm run preview      # 本地预览生产构建
```

### AI 生成拼豆图

侧栏切换到 **AI 生成** 模式，上传参考图并选择风格，点击「AI 生成拼豆图」。流程为：

1. 前端调用本地代理 `/api/agnes/generate`
2. 代理转发至 [Agnes Image 2.1 Flash](https://agnes-ai.com/doc/agnes-image-21-flash) 做图生图
3. 返回的图片再走现有 Canvas 量化流程，输出可打印拼豆图纸

环境变量见 [`.env.example`](.env.example)：

- `AGNES_API_KEY` — Agnes API 密钥（必填，仅存在于服务端）
- `AGNES_API_BASE` — 默认 `https://apihub.agnes-ai.com/v1/images/generations`
- `AGNES_PROXY_PORT` — 代理端口，默认 `8787`

**本地转换** 模式行为不变：上传后直接在浏览器端量化，无需 API Key。

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
| `AGNES_API_KEY` | Encrypted | Agnes API 密钥 |
| `AGNES_API_BASE` | Plaintext（可选） | 默认 `https://apihub.agnes-ai.com/v1/images/generations` |
| `AGNES_MODEL` | Plaintext（可选） | 默认 `agnes-image-2.1-flash` |

### 4. 部署与验证

保存后 CF 会自动构建部署。访问 `https://<project>.pages.dev`：

- **本地转换**：上传图片即可，无需 Key
- **AI 生成**：上传参考图 → 选风格 → 生成；DevTools 中 `POST /api/agnes/generate` 应返回 200

可选绑定自定义域名：Pages 项目 → **Custom domains**。

### 5. 本地模拟 Pages 生产环境

```bash
cp .dev.vars.example .dev.vars   # 填入 AGNES_API_KEY
npm run pages:dev                # 构建并用 wrangler 本地跑 Pages + Functions
```

### 注意事项

- AI 生成约需 30–90 秒；若遇超时，检查 CF Workers 时长限制，必要时升级 Paid 计划
- 只需 **本地转换** 时，可不配置 `AGNES_API_KEY`，AI 模式会报错但不影响本地模式

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
