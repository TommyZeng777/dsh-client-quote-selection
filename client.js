/**
 * @thomas/dsh-client-quote-selection — browser half (classic script).
 *
 * Registers a client plugin factory through window.__ModuleLoader__.load.
 * The factory receives a require() that resolves platform modules (react,
 * @deepseek-ai/cordis, ...) from the frozen module table.
 *
 * Behavior: while the user selects text in the conversation transcript, a
 * floating "添加到当前对话" trigger appears. Clicking it opens a panel showing
 * the excerpt plus an optional comment box; confirming packages the excerpt
 * and the comment as a TXT attachment and adds it to the current conversation
 * through the composer's own attachment intake (`onAddFiles`), so the next
 * message carries the referenced text and its commentary to the model.
 *
 * The trigger lives in the `conversation.input.attachments` slot because that
 * is the public contract exposing `attachments`/`canAcceptDrop`/`onAddFiles`;
 * `conversation.input.overlay` does not project them. That slot is a `single`
 * cell, so this plugin registers one priority lower and renders the shipped
 * attachment rail inside its own component, preserving native attachments,
 * drop targets, and upload state.
 */
(function () {
  'use strict'

  var PLUGIN_ID = '@thomas/dsh-client-quote-selection'

  /**
   * The exact bytes one quote becomes. Kept pure and free of React so tests can
   * pin the attachment content without a browser: the model reads this file, so
   * its wording is a contract, not a detail.
   *
   * @param excerpt - the selected transcript text.
   * @param comment - the optional comment; whitespace-only counts as absent.
   * @returns the UTF-8 text of the `.txt` attachment.
   */
  function composeQuoteDocument(excerpt, comment) {
    var absent = String(comment == null ? '' : comment).trim() === ''
    return '引用与注释\n\n【选中的内容】\n' + String(excerpt == null ? '' : excerpt)
      + '\n\n【我的评论】\n' + (absent ? '（未添加评论）' : comment) + '\n'
  }

  /**
   * Attachment display name. A timestamp keeps two quotes in one draft from
   * looking identical in the rail.
   *
   * @param now - epoch milliseconds; defaults to the current clock.
   * @returns the `.txt` file name, colons and dots replaced for portability.
   */
  function quoteFileName(now) {
    return '引用注释-' + new Date(now == null ? Date.now() : now).toISOString().replace(/[:.]/g, '-') + '.txt'
  }

  window.__ModuleLoader__.load({ id: PLUGIN_ID, factory: function (require) {
    var React = require('react')
    var h = React.createElement
    var CSS = `
.rmq-panel,.rmq-trigger {position:fixed;z-index:2147483000;color:var(--dsw-alias-label-primary,#24262b);background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e7e7e9);box-shadow:0 4px 24px #00000012;font-family:inherit;box-sizing:border-box}
.rmq-trigger {border-radius:24px;padding:9px 16px;font-size:13px;cursor:pointer}
.rmq-panel {width:min(460px,calc(100vw - 24px));border-radius:24px;padding:12px 14px}
.rmq-row {display:flex;align-items:center;gap:10px}
.rmq-panel textarea {display:block;flex:1;min-width:0;resize:none;border:0;outline:none;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:22px;padding:7px 2px;max-height:132px}
.rmq-panel textarea::placeholder {color:var(--dsw-alias-label-tertiary,#989ba2)}
.rmq-send {display:grid;place-items:center;flex:none;width:34px;height:34px;border:0;border-radius:50%;background:#1769ed;color:white;cursor:pointer}
.rmq-send:disabled,.rmq-trigger:disabled {opacity:.45;cursor:default}
.rmq-panel button:focus-visible,.rmq-trigger:focus-visible {outline:2px solid #1769ed;outline-offset:3px}
.rmq-context {display:flex;gap:8px;align-items:center;margin:0 2px 5px;font-size:12px;color:var(--dsw-alias-label-secondary,#777b84)}
.rmq-excerpt {flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:2px solid #4385f5;padding-left:8px}
.rmq-close {border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:22px;padding:0 4px}
.rmq-hint {margin:5px 2px 0;font-size:11px;color:var(--dsw-alias-label-secondary,#777b84)}
.rmq-error {margin:6px 2px 0;font-size:12px;color:#d04444}
`
    function Quote(props) {
      var input = props.useInput(function (s) { return s })
      var selectionState = React.useState(null), selection = selectionState[0], setSelection = selectionState[1]
      var editState = React.useState(false), editing = editState[0], setEditing = editState[1]
      var commentState = React.useState(''), comment = commentState[0], setComment = commentState[1]
      var errorState = React.useState(''), error = errorState[0], setError = errorState[1]
      var pendingState = React.useState(null), pending = pendingState[0], setPending = pendingState[1]
      var textarea = React.useRef(null), frozen = React.useRef(false), sending = React.useRef(false)
      var consumed = React.useRef(false)
      var viewportState = React.useState(0), redraw = viewportState[1]
      var enabled = props.canAcceptDrop && input && input.phase === 'plain'
      function close() {
        frozen.current = false; sending.current = false
        setSelection(null); setEditing(false); setComment(''); setError(''); setPending(null)
      }
      React.useEffect(function () {
        function update() {
          var s = window.getSelection()
          var empty = !s || s.isCollapsed || !s.rangeCount || !s.toString().trim()
          // Any click or cursor move ends the latch that follows one successful
          // attachment, so the same selection is not quoted twice on a re-render.
          if (empty) consumed.current = false
          if (consumed.current || frozen.current) return
          if (empty) return setSelection(null)
          var node = s.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement)
          if (!el || el.closest('input,textarea,[contenteditable],.rmq-panel,[role="dialog"]')) return setSelection(null)
          // The renderer publishes data-slot as its addressable DOM seam.
          if (!el.closest('[data-slot="conversation.view"]')) return setSelection(null)
          var rect = s.getRangeAt(0).getBoundingClientRect()
          if (!rect.width && !rect.height) return setSelection(null)
          setSelection({ text: s.toString(), x: rect.left, y: rect.top, bottom: rect.bottom })
        }
        function reposition() { if (!frozen.current) setSelection(null); redraw(function (n) { return n + 1 }) }
        document.addEventListener('selectionchange', update)
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        if (window.visualViewport) window.visualViewport.addEventListener('resize', reposition)
        return function () {
          document.removeEventListener('selectionchange', update)
          window.removeEventListener('scroll', reposition, true)
          window.removeEventListener('resize', reposition)
          if (window.visualViewport) window.visualViewport.removeEventListener('resize', reposition)
        }
      }, [])
      React.useEffect(function () { if (editing && textarea.current) textarea.current.focus() }, [editing])
      React.useEffect(function () {
        if (!pending) return
        if (props.attachments.some(function (a) { return a.file === pending })) {
          consumed.current = true
          close()
        }
      }, [pending, props.attachments])
      function send() {
        if (!enabled || !selection || sending.current) return
        sending.current = true; setError('')
        var content = composeQuoteDocument(selection.text, comment)
        var file = new File([content], quoteFileName(), { type: 'text/plain;charset=utf-8' })
        try {
          props.onAddFiles([file])
          setPending(file)
        } catch (e) {
          sending.current = false; setError('附件未能加入，请重试。')
        }
      }
      // Intake is synchronous; only clear the comment after the attachment appears.
      React.useEffect(function () {
        if (!pending) return
        var timer = setTimeout(function () {
          sending.current = false; setPending(null); setError('附件未能加入，请确认当前对话可接收文件后重试。')
        }, 1200)
        return function () { clearTimeout(timer) }
      }, [pending])
      if (!selection) return null
      var viewport = window.visualViewport
      var viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      var width = editing ? Math.min(460, window.innerWidth - 24) : 130
      var position = { left: Math.max(12, Math.min(selection.x, window.innerWidth - width - 12)), top: Math.max(12, Math.min(editing ? selection.bottom + 10 : selection.y - 44, viewportBottom - (editing ? 190 : 48))) }
      if (!editing) return h(React.Fragment, null, h('button', {
        className: 'rmq-trigger', style: position, disabled: !enabled,
        onMouseDown: function (e) { e.preventDefault() },
        onClick: function () { frozen.current = true; setEditing(true) }
      }, '添加到当前对话'))
      return h(React.Fragment, null, h('section', { className: 'rmq-panel', style: position, 'aria-label': '引用评论',
        onKeyDown: function (e) {
          if (e.key === 'Escape' && !pending) { e.stopPropagation(); close() }
        }
      },
        h('div', { className: 'rmq-context' }, h('span', { className: 'rmq-excerpt', title: selection.text }, selection.text), h('button', { className: 'rmq-close', 'aria-label': '取消注释', onClick: close, disabled: Boolean(pending) }, '×')),
        h('div', { className: 'rmq-row' }, h('textarea', { ref: textarea, rows: 2, 'aria-label': '添加可选评论', placeholder: '添加可选评论…', value: comment, disabled: Boolean(pending),
          onChange: function (e) { setComment(e.target.value) },
          onKeyDown: function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); e.stopPropagation(); send() }
          }
        }), h('button', { className: 'rmq-send', 'aria-label': '发送注释附件', title: '将选文和评论作为 TXT 加入对话', disabled: !enabled || Boolean(pending), onClick: send },
          h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }, h('path', { d: 'M12 19V5M5 12l7-7 7 7', strokeLinecap: 'round', strokeLinejoin: 'round' })))),
        h('p', { className: 'rmq-hint' }, 'TXT 附件 · Enter 添加 · Shift + Enter 换行'),
        error ? h('p', { className: 'rmq-error', role: 'alert' }, error) : null
      ))
    }
    return { inject: ['slots'], apply: function (ctx) {
      var slots = ctx.get('slots')
      var style = document.createElement('style'); style.dataset.plugin = PLUGIN_ID; style.textContent = CSS; document.head.append(style)
      ctx.effect(function () { return function () { style.remove() } })
      // Decorate the public attachment presentation slot, preserving the native rail.
      // onAddFiles is only exposed here, not on conversation.input.overlay.
      slots.inject('conversation.input.attachments', function () {
        var original, wrapper, dispose, active = true
        var keys = new WeakMap(), nextKey = 0
        function reconcile() {
          if (!active) return
          var candidate = slots.entries('conversation.input.attachments').filter(function (entry) { return entry.component !== wrapper })[0]
          if (candidate === original) return
          if (dispose) { dispose(); dispose = null }
          original = candidate
          if (!candidate) return
          if (candidate.children || candidate.store) return
          wrapper = function (props) {
            var actions = props.inputActions
            if (actions && !keys.has(actions)) keys.set(actions, ++nextKey)
            return h(React.Fragment, null, actions && props.useInput ? h(Quote, Object.assign({}, props, { key: keys.get(actions) })) : null, h(candidate.component, props))
          }
          dispose = slots.register({ name: 'conversation.input.attachments', priority: (candidate.options.priority || 0) - 1, locale: candidate.locale, inject: candidate.inject }, wrapper)
        }
        var unsubscribe = slots.subscribe('conversation.input.attachments', reconcile)
        reconcile()
        return function () { active = false; unsubscribe(); if (dispose) dispose() }
      })
    }, __composeDocument: composeQuoteDocument, __quoteFileName: quoteFileName }
  } })
})()
