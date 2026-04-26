# Chrome Extension Novel Reader

## 项目简介

基于 Chrome Extension 的本地小说阅读器，支持上传 `.txt` 文件、自动检测编码、智能解析章节、护眼模式阅读。

## 功能特点

- **文件上传**：点击扩展图标，选择 `.txt` 文件上传
- **自动编码检测**：智能识别 UTF-8/GBK/GB18030 等编码
- **智能章节解析**：自动识别"第X章"格式章节标题
- **护眼主题**：支持白天/护眼/夜间/深色四种主题
- **阅读设置**：字体大小、行高、翻页方式可调
- **书签功能**：单击添加书签，双击查看书签列表
- **进度保存**：自动保存阅读进度，关闭后重新打开可继续阅读
- **键盘快捷键**：← → 方向键翻页，ESC 关闭面板

## 安装步骤

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目目录

## 使用说明

1. 点击浏览器右上角扩展图标
2. 点击"上传书籍"选择 `.txt` 文件
3. 选择后自动打开阅读器
4. 使用顶部菜单按钮打开目录
5. 点击右上角设置按钮调整阅读偏好

## 文件结构

```text
background/       # Service Worker（消息路由、数据持久化）
content/          # 内容脚本（键盘快捷键）
popup/            # 扩展主界面（书库、上传）
pages/            # 阅读器页面、设置页面
shared/           # 共享模块（常量、编码检测、章节解析、存储封装）
icons/            # 扩展图标
manifest.json     # MV3 扩展清单
```

## 技术栈

- Manifest V3
- Chrome Storage API
- Service Worker
- Vanilla JavaScript (ES6+)
- CSS Variables for theming
