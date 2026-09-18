import assert from 'node:assert/strict';
import { shouldIgnoreShortcut } from '../shared/utils.js';

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// 构造事件替身，默认焦点在 body、无修饰键
function makeEvent(overrides = {}) {
  return {
    target: { tagName: 'BODY' },
    key: 'c',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 67,
    repeat: false,
    ...overrides
  };
}

run('普通单键不忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent()), false);
});

run('Ctrl+C 复制被忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ ctrlKey: true })), true);
});

run('Cmd+C（metaKey）复制被忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ metaKey: true })), true);
});

run('Alt 组合被忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ altKey: true })), true);
});

run('Shift+C 仍可触发（大写/CapsLock 不影响）', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ shiftKey: true, key: 'C' })), false);
});

run('焦点在 INPUT/TEXTAREA/SELECT 时忽略', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shouldIgnoreShortcut(makeEvent({ target: { tagName } })), true, tagName);
  }
});

run('焦点在 contenteditable 时忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ target: { tagName: 'DIV', isContentEditable: true } })), true);
});

run('输入法组字中被忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ isComposing: true })), true);
  assert.equal(shouldIgnoreShortcut(makeEvent({ keyCode: 229 })), true);
});

run('长按重复被忽略', () => {
  assert.equal(shouldIgnoreShortcut(makeEvent({ repeat: true })), true);
});

run('空事件被忽略', () => {
  assert.equal(shouldIgnoreShortcut(null), true);
  assert.equal(shouldIgnoreShortcut(undefined), true);
});
