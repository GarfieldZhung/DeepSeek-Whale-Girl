# 安全策略

## 支持范围

仅维护最新发布版本。安全问题请不要先建立公开 Issue；请通过 GitHub Security Advisory 的 **Report a vulnerability** 私下报告，并说明受影响版本、复现步骤和影响范围。

## 安全边界

- 应用不监听任何本地或公网端口，不提供 HTTP 接收服务。
- 网络请求只发往 DeepSeek 官方 HTTPS API：`/user/balance` 与 `/chat/completions`。
- API Key 仅在 Electron 主进程使用，通过系统 `safeStorage` 加密后写入用户数据目录；安全存储不可用时拒绝保存。
- 渲染进程启用 `sandbox` 和 `contextIsolation`，关闭 Node.js 集成。
- 禁止新窗口、外部导航和浏览器权限请求；IPC 调用校验发送页面来源。
- 问题最长 1200 字，模型响应读取上限 1 MiB、展示上限 2400 字；单次只允许一个问答请求并设置超时与频率限制。
- 问题和回复不落盘；本地只保存用量汇总、余额历史和加密配置。

## 发布者注意事项

不要提交 `.env`、`config.json`、`usage.json`、日志、构建产物或任何真实 API Key。发布前执行：

```powershell
npm ci
npm test
npm run prepublish:check
```

已经提交到 Git 历史的密钥必须立即在服务端撤销并重新生成；仅删除文件或后续提交并不能使旧密钥失效。

