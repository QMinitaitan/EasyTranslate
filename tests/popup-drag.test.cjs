const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { baseParse, NodeTypes } = require('@vue/compiler-dom')
const { parse } = require('@vue/compiler-sfc')

function findElement(node, tag) {
  if (node.type === NodeTypes.ELEMENT && node.tag === tag) return node
  for (const child of node.children || []) {
    const found = findElement(child, tag)
    if (found) return found
  }
  return null
}

function staticAttribute(node, name) {
  return node.props.find(
    (prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === name
  )?.value?.content
}

function hasEvent(node, name) {
  return node.props.some(
    (prop) =>
      prop.type === NodeTypes.DIRECTIVE &&
      prop.name === 'on' &&
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.arg.content.toLowerCase() === name.toLowerCase()
  )
}

test('popup header and footer use native draggable regions', () => {
  const popupPath = path.join(__dirname, '../src/views/Popup.vue')
  const source = fs.readFileSync(popupPath, 'utf8')
  const { descriptor } = parse(source, { filename: popupPath })
  const ast = baseParse(descriptor.template.content)

  for (const tag of ['header', 'footer']) {
    const element = findElement(ast, tag)
    const classes = staticAttribute(element, 'class')?.split(/\s+/) || []

    assert.ok(classes.includes('drag'), `${tag} must be a native drag region`)
    assert.equal(
      hasEvent(element, 'mousedown'),
      false,
      `${tag} must not use manual mouse-position dragging`
    )
  }
})
