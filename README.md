# CloudMail Web

基于 React + TypeScript + Vite 的纯 Web 版 CloudMail 管理工具。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址是 `http://localhost:1420/`。

## 功能说明

- 支持邮件查询
- 支持批量生成并添加用户
- 支持多域名、多 Token 配置切换
- 请求体格式保持不变，只切换目标域名和 `Authorization` Token

## Linux 一键部署

仓库根目录提供了 `cloudmail-oneclick.sh`，适合在 Linux 服务器上一键拉取代码、安装 Node/Nginx、构建前端并发布静态站点。

```bash
chmod +x ./cloudmail-oneclick.sh
bash ./cloudmail-oneclick.sh
```
