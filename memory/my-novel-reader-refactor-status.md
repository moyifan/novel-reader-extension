# My Novel Reader 重构项目状态

## 项目概述

目标：将 My Novel Reader userscript 8.0.5 重构为纯本地 Chrome Extension，移除所有在线功能，保留丰富阅读功能。

核心功能：左侧固定目录 + 右侧滚动阅读、15 种皮肤、语音朗读、繁简转换、进度记忆、自定义字体/样式。

---

## 已实现功能

| 功能 | 说明 |
|------|------|
| 界面结构 | 左侧固定目录栏 (270 px) + 右侧滚动阅读区 |
| 15 种皮肤主题 | 缺省/暗色/夜间模式/绿色/蓝色等 |
| 语音朗读 | Web Speech API，语速/音调/语音调节，朗读完自动下一章 |
| 繁简转换 | 原脚本完整映射表 (~170 KB)，长词优先算法 |
| 快捷键 | `q` 安静模式 `s` 设置 `c` 目录 `ESC` 关闭 |
| 进度记忆 | 自动保存滚动位置，重新打开自动恢复 |
| 滚动加载 | 滚动到底部自动加载下一章 |
| 目录联动 | 滚动时目录高亮自动同步，点击跳转 |
| 自定义 | 字体/字号/行高/extraCss 支持 |
| 存储分层 | 书籍索引/元信息/章节内容分离存储，避免整包读写 |
| 窗口化渲染 | 目录跳转按章节窗口渲染（默认前后各 2 章），避免大跨度重建卡顿 |
| 滚动节流 | 阅读区滚动逻辑使用 `requestAnimationFrame` 节流，降低高频计算压力 |
| 权限收敛 | 移除未使用的 `activeTab`/`scripting` 和空 `content_scripts`，减少权限暴露 |
| 解析逻辑单一化 | 章节解析统一到 `shared/parser.js`，`popup` 仅调用共享解析函数 |
| 解析自动化测试 | 新增 `tests/parser.test.js`，覆盖核心章节识别与误匹配场景 |

---

## 关键文件

| 文件 | 路径 |
|------|------|
| 阅读器逻辑 | `pages/reader.js` |
| 阅读器样式 | `pages/reader.css` |
| 阅读器 HTML | `pages/reader.html` |
| 设置页面 | `pages/settings.html` / `settings.js` |
| 存储 API | `shared/storage.js` |
| 常量/皮肤 | `shared/constants.js` |
| 繁简转换表 | `shared/zhTables.js` |
| Service Worker | `background/service-worker.js` |

---

## DEFAULT_SETTINGS

```javascript
{
  theme: 'sepia', fontSize: 18, fontFamily: 'Source Han Serif SC',
  lineHeight: 1.8, pageFlip: 'scroll', autoScroll: false,
  autoScrollSpeed: 30, skinName: '缺省皮肤', chineseConversion: 'disable',
  speechRate: 1, speechPitch: 1, speechVoiceIndex: 0,
  extraCss: '', contentWidth: '800px', customReplaceRules: ''
}
```

---

## Bug 修复记录

### 2026-05-03

| 问题 | 修复 |
|------|------|
| 大体积书籍读写卡顿 | 将 `books` 整包数组改为 `bookIndex + bookMeta_<id> + bookContent_<id>` 分层存储 |
| 旧版本数据结构兼容 | 增加 service worker 自动迁移：首次检测到旧 `books` 时拆分迁移并清理旧键 |
| 目录跳转到后期章节卡顿 | 阅读页改为窗口化渲染，不再从第一章重建到目标章节 |
| 滚动时计算过于频繁 | 阅读区滚动处理改为 `requestAnimationFrame` 节流 |
| 扩展权限范围过宽 | `manifest` 移除未使用权限与全站 content script 注入配置 |
| 章节解析维护成本高 | 删除 `popup` 内重复解析实现，改为复用 `shared/parser.js` 一套逻辑 |
| 章节规则回归风险高 | 添加零依赖 Node 测试脚本，快速校验解析规则是否被破坏 |
| 章节短标题拼接误判 | 仅对“纯第X章/回/卷...”标题行执行下一行拼接，避免把正文误当章节名 |

### 2026-04-30

| 问题 | 修复 |
|------|------|
| 重新打开扩展时滚动位置偏移 | 移除重复 `renderTOC` 调用，恢复位置后让目录同步滚动到可视区域 |
| 目录没有跟随滚动 | 在 `init()` 恢复位置后添加 `scrollIntoView` |

### 2026-04-29

| 问题 | 修复 |
|------|------|
| 章节解析错误 | 恢复 `popup/popup.js` 中的完整解析逻辑（`isRealChapterTitle` 等） |
| 字体设置缺失 | 添加 `XHei Intel` 选项到下拉框 |
| 目录高亮不同步 | `updateTOCByScroll()` 中添加 `scrollIntoView` 调用 |

### 2026-04-27

| 问题 | 修复 |
|------|------|
| 繁简转换表不完整 | 使用原脚本完整映射表 (~170 KB) |
| 滚动时目录跳到第二章 | `loadedChapterCount` 改为 `currentChapterIndex + 1` |
| 目录点击不能跳转 | 改为检查章节是否存在于 DOM 中 |

---

## 验证方法

1. 加载扩展：`chrome://extensions/` → 开发者模式 → 加载 unpacked
2. 上传 .txt 文件测试章节解析
3. 测试功能：滚动/目录跳转/皮肤切换/语音朗读/快捷键/繁简转换
4. **关闭后重新打开，验证进度恢复和目录同步**
5. 若存在旧数据：升级后首次打开应自动迁移，书架与阅读进度保持不丢失
6. 目录跳转到中后段章节（如第 100+ 章）时应快速响应，无明显卡顿
7. 扩展重新加载后，确认上传/打开阅读页/设置页均正常，且不再请求 `activeTab`、`scripting` 权限
8. 上传同一测试文本，确认解析章节数与章节标题（含“第X章 + 下一行短标题”场景）符合预期
9. 运行 `npm test`，确认 `tests/parser.test.js` 全部通过

---

## 注意事项

- ES Module：reader.js 和 settings.js 使用 `type="module"`
- 模块加载顺序：`utils → zhTables → constants → storage → parser → page`
- 进度存储：`chrome.storage.local`，通过 service worker 访问
