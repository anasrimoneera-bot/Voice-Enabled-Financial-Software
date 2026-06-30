# 🎙️ 语音记账 · 财务工具

通过**语音**快速录入收支的网页记账应用，可直接部署到 **app.b2bsxlj.com**。

## 功能

- **语音录入**：点击麦克风说出「午餐 35 元」「收到工资 8000 元」「打车 22 块」，自动识别**金额**、**项目**与**收入/支出**类型。
- **手动录入**：不方便说话时可手动添加、编辑记录（兜底）。
- **收支概览**：实时统计收入、支出、结余。
- **筛选与删除**：按收入 / 支出筛选，单条删除。
- **本地存储**：数据保存在浏览器 `localStorage`，无需后端、无需登录。
- **PWA**：可「添加到主屏幕」，像 App 一样使用。

## 技术说明

- 纯静态前端（HTML / CSS / 原生 JS），**无构建步骤、无后端依赖**，可托管在任意静态服务器。
- 语音识别使用浏览器原生 **Web Speech API**（`SpeechRecognition`），支持中文（`zh-CN`）。
  - ⚠️ 该 API 需在 **HTTPS** 下运行才能访问麦克风（你的域名已备案并上线，配好 SSL 即可）。
  - 浏览器兼容：推荐 **Chrome / Edge**（含安卓 Chrome）。Safari 支持有限，iOS 上可使用手动录入。

## 文件结构

```
index.html              页面结构
style.css               样式
app.js                  语音识别、解析、存储、渲染逻辑
manifest.webmanifest    PWA 配置
deploy/nginx.conf       Nginx 部署示例（app.b2bsxlj.com）
```

## 部署到 app.b2bsxlj.com

由于是纯静态站点，部署非常简单。下面以 Nginx 为例：

1. **添加 DNS 解析**：在 B2BSXLJ.COM 的域名控制台为子域名 `app` 添加一条 **A 记录**（指向服务器公网 IP）或 **CNAME 记录**（指向你的静态托管地址）。
2. **上传文件**：将 `index.html`、`style.css`、`app.js`、`manifest.webmanifest` 上传到服务器目录，如 `/var/www/app.b2bsxlj.com`。
3. **配置 HTTPS**：为 `app.b2bsxlj.com` 申请 SSL 证书（Let's Encrypt / 阿里云 / 腾讯云均可），语音功能依赖 HTTPS。
4. **配置 Nginx**：参考 `deploy/nginx.conf`，放入 `/etc/nginx/conf.d/` 后执行：
   ```bash
   nginx -t && nginx -s reload
   ```
5. 打开 **https://app.b2bsxlj.com** ，允许麦克风权限即可开始语音记账。

> 也可使用 Vercel / Netlify / 阿里云 OSS / 腾讯云 COS 等静态托管，将自定义域名绑定为 `app.b2bsxlj.com` 并开启 HTTPS。

## 本地预览

```bash
# 启动本地静态服务器（http://localhost 下也可使用麦克风）
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

## 语音指令示例

| 说出 | 识别结果 |
| --- | --- |
| 午餐 35 元 | 支出 · 餐饮 · ¥35.00 |
| 打车二十二块 | 支出 · 打车 · ¥22.00 |
| 收到工资 8000 元 | 收入 · 工资 · ¥8000.00 |
| 报销 一千二 | 收入 · 报销 · ¥1200.00 |

收入关键词：收入、工资、薪水、进账、收到、报销、红包、退款、奖金、利息、分红等；其余默认计为支出。
