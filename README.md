# EVE Fit 推荐器 MVP

一个轻量网页原型：用户选择玩法、账号、预算和船型，网站返回 1-3 套可复制进游戏的 EFT Fit，并收集“好用 / 太贵 / 装不上 / 过期”等反馈。

## 运行

```bash
npm start
```

默认地址：

```text
http://127.0.0.1:4173
```

## Workbench 数据源说明

当前版本优先使用 EVE Workbench 网站前端同源的公开 Web API：

- `/Fit/GetLatest`
- `/Fit/GetNewestFits`
- `/Fit/GetPopularFits`
- `/Fit/GetFitsByTag`
- `/Fit/GetEftById`

这条路径不需要 API Key，可以直接获取公开 Fit 列表和 EFT 文本，适合 MVP 验证。

## Workbench 官方 API 说明

EVE Workbench 的 Fit API 需要 `X-API-KEY`。OpenAPI 文档显示：

- `/v1/fits/list`：获取当前 API Key 对应玩家上传的 fits
- `/v1/fits/{fitId}`：按 fit id 获取公开 fit
- `/v1/fits/{fitId}/eft`：按 fit id 获取 EFT 文本

所以官方 API 不能直接当“全站公开 fit 搜索 API”。如果后续想维护自己的精选仓库，可以：

1. 注册/使用一个 EVE Workbench 专用账号。
2. 把我们认可的 fit 上传到这个账号。
3. 设置环境变量 `EVE_WORKBENCH_API_KEY`。
4. 本站通过 `/v1/fits/list` 拉取这个账号的 fit，做玩法/预算/Alpha 筛选和中文推荐。

示例：

```bash
EVE_WORKBENCH_API_KEY=你的_key npm start
```

没有 API Key 时，项目会返回内置样例，方便验证页面、复制和反馈闭环。
