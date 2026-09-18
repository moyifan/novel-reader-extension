// 通用工具函数

/**
 * 解码 HTML 实体（&emsp; &nbsp; &lt; &gt; &amp; &quot; &#39; 等）
 * 适用于 .txt 文件中包含 HTML 实体的场景
 * @param {string} text - 原始文本
 * @returns {string} 解码后的文本
 */
export function decodeHtmlEntities(text) {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * HTML 转义
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 判断键盘事件是否应跳过单键快捷键处理
 *
 * 覆盖四类需要放行的场景：
 * 1. 焦点在输入类元素（input/textarea/select/contenteditable）中
 * 2. 按下了 Ctrl/Cmd/Alt —— 属于浏览器原生组合键（Ctrl+C 复制、Ctrl+S 保存、Ctrl+A 全选等）
 * 3. 输入法组字过程中（Chrome 组字期间 keyCode 为 229）
 * 4. 长按重复触发（e.repeat）
 *
 * @param {KeyboardEvent} e - 键盘事件
 * @returns {boolean} true 表示应跳过快捷键处理
 */
export function shouldIgnoreShortcut(e) {
  if (!e) return true;

  const target = e.target;
  const tag = target && target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target && target.isContentEditable) return true;

  // 修饰键组合交给浏览器原生行为，避免劫持复制（Ctrl+C）/粘贴/保存
  if (e.ctrlKey || e.metaKey || e.altKey) return true;

  // 输入法组字中
  if (e.isComposing || e.keyCode === 229) return true;

  // 长按连发只响应一次
  if (e.repeat) return true;

  return false;
}

/**
 * 生成唯一 ID
 * @returns {string} 唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 显示 Toast 提示
 * @param {HTMLElement} toastElement - toast 元素
 * @param {string} message - 消息内容
 */
export function showToast(toastElement, message) {
  toastElement.textContent = message;
  toastElement.classList.remove('hidden');
  setTimeout(() => {
    toastElement.classList.add('hidden');
  }, 2000);
}
