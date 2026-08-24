# 小鲸鱼看板娘

一款 Windows 透明桌宠，以静态角色和低频轻微悬浮为主，提供 DeepSeek 余额查看、Token 费用统计和“小鲸鱼”人格化问答。

> [!IMPORTANT]
> 这是非官方社区项目，与 DeepSeek 无隶属、合作或背书关系。角色基础图由项目发起者提供，但原作者和再分发许可尚未核实；项目的 MIT License **不覆盖图片素材**。公开分发或商用前请先取得图片权利人的许可，详见[角色与素材声明](#角色与素材声明)。

## 功能

- 静态挂机：悬浮、荡秋千、玩游戏、看电影和跑步减肥五种待机图。
- 角色脚下按钮打开无箭头的漫画风问答卡；等待回答时显示本地碎碎念。
- 单击摸头并播放橡皮小鸭按压声；连续摸头五次触发咬手与冷却。
- 长按拖拽、完成吃饱、问答思考等独立状态素材。
- DeepSeek API 余额查询，以及问答产生的三桶 Token 用量与费用统计。
- 问题和回答不写入磁盘；仅保存余额历史、Token 汇总和加密配置。
- 不监听本地或公网端口，不包含网页状态检测或本地用量接收接口。

## 交互

| 操作 | 结果 |
| --- | --- |
| 单击角色 | 摸头 |
| 连续摸头 5 次 | 咬手并进入摸头冷却 |
| 左键双击角色 | 打开静态待机动作轮盘 |
| 长按角色 | 拖拽桌宠 |
| 右键角色 | 打开设置 |
| 点击角色脚下按钮 | 打开问答卡 |
| 点击右上角“余额” | 打开账单面板 |

## 安装与开发

环境要求：Windows 10/11、Node.js 22 和 npm。

```powershell
npm ci
npm start
```

右键角色，在设置中填入自己的 DeepSeek API Key。请勿把 Key 写进源码、Issue、截图或 GitHub Actions 日志。

```powershell
npm test
npm run prepublish:check
npm run pack
npm run dist
```

## 安全设计

- Electron 渲染进程启用 `sandbox` 与 `contextIsolation`，关闭 Node.js 集成。
- 禁止新窗口、外部导航及浏览器权限请求；IPC 校验调用页面来源。
- 仅向固定的 DeepSeek 官方 HTTPS API 发起余额和问答请求。
- API Key 使用操作系统 `safeStorage` 加密；不可用时拒绝明文保存。
- 问答设置长度、响应体、并发、频率和超时限制；模型输出以文本方式渲染。
- 应用不开放监听端口，因此无需配置入站防火墙规则。

安全报告流程和威胁边界见 [SECURITY.md](SECURITY.md)。这些措施用于降低风险，不代表软件绝对安全。

## 数据位置

应用数据保存在 Electron 用户数据目录：

- `config.json`：加密后的 API Key 与本地设置。
- `usage.json`：余额历史、Token 数量和估算费用，不含问题或回答正文。

可在设置页点击“数据目录”查看。两类文件均已加入 `.gitignore`，不得上传。

## GitHub 发布前检查

1. 先确认角色基础图及所有衍生图片具有公开再分发许可，并补充原作者、来源链接和许可证。
2. 执行 `npm ci && npm test`，再执行 `npm run prepublish:check`。
3. 检查 `git status`，不要提交 `release-*`、`artifacts`、`archive`、配置、账单或日志。
4. 建议先创建 **Private** 仓库完成授权和安全复核，再切换为 Public。
5. 如果密钥曾进入 Git 历史，必须立即在 DeepSeek 控制台撤销并重新生成；改写 Git 历史不能替代密钥轮换。
6. GitHub Release 只上传经过本机验收的安装包及 SHA-256，不上传用户数据目录。

仓库已包含 Windows CI、Dependabot、发布前敏感信息扫描与安全报告模板。

## 角色与素材声明

- `assets/whale/whale-maid.png`：项目发起者提供的社区二创参考图；原作者、首发来源和许可证待核实。
- 其余状态图：以该图片为角色一致性参考，通过 OpenAI 图像生成工具制作。
- 角色为非官方社区二创，不是 DeepSeek 官方角色或官方素材。
- DeepSeek 名称和标识归其相应权利人所有。
- 程序代码采用 MIT License；图片素材不随代码自动获得 MIT 授权。

完整素材清单与代码设计引用见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [assets/whale/README.md](assets/whale/README.md)。

## 贡献与许可

贡献要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。程序代码按 [MIT License](LICENSE) 发布。

