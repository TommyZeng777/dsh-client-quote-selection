// Unit tests for the browser half: the attachment document it produces, and the
// one seat it registers into.
//
// client.js is a classic script that calls `window.__ModuleLoader__.load` at
// load time; the stubs below capture the definition, hand the factory a minimal
// `require`, and drive `apply()` without a browser.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

function loadClient() {
  let definition
  const window = { __ModuleLoader__: { load: (d) => { definition = d } } }
  const style = { dataset: {}, style: {}, textContent: '', remove: () => {} }
  const document = { createElement: () => style, head: { append: () => {} } }
  const react = { createElement: () => null, Fragment: {}, useRef: () => ({}), useState: () => [null, () => {}], useEffect: () => {} }
  // eslint-disable-next-line no-new-func -- the plugin ships as a classic script
  new Function('window', 'document', source)(window, document)
  const client = definition.factory((id) => {
    if (id === 'react') return react
    throw new Error(`unexpected platform module: ${id}`)
  })
  return { definition, client }
}

/** Drive `apply()` with a slots stub that looks like the live attachment rail. */
function applyWithRecording(client) {
  const injected = []
  const registered = []
  const shippedRail = function ShippedRail() { return null }
  const candidate = { component: shippedRail, options: { priority: 0 }, locale: 'ui', inject: {} }
  const slots = {
    inject: (name, callback) => { injected.push(name); callback() },
    register: (options, component) => { registered.push({ options, component }); return () => {} },
    entries: () => [candidate],
    subscribe: () => () => {},
  }
  client.apply({
    get: (name) => (name === 'slots' ? slots : undefined),
    effect: () => () => {},
  })
  return { injected, registered, shippedRail }
}

test('client half is registered under the package id', async () => {
  const { definition } = await loadClient()
  assert.equal(definition.id, '@thomas/dsh-client-quote-selection')
})

test('the attachment carries both sections, excerpt first', async () => {
  const { client } = await loadClient()
  const text = client.__composeDocument('第 3 条顺手让它几秒后自己消失。要我改吗？', '要的，需要自动消失')
  assert.equal(
    text,
    '引用与注释\n\n【选中的内容】\n第 3 条顺手让它几秒后自己消失。要我改吗？\n\n【我的评论】\n要的，需要自动消失\n',
  )
})

test('a missing or whitespace-only comment is recorded as 未添加评论', async () => {
  const { client } = await loadClient()
  for (const comment of ['', '   ', '\n', undefined, null]) {
    const text = client.__composeDocument('选中的内容', comment)
    assert.ok(text.endsWith('【我的评论】\n（未添加评论）\n'), `${JSON.stringify(comment)}: ${text}`)
  }
})

test('the attachment name is a portable .txt stamped with the timestamp', async () => {
  const { client } = await loadClient()
  const name = client.__quoteFileName(Date.UTC(2026, 8, 17, 0, 35, 0, 2))
  assert.equal(name, '引用注释-2026-09-17T00-35-00-002Z.txt')
  assert.ok(!/[:.]/.test(name.slice('引用注释-'.length, -4)), name)
})

test('apply wraps the shipped attachment rail at one priority lower', async () => {
  const { client } = await loadClient()
  const { injected, registered, shippedRail } = applyWithRecording(client)
  assert.deepEqual(injected, ['conversation.input.attachments'])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, 'conversation.input.attachments')
  // The seat is a `single` cell with `replaceRisk: shadows-shipped-ui`: taking it
  // outright would drop native attachments, drop targets, and upload state.
  assert.equal(registered[0].options.priority, -1)
  assert.equal(typeof registered[0].component, 'function')
  assert.notEqual(registered[0].component, shippedRail)
  assert.deepEqual(client.inject, ['slots'])
})
