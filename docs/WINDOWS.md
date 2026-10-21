# Windows 打包与发布

目前仅维护 **Windows 10 / 11 x64** 安装包。Windows ARM64 / 32 位和 macOS 不在本流程范围内。安装包为开发预览版，尚未在真实 Windows 机器上完成安装、启动、采集与卸载验收。

## 用户安装

1. 下载 `douyin-版本-windows-x64-setup.exe`，运行安装向导，选择目录并安装。当前版本未配置 Windows 代码签名，系统可能显示未知发布者；请先确认文件来源与校验值。
2. 下载 `douyin-extension-版本.zip`，解压到固定文件夹。
3. Chrome 地址栏输入 `chrome://extensions`，打开开发者模式，选择「加载已解压的扩展程序」，选中解压后的 `extension` 文件夹。安装桌面程序不会自动安装扩展。
4. 启动「弹幕」，在设置中复制配对码，粘贴到扩展。
5. 在 Chrome 打开并登录需要使用的抖音直播间，通过扩展连接当前直播页，在桌面开始接收。

更新扩展后，请重新加载扩展并刷新直播页。只会接收后续可见消息，不补采旧记录。使用限制、数据安全与免责声明见项目 README。

如需核验下载文件，在 PowerShell 中运行：

```powershell
Get-FileHash .\douyin-0.1.0-windows-x64-setup.exe -Algorithm SHA256
```

对照同一发布页面的 `SHA256SUMS.txt`。校验值用于确认文件完整性，不代替可信来源或数字签名。

## 本地构建

准备 Node.js 22+、pnpm 8.15.1，推荐在 Windows x64 执行：

```sh
pnpm install --frozen-lockfile
pnpm release:win
```

- `pnpm build:win`：类型检查、前端/主进程构建、生成 x64 NSIS 安装包，禁止自动发布。
- `pnpm release:assets`：在安装包存在后，生成扩展 ZIP、说明和 SHA256 清单。
- `pnpm release:win`：连续执行以上两步。
- 安装包位于 `dist/`；可供分发的文件集中在 `dist/release/`，不应分发整个项目或 `win-unpacked`。
- 再次发布其他版本前，清空 `dist/release/` 中旧文件；脚本遇到多余文件会报错，防止混入旧包。
- 构建脚本默认不签名，并隔离宿主环境的 CSC 证书变量，避免误用其他项目证书。正式签名需后续单独接入。
- Mac 上可以尝试交叉构建 Windows 包，但不能据此确认 Windows 安装和运行成功。自动化始终在 Windows runner 构建。

## GitHub 自动化

参考后盾人教程的「标签触发 → GitHub Actions 构建 → 上传产物」流程，按本项目使用 pnpm 和当前 Actions 版本实现。配置文件为 `.github/workflows/build-windows.yml`。

1. 将项目源码推送到你自己的 GitHub 仓库，必须包含 `pnpm-lock.yaml`、`build/icon.ico`、扩展、脚本及 workflow 文件；不提交 `node_modules`、`dist`、配对码和个人配置。
2. 不发版时：在仓库 Actions 页面选择 **Build Windows → Run workflow**。成功后从该次运行的 Artifacts 下载构建结果，保留 14 天。
3. 拉取请求修改相关代码时也会运行检查和构建，不发布 Release。
4. 发版时：修改 `package.json` 的版本并提交，再创建同名 `v版本号` 标签。标签与版本不一致会直接失败。

```sh
# 先提交并推送当前代码，再执行；以下版本号需与 package.json 一致
git tag v0.1.0
git push origin v0.1.0
```

5. 标签构建成功后自动创建 **GitHub Draft Release（草稿）**，包含安装包、扩展 ZIP、安装说明、SHA256 清单。Windows 实机验收后再在 GitHub 发布草稿。

使用 GitHub 内置 `GITHUB_TOKEN`，不需要把个人访问令牌写入源码。仅 Release job 有仓库内容写权限；若组织禁止 Actions 发布，需要仓库管理员调整策略。此流程不包含客户端自动更新。

## 已接入的视觉素材

采用 Q 版小主播在电脑前直播的形象，安装包、桌面快捷方式、窗口、Windows 托盘和安装向导均使用项目素材。

| 素材       | 根目录源文件                                  | 实际构建资源                                                                      |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| 主图标     | `app-icon.png`，1024 × 1024，透明 PNG         | `build/icon.ico`，包含 16/24/32/48/64/128/256 像素；`resources/icon.png` 用于窗口 |
| 托盘图标   | `tray-icon.png`，64 × 64，透明 PNG            | `resources/tray-icon.png`，Windows 托盘显示时缩小到 16 像素                       |
| 向导侧图   | `installer-sidebar.bmp`，164 × 314，24 位 RGB | `build/installer-sidebar.bmp`，安装和卸载向导共用                                 |
| 向导顶部图 | `installer-header.bmp`，150 × 57，24 位 RGB   | `build/installer-header.bmp`                                                      |

替换根目录图片后，需要同步更新对应构建资源再打包。原始 AI 生成中间文件、环境和调试输出不纳入 Git 仓库。

## 发布前 Windows 实机验收

- 安装、选择目录、桌面快捷方式、启动和单实例行为正常。
- 窗口置顶、主题、关闭/托盘退出正常。
- Chrome 扩展加载、配对、真实新弹幕接收正常。
- 手动消息、右键回复、自动回复随机等待和限频按预期工作。
- 重启后设置保留；升级和卸载正常。卸载不应被描述为自动清理浏览器扩展数据。

参考教程：https://www.houdunren.com/doc/2f3120e8bdafe4bbb6e5bc80e58f912f656c656374726f6e2f313420e887aae58aa8e58c962e6d64
