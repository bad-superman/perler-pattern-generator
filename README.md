# 拼豆图纸生成器 (Perler Pattern Generator)

一个纯前端的 React 应用，可将上传的图片转换为可打印的拼豆（perler bead）图纸。所有图像处理都在浏览器端通过 Canvas API 完成，**无需后端服务**，因此可以作为纯静态站点部署。

## 本地开发

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器（默认 http://127.0.0.1:5173）
npm run lint         # 运行 ESLint
npm run build        # 类型检查（tsc -b）并构建生产产物到 dist/
npm run preview      # 本地预览生产构建
```

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
