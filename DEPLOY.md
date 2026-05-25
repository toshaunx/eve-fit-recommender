# 部署上线

这个 MVP 是一个轻量 Node.js 服务，适合先部署到 Railway 或 Render。当前版本不需要 EVE Workbench API Key，优先使用 `https://webapi.eveworkbench.com` 的公开 Fit 数据。

## 推荐路线

1. 把项目放到 GitHub 仓库。
2. 用 Railway 或 Render 从 GitHub 导入项目。
3. 设置启动命令：

```bash
npm start
```

4. 设置端口：平台会自动注入 `PORT` 环境变量，代码会读取它。
5. 部署后访问平台提供的临时域名。
6. 买域名后，在平台里添加 Custom Domain。
7. 到域名 DNS 里按平台提示添加 CNAME 或 A 记录。

## Railway

Railway 支持给服务添加自定义域名，并自动签发 SSL 证书。添加域名后，Railway 会给出需要配置的 DNS 记录。

## Render

Render 的 Web Service 适合直接跑这个 Node 服务。Render 支持自定义域名和自动 TLS 证书。

## 国内访问和备案

如果服务器放在中国大陆，通常需要先做 ICP 备案。若先部署在海外平台，可以先用海外域名跑验证，但国内访问速度和稳定性不一定理想。

这个项目早期建议：

- 先海外部署验证用户和内容方向。
- 有稳定访问和付费意愿后，再考虑国内云服务器、ICP备案和微信/支付宝收款。

## 上线后必须补的页面

- `/about`：说明这是 EVE 玩家工具，非 CCP 官方产品。
- `/privacy`：说明不保存 EVE 账号密码，只访问公开 Fit 数据。
- `/terms`：说明推荐仅供参考，复制前需要用户自行确认技能、价格和版本。

## 运维检查

健康检查地址：

```text
/health
```

推荐接口：

```text
/api/recommend?activity=exploration&ship=Heron&clone=alpha&budget=low
```
