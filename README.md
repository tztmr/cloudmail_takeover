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

## Docker 一键部署

仓库根目录提供了一个脚本：

- `cloudmail-oneclick.sh`：首次部署和后续管理都用它，支持部署、查看状态、日志、重建、更新、申请 SSL 证书和卸载

```bash
chmod +x ./cloudmail-oneclick.sh
bash ./cloudmail-oneclick.sh
```

默认策略是把容器映射到 `127.0.0.1:18080`，这样不会直接占用宿主机 `443`。如果同一台服务器上已经有 Nginx、Caddy 或宝塔在处理 HTTPS，只需要把现有 `443` 反向代理到本机这个端口即可。

常用管理命令：

```bash
bash ./cloudmail-oneclick.sh
bash ./cloudmail-oneclick.sh status
bash ./cloudmail-oneclick.sh logs
bash ./cloudmail-oneclick.sh rebuild
bash ./cloudmail-oneclick.sh ssl
```

申请证书前提：

- 域名已经解析到当前服务器公网 IP
- 服务器 `80` 和 `443` 可访问
- 脚本会自动安装宿主机 `Nginx` 和 `Certbot`
- 证书申请成功后，宿主机 `Nginx` 会接管 `80/443`，再反向代理到容器映射端口
