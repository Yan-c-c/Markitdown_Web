# MarkItDown_Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个基于 `MarkItDown` 的本地文档转 Markdown Web 应用。

当前仓库已经收敛成一个可直接运行的 Web 应用，目标很简单：把本地文件或 URL 转成结构尽量干净的 Markdown，并在页面里直接预览、复制、下载。

## 当前功能

- 单文件转换
- 批量文件转换
- URL 转换
- Markdown 预览 / 原文切换
- 当前结果一键复制
- 单个结果下载
- 批量结果打包下载
- 可选扩展名提示
- 可选启用插件
- 可选保留 Data URI

## 技术结构

- 后端：`FastAPI`
- 前端：`Vue 3` + `Vite` + `@nuxt/ui`
- 转换核心：`packages/markitdown`

主要目录：

- `frontend-vue/`：前端源码
- `webapp/app.py`：Web 服务入口
- `packages/markitdown/`：MarkItDown 核心包

## 运行方式

推荐使用你当前已经装好依赖的 `GraphRag` 环境。

### 1. 安装 Python 依赖

在仓库根目录执行：

```bash
pip install -e 'packages/markitdown[all]'
pip install fastapi uvicorn python-multipart
```

### 2. 安装前端依赖

```bash
cd frontend-vue
npm install
npm run typecheck
npm run build
cd ..
```

### 3. 启动服务

```bash
python -m uvicorn webapp.app:app --host 127.0.0.1 --port 8000 --reload
```

启动后访问：

```text
http://127.0.0.1:8000
```

## 当前页面能力

页面支持两种工作模式：

### 单个

- 上传一个文件，或输入一个 URL
- 文件上传区与已选文件列表分离显示
- 可直接替换当前文件，或移除后重新选择
- 执行转换
- 查看 Markdown 预览或原文
- 复制当前 Markdown
- 下载当前结果

### 批量

- 一次上传多个文件
- 可多次追加文件
- 支持逐个移除，或一键清空当前待处理文件
- 批量转换
- 逐个切换查看结果
- 复制当前文件的 Markdown
- 下载当前文件的 `.md`
- 一键下载全部 `.md` 压缩包

## 当前界面说明

- 左侧是输入区，负责选择模式、上传文件、填写 URL 和展开高级选项。
- 单文件模式下，上传组件只负责接收文件，已选文件会单独显示在下方，避免预览卡片在窄布局里挤压变形。
- 批量模式下，已选文件会以列表形式展示，便于追加、删除和确认本次待转换内容。
- 右侧是结果区，支持预览 / Markdown 切换，以及复制、下载当前结果、批量下载全部结果。

## 原生命令行用法

如果你不走 Web 页面，也可以直接使用原生命令：

```bash
markitdown input.docx -o output.md
```

## 说明

- 当前仓库已经删除旧的静态前端界面，统一使用 `frontend-vue` 构建产物。
- 运行过程中生成的 `__pycache__`、`dist`、`node_modules` 不属于业务源码。
