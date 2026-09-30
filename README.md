# @thomas/dsh-client-quote-selection

English | [中文](README.zh.md)

A DeepSeek Harness Web GUI plugin: when you **select a span of text** in a conversation with the mouse, a floating「**添加到当前对话**」trigger appears next to the selection. Clicking it opens a panel showing the excerpt plus an **optional comment box**; confirming packages「选中的内容」and「我的评论」into a `.txt` file and adds it to the **current conversation** as an ordinary draft attachment, so the model receives the passage you mean together with your annotation.

- Platform: DeepSeek Harness Web GUI (`dsh web`)
- Form: browser-side plugin (Client half), no Host logic, does not rewrite the conversation DOM
- Write path: the public attachment-intake contract of `conversation.input.attachments` (`onAddFiles`), not `setDraft`/`submit`
- Behavior details: the trigger only appears for selections inside the conversation transcript (`[data-slot="conversation.view"]`), never inside the composer or a dialog; scroll/resize hides it; `Enter` confirms and `Shift + Enter` adds a newline; the comment is optional and is recorded as「（未添加评论）」when empty; the panel stays open until the attachment actually lands, and the same selection stops offering the trigger until you select again, so one quote is never added twice
- Attachment body: fixed two-section plain text (`引用与注释` / `【选中的内容】` / `【我的评论】`), file named `引用注释-<ISO timestamp>.txt`. Both are pinned byte for byte by `test/quote-document.test.mjs`, because the model reads exactly this file.
- Lifecycle: the attachment lands in DSH's content-addressed store (`<DSH_HOME>/attachments/v1/files/<sha256>/`) and **stays there with the message — nothing collects it**. That is DSH's attachment semantics (deleting the bytes would break the attachment inside the historical message), not something this plugin decides.
- Compatibility note: `conversation.input.attachments` is a `single` cell with `replaceRisk: shadows-shipped-ui`, so the plugin registers one priority lower and renders the shipped attachment rail (attachments, drop target, upload state) inside its own component

## Repository ownership and mounting

This package is a **standalone repository**. It carries its own bundle patch and mounts on its own: `dsh plugin --profile <p> add <dir>`, the Web **Plugins** page, or the `plugin_manager` tool. It needs no other Bundle to be mounted.

- Mounting layer: `cordis.patch.yml` (row `thomas-quote-selection-bundle`)
- Installation: any profile's plugin installer, pointed at this repository root

## Directory layout

- `index.js` — Host half (deliberately empty; this is a browser-only plugin)
- `client.js` — Browser half (classic script, `window.__ModuleLoader__.load`)
- `cordis.patch.yml` — Bundle patch inserting the host row
- `package.json` — manifest declaring `dsh.bundle.patch`, `dsh.client.platform: web`, and the client `inject` ordering
