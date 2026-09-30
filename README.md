# @thomas/dsh-client-quote-selection

[English](README.en.md) | 中文

DeepSeek Harness Web GUI 插件：在对话里**用鼠标选中一段文字**后，选区旁会浮现「**添加到当前对话**」浮动按钮；点击后弹出面板，显示选中的摘录和一个**可选评论输入框**。确认后，插件把「选中的内容」与「我的评论」打包成 `.txt` 文件，作为普通草稿附件加入**当前对话**，模型就能同时看到你指的是哪段文字、以及你对它的说明。

- 平台：DeepSeek Harness Web GUI（`dsh web`）
- 形态：浏览器端插件（Client half），无 Host 逻辑、不重写对话 DOM
- 写入路径：`conversation.input.attachments` 的公共附件入口（`onAddFiles`），不走 `setDraft`/`submit`
- 行为细节：只有对话正文（`[data-slot="conversation.view"]`）内的选中才触发，输入框和弹窗内不触发；滚动/缩放窗口时隐藏；`Enter` 确认、`Shift + Enter` 换行；评论可留空，留空时记录为「（未添加评论）」；附件真正加入后评论框才关闭，且**同一处选区不再重复弹按钮**（要等重新划选），避免同一个引用被加两次
- 附件正文：固定的两段式纯文本（`引用与注释` / `【选中的内容】` / `【我的评论】`），文件名形如 `引用注释-<ISO 时间戳>.txt`；两处都由 `test/quote-document.test.mjs` 逐字节锁住，因为它同时是模型读到的东西
- 生命周期：附件落进 DSH 内容寻址的附件库（`<DSH_HOME>/attachments/v1/files/<sha256>/`），**随消息长期保留、不会自动回收**——这是 DSH 的附件语义（删掉会让历史消息里的附件打不开），不是本插件可以决定的
- 兼容说明：`conversation.input.attachments` 是 `single` 槽位且 `replaceRisk: shadows-shipped-ui`，因此插件以低一档 priority 注册，并在自己的组件里照常渲染官方附件栏（附件、拖放目标、上传状态都不丢）

## 安装

本包是一个**独立仓库**，自带 bundle patch，以 standalone 方式安装：`dsh plugin --profile <p> add <目录>`、Web 端**插件**页，或 `plugin_manager` 工具。它不依赖任何其它 Bundle 即可挂载。

- 挂载层：`cordis.patch.yml`（row `thomas-quote-selection-bundle`）
- 安装：任意 profile 的插件安装入口，指向本仓库根目录

## 目录结构

- `index.js` — Host half（故意为空，纯浏览器插件）
- `client.js` — Browser half（classic script，`window.__ModuleLoader__.load`）
- `cordis.patch.yml` — Bundle patch，插入 host row
- `package.json` — 包清单，声明 `dsh.bundle.patch`、`dsh.client.platform: web` 与客户端 `inject` 加载次序

## 验证

```sh
node --test test/*.test.mjs
```

5 项测试全部通过（Node v22.23.0 实测）。测试锁住两类不变量：附件正文与文件名逐字节一致，以及 `apply` 以低一档 priority 包装官方附件栏。
