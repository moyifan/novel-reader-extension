// 阅读器页面逻辑
import { convertChinese, applyReplaceRules } from '../shared/constants.js';
import { escapeHtml, decodeHtmlEntities, shouldIgnoreShortcut } from '../shared/utils.js';
import { getBook as fetchBook, getSettings, saveSettings, updateProgress, getBookNotes } from '../shared/storage.js';

let book = null;
let settings = null;
let currentChapterIndex = 0;
let autoScrollTimer = null;
let scrollSaveTimer = null;
let isQuietMode = false;

// 语音朗读状态
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let speechState = 'stopped'; // stopped, playing, paused


// DOM 元素
const bookTitle = document.getElementById('bookTitle');
const contentDiv = document.getElementById('content');
const readerMain = document.getElementById('readerMain');
const tocSidebar = document.getElementById('tocSidebar');
const tocList = document.getElementById('tocList');
const tocMeta = document.getElementById('tocMeta');
const tocMetaLine = document.getElementById('tocMetaLine');
const tocIntro = document.getElementById('tocIntro');
const tocIntroToggle = document.getElementById('tocIntroToggle');
const tocIntroBody = document.getElementById('tocIntroBody');
const settingsBtn = document.getElementById('settingsBtn');
const closeTocBtn = document.getElementById('closeToc');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsBtn = document.getElementById('closeSettings');
const fontDecreaseBtn = document.getElementById('fontDecrease');
const fontIncreaseBtn = document.getElementById('fontIncrease');
const fontSizeValue = document.getElementById('fontSizeValue');
const fontFamilyInput = document.getElementById('fontFamily');
const extraCssInput = document.getElementById('extraCss');
const lineHeightValue = document.getElementById('lineHeightValue');
const lineHeightSlider = document.getElementById('lineHeightSlider');
const autoReadRadios = document.querySelectorAll('input[name="autoRead"]');
const saveSettingsBtn = document.getElementById('saveSettings');
const toast = document.getElementById('toast');

// 段评 DOM
const notesBtn = document.getElementById('notesBtn');
const notesDrawer = document.getElementById('notesDrawer');
const notesDrawerTitle = document.getElementById('notesDrawerTitle');
const notesDrawerSub = document.getElementById('notesDrawerSub');
const notesDrawerBody = document.getElementById('notesDrawerBody');
const closeNotesBtn = document.getElementById('closeNotes');

// 语音控制元素
const speechStartBtn = document.getElementById('speechStart');
const speechPauseBtn = document.getElementById('speechPause');
const speechStopBtn = document.getElementById('speechStop');
const speechStatus = document.getElementById('speechStatus');
const speechRateSlider = document.getElementById('speechRate');
const speechRateValue = document.getElementById('speechRateValue');
const speechPitchSlider = document.getElementById('speechPitch');
const speechPitchValue = document.getElementById('speechPitchValue');
const speechVoiceSelect = document.getElementById('speechVoice');

// Storage API wrappers - 使用 shared/storage.js
// getBook, getSettings, saveSettings, updateProgress 已从 shared/storage.js 导入


function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

function processContent(text) {
  let result = text;

  // 解码 HTML 实体（如 &emsp; &nbsp; 等），确保显示正确
  result = decodeHtmlEntities(result);

  // 应用自定义替换规则
  if (settings.customReplaceRules) {
    result = applyReplaceRules(result, settings.customReplaceRules);
  }

  // 繁简转换
  if (settings.chineseConversion === 'to-tw' || settings.chineseConversion === 'to-cn') {
    result = convertChinese(result, settings.chineseConversion);
  }

  return result;
}

// ========== 段落渲染 ==========
// 段评按章懒加载，避免打开书籍时传输整本段评
const notesCache = new Map();       // chapterIndex -> notes|null
const notesPending = new Map();     // chapterIndex -> Promise
const noteQuoteCache = new Map();   // chapterIndex -> 段落纯文本数组

function renderParagraphs(content, chapterIndex) {
  const lines = content.split('\n');
  const texts = [];
  const html = [];
  let paraIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    texts.push(trimmed);
    html.push(`<p data-para="${paraIndex}">${escapeHtml(trimmed)}</p>`);
    paraIndex++;
  }

  noteQuoteCache.set(chapterIndex, texts);
  return html.join('\n');
}

// ========== 段评角标 ==========
function notesVisible() {
  return !!(settings && settings.notesEnabled !== false && book && book.hasNotes);
}

function notePillHtml(chapterIndex, para, count) {
  return `<button class="note-pill" data-chapter="${chapterIndex}" data-para="${para}" title="${count} 条段评" aria-label="${count} 条段评">💬 ${count}</button>`;
}

// 把段落末尾几个字和气泡包在一起，避免气泡单独掉到下一行
function wrapParagraphTail(paragraph) {
  const last = paragraph.lastChild;
  if (!last || last.nodeType !== Node.TEXT_NODE) return null;

  const text = last.textContent;
  if (!text) return null;

  const take = Math.min(4, text.length);
  const tail = document.createElement('span');
  tail.className = 'note-tail';
  tail.textContent = text.slice(-take);
  last.textContent = text.slice(0, -take);
  paragraph.appendChild(tail);
  return tail;
}

function applyNoteBadges(chapterIndex) {
  const section = contentDiv.querySelector(`[data-chapter-index="${chapterIndex}"]`);
  if (!section) return;

  // 先清掉旧角标/整段可点标记，再按当前数据重建（避免重复注入）
  section.querySelectorAll('p.has-notes').forEach(el => el.classList.remove('has-notes'));
  section.querySelectorAll('.note-pill, .chapter-end-notes').forEach(el => el.remove());
  section.querySelectorAll('.note-tail').forEach((el) => {
    el.replaceWith(document.createTextNode(el.textContent));
  });
  if (!notesVisible()) return;

  const notes = notesCache.get(chapterIndex);
  if (!notes) return;

  for (const span of notes.spans || []) {
    const paragraph = section.querySelector(`p[data-para="${span.para}"]`);
    if (!paragraph) continue;
    paragraph.classList.add('has-notes');
    const tail = wrapParagraphTail(paragraph);
    (tail || paragraph).insertAdjacentHTML('beforeend', notePillHtml(chapterIndex, span.para, span.comments.length));
  }

  if (notes.orphans && notes.orphans.length > 0) {
    const total = notes.orphans.reduce((sum, item) => sum + item.comments.length, 0);
    section.insertAdjacentHTML('beforeend',
      `<div class="chapter-end-notes"><button class="note-pill" data-chapter="${chapterIndex}" data-orphan="1" title="无法定位到具体段落的段评">💬 章末段评 ${total}</button></div>`);
  }
}

async function ensureNotes(chapterIndex) {
  if (!notesVisible()) return null;

  if (notesCache.has(chapterIndex)) {
    applyNoteBadges(chapterIndex);
    return notesCache.get(chapterIndex);
  }

  let pending = notesPending.get(chapterIndex);
  if (!pending) {
    pending = getBookNotes(book.id, [chapterIndex])
      .then(result => {
        const notes = (result && result[chapterIndex]) || null;
        notesCache.set(chapterIndex, notes);
        notesPending.delete(chapterIndex);
        applyNoteBadges(chapterIndex);
        return notes;
      })
      .catch(error => {
        console.error('loadBookNotes error:', error);
        notesCache.set(chapterIndex, null);
        notesPending.delete(chapterIndex);
        return null;
      });
    notesPending.set(chapterIndex, pending);
  }

  return pending;
}

// ========== 段评抽屉 ==========
function noteItemElement(comment) {
  const item = document.createElement('div');
  item.className = 'note-item';

  const avatar = document.createElement('div');
  avatar.className = 'note-avatar';
  avatar.textContent = (comment.user || '?').trim().charAt(0) || '?';

  const main = document.createElement('div');
  main.className = 'note-main';

  const head = document.createElement('div');
  head.className = 'note-head';

  const user = document.createElement('span');
  user.className = 'note-user';
  user.textContent = comment.user || '匿名读者';

  if (comment.cross) {
    const tag = document.createElement('span');
    tag.className = 'note-tag';
    tag.textContent = '跨段';
    head.appendChild(tag);
  }

  const likes = document.createElement('span');
  likes.className = 'note-likes';
  likes.textContent = `♥ ${comment.likes || 0}`;

  head.appendChild(user);
  head.appendChild(likes);
  main.appendChild(head);

  if (comment.text) {
    const text = document.createElement('div');
    text.className = 'note-text';
    text.textContent = comment.text;
    main.appendChild(text);
  }

  if (comment.images && comment.images.length > 0) {
    const gallery = document.createElement('div');
    gallery.className = 'note-images';
    for (const url of comment.images) {
      const img = document.createElement('img');
      img.className = 'note-image';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 160;
      img.height = 160;
      img.alt = '段评图片';
      img.src = url;
      // 外链签名会过期，加载失败直接移除，避免破图
      img.addEventListener('error', () => img.remove());
      gallery.appendChild(img);
    }
    main.appendChild(gallery);
  }

  item.appendChild(avatar);
  item.appendChild(main);
  return item;
}

function noteQuoteElement(text) {
  const quote = document.createElement('div');
  quote.className = 'note-quote';
  quote.textContent = text || '';
  return quote;
}

// 抽屉配色跟随正文区域（body 或 .reader-main 的实际底色）
function syncDrawerPalette() {
  const main = document.querySelector('.reader-main');
  if (!main) return;

  const mainStyle = window.getComputedStyle(main);
  const bodyStyle = window.getComputedStyle(document.body);

  const mainBg = mainStyle.backgroundColor;
  const transparent = !mainBg || mainBg === 'transparent' || mainBg === 'rgba(0, 0, 0, 0)';

  notesDrawer.style.backgroundColor = transparent ? bodyStyle.backgroundColor : mainBg;
  notesDrawer.style.color = mainStyle.color || bodyStyle.color;
}

// 抽屉当前展示的内容，用于「再次点击同一入口关闭」
// kind: 'span'（单段） / 'orphans'（章末段评） / 'chapter'（本章段评列表）
let notesDrawerContext = null;
let lastFocusedBeforeNotes = null;

function isNotesDrawerOpen(kind, chapterIndex, para = null) {
  if (!notesDrawerContext || notesDrawer.classList.contains('hidden')) return false;
  if (notesDrawerContext.kind !== kind) return false;
  if (notesDrawerContext.chapterIndex !== chapterIndex) return false;
  return kind !== 'span' || notesDrawerContext.para === para;
}

function openNotesDrawer() {
  const wasHidden = notesDrawer.classList.contains('hidden');
  if (wasHidden) lastFocusedBeforeNotes = document.activeElement;

  notesDrawer.classList.remove('hidden');
  document.body.classList.add('notes-open');
  syncDrawerPalette();

  if (wasHidden) closeNotesBtn.focus();
}

function closeNotesDrawer() {
  const focusInside = notesDrawer.contains(document.activeElement);
  notesDrawer.classList.add('hidden');
  document.body.classList.remove('notes-open');
  notesDrawerContext = null;
  clearActiveParagraph();

  if (focusInside && lastFocusedBeforeNotes && lastFocusedBeforeNotes.isConnected) {
    lastFocusedBeforeNotes.focus();
  }
}

function clearActiveParagraph() {
  contentDiv.querySelectorAll('p.note-active').forEach(el => el.classList.remove('note-active'));
}

function markActiveParagraph(chapterIndex, para) {
  clearActiveParagraph();
  const section = contentDiv.querySelector(`[data-chapter-index="${chapterIndex}"]`);
  const paragraph = section && section.querySelector(`p[data-para="${para}"]`);
  if (paragraph) paragraph.classList.add('note-active');
}

function renderNotesDrawerTitle(title, sub) {
  notesDrawerTitle.textContent = sub ? `${title} · ${sub}` : title;
  notesDrawerSub.textContent = '';
  notesDrawerSub.classList.add('hidden');
}

function renderSingleSpanDrawer(chapterIndex, para) {
  const notes = notesCache.get(chapterIndex);
  if (!notes) return;
  const span = (notes.spans || []).find(item => item.para === para);
  if (!span) return;

  renderNotesDrawerTitle('段评', `第 ${chapterIndex + 1} 章 · ${span.comments.length} 条`);
  notesDrawerBody.innerHTML = '';
  notesDrawerBody.appendChild(noteQuoteElement((noteQuoteCache.get(chapterIndex) || [])[para]));

  const list = document.createElement('div');
  list.className = 'note-list';
  for (const comment of span.comments) {
    list.appendChild(noteItemElement(comment));
  }
  notesDrawerBody.appendChild(list);
  markActiveParagraph(chapterIndex, para);
  notesDrawerContext = { kind: 'span', chapterIndex, para };
  openNotesDrawer();
}

function renderOrphansDrawer(chapterIndex) {
  const notes = notesCache.get(chapterIndex);
  if (!notes) return;
  const total = (notes.orphans || []).reduce((sum, item) => sum + item.comments.length, 0);
  renderNotesDrawerTitle('章末段评', `第 ${chapterIndex + 1} 章 · ${total} 条（无法定位到具体段落）`);

  notesDrawerBody.innerHTML = '';
  for (const orphan of notes.orphans || []) {
    const heading = document.createElement('div');
    heading.className = 'note-orphan-title';
    heading.textContent = orphan.rawIndex ? `原始段索引 ${orphan.rawIndex}` : '未定位段评';
    notesDrawerBody.appendChild(heading);
    for (const comment of orphan.comments) {
      notesDrawerBody.appendChild(noteItemElement(comment));
    }
  }
  notesDrawerContext = { kind: 'orphans', chapterIndex };
  clearActiveParagraph();
  openNotesDrawer();
}

function renderChapterNotesDrawer(chapterIndex) {
  const notes = notesCache.get(chapterIndex);
  if (!notes) return;

  const spanCount = (notes.spans || []).length;
  renderNotesDrawerTitle('本章段评', `第 ${chapterIndex + 1} 章 · ${notes.total} 条 / ${spanCount} 段`);
  notesDrawerBody.innerHTML = '';

  const tip = document.createElement('div');
  tip.className = 'note-drawer-tip';
  tip.textContent = '数据为导出选摘：每章最多前 30 个有评段落，每段仅热门前 5 条。';
  notesDrawerBody.appendChild(tip);

  const quoteTexts = noteQuoteCache.get(chapterIndex) || [];
  for (const span of notes.spans || []) {
    const block = document.createElement('div');
    block.className = 'note-span-block';

    const quote = noteQuoteElement(quoteTexts[span.para]);
    quote.title = '跳转到该段落';
    quote.addEventListener('click', () => jumpToParagraph(chapterIndex, span.para));
    block.appendChild(quote);

    for (const comment of span.comments) {
      block.appendChild(noteItemElement(comment));
    }
    notesDrawerBody.appendChild(block);
  }

  if (notes.orphans && notes.orphans.length > 0) {
    const heading = document.createElement('div');
    heading.className = 'note-orphan-title';
    heading.textContent = '章末段评';
    notesDrawerBody.appendChild(heading);
    for (const orphan of notes.orphans) {
      for (const comment of orphan.comments) {
        notesDrawerBody.appendChild(noteItemElement(comment));
      }
    }
  }

  notesDrawerContext = { kind: 'chapter', chapterIndex };
  clearActiveParagraph();
  openNotesDrawer();
}

function jumpToParagraph(chapterIndex, para) {
  const section = contentDiv.querySelector(`[data-chapter-index="${chapterIndex}"]`);
  const paragraph = section && section.querySelector(`p[data-para="${para}"]`);
  if (!paragraph) return;

  paragraph.scrollIntoView({ block: 'center', behavior: 'smooth' });
  paragraph.classList.add('note-target');
  setTimeout(() => paragraph.classList.remove('note-target'), 1600);
  closeNotesDrawer();
}

async function openNoteForPill(button) {
  const chapterIndex = Number(button.dataset.chapter);
  if (!Number.isFinite(chapterIndex)) return;

  const isOrphan = button.dataset.orphan === '1';
  const para = isOrphan ? null : Number(button.dataset.para);

  // 同一入口再次点击 → 关闭
  if (isNotesDrawerOpen(isOrphan ? 'orphans' : 'span', chapterIndex, para)) {
    closeNotesDrawer();
    return;
  }

  const notes = await ensureNotes(chapterIndex);
  if (!notes) return;

  if (isOrphan) {
    renderOrphansDrawer(chapterIndex);
  } else {
    renderSingleSpanDrawer(chapterIndex, para);
  }
}

async function openParagraphNotes(chapterIndex, para) {
  // 同一段再次点击 → 关闭
  if (isNotesDrawerOpen('span', chapterIndex, para)) {
    closeNotesDrawer();
    return;
  }

  const notes = await ensureNotes(chapterIndex);
  if (!notes) return;
  renderSingleSpanDrawer(chapterIndex, para);
}

async function openChapterNotesDrawer() {
  // 「本章段评」再次点击 → 关闭
  if (isNotesDrawerOpen('chapter', currentChapterIndex)) {
    closeNotesDrawer();
    return;
  }

  const notes = await ensureNotes(currentChapterIndex);
  if (!notes) {
    showToast('本章暂无段评');
    return;
  }
  renderChapterNotesDrawer(currentChapterIndex);
}

// 设置变化后刷新角标显示
function refreshRenderedNotes() {
  contentDiv.querySelectorAll('.chapter-section').forEach(section => {
    const index = Number(section.dataset.chapterIndex);
    if (Number.isFinite(index)) ensureNotes(index);
  });
}

function updateNotesButtonVisibility() {
  if (!notesBtn) return;
  const visible = !!(book && book.hasNotes) && settings.notesEnabled !== false;
  notesBtn.classList.toggle('hidden', !visible);
  if (!visible) {
    contentDiv.querySelectorAll('p.has-notes').forEach(el => el.classList.remove('has-notes'));
    contentDiv.querySelectorAll('.note-pill, .chapter-end-notes').forEach(el => el.remove());
    closeNotesDrawer();
  }
}

// 滚动加载和目录联动逻辑（窗口化渲染）
const WINDOW_RADIUS = 2;
const MAX_RENDERED_CHAPTERS = 7;
let isLoadingNextChapter = false; // 防止重复加载
let windowStartChapterIndex = 0;
let windowEndChapterIndex = 0;
let scrollTicking = false;

function renderChapterSection(index, append = true) {
  if (index < 0 || index >= book.totalChapters) return;
  if (contentDiv.querySelector(`[data-chapter-index="${index}"]`)) return;

  const chapter = book.chapters[index];
  if (!chapter) return;

  const processedContent = processContent(chapter.content);
  const processedTitle = processContent(chapter.title);
  const chapterHtml = `<div class="chapter-section" data-chapter-index="${index}">
    <h2 class="chapter-title">${escapeHtml(processedTitle)}</h2>
    ${renderParagraphs(processedContent, index)}
  </div>`;

  if (append) {
    contentDiv.insertAdjacentHTML('beforeend', chapterHtml);
  } else {
    contentDiv.insertAdjacentHTML('afterbegin', chapterHtml);
  }

  applyNoteBadges(index);
  ensureNotes(index);
}

function renderChapterWindow(centerIndex) {
  const start = Math.max(0, centerIndex - WINDOW_RADIUS);
  const end = Math.min(book.totalChapters - 1, centerIndex + WINDOW_RADIUS);

  contentDiv.innerHTML = '';
  for (let i = start; i <= end; i++) {
    renderChapterSection(i, true);
  }

  windowStartChapterIndex = start;
  windowEndChapterIndex = end;
}

function trimWindowToLimit() {
  const chapters = contentDiv.querySelectorAll('.chapter-section');
  if (chapters.length <= MAX_RENDERED_CHAPTERS) return;

  const currentNode = contentDiv.querySelector(`[data-chapter-index="${currentChapterIndex}"]`);
  const currentTopBefore = currentNode ? currentNode.getBoundingClientRect().top : 0;

  while (contentDiv.querySelectorAll('.chapter-section').length > MAX_RENDERED_CHAPTERS) {
    const first = contentDiv.querySelector('.chapter-section');
    const last = contentDiv.querySelector('.chapter-section:last-of-type');
    if (!first || !last) break;

    const firstIdx = parseInt(first.dataset.chapterIndex, 10);
    const lastIdx = parseInt(last.dataset.chapterIndex, 10);
    const firstDistance = Math.abs(firstIdx - currentChapterIndex);
    const lastDistance = Math.abs(lastIdx - currentChapterIndex);

    if (firstDistance >= lastDistance && firstIdx !== currentChapterIndex) {
      first.remove();
      windowStartChapterIndex = Math.min(windowStartChapterIndex + 1, windowEndChapterIndex);
    } else if (lastIdx !== currentChapterIndex) {
      last.remove();
      windowEndChapterIndex = Math.max(windowEndChapterIndex - 1, windowStartChapterIndex);
    } else {
      break;
    }
  }

  const currentNodeAfter = contentDiv.querySelector(`[data-chapter-index="${currentChapterIndex}"]`);
  if (currentNode && currentNodeAfter) {
    const currentTopAfter = currentNodeAfter.getBoundingClientRect().top;
    readerMain.scrollTop += currentTopAfter - currentTopBefore;
  }
}

function handleScroll() {
  if (speechState !== 'stopped') return;

  const scrollTop = readerMain.scrollTop;
  const scrollHeight = readerMain.scrollHeight;
  const clientHeight = readerMain.clientHeight;
  const distanceToBottom = scrollHeight - scrollTop - clientHeight;

  // 距离底部小于 400px 时加载下一章（原脚本的 remain_height 默认值）
  if (distanceToBottom < 400 && !isLoadingNextChapter) {
    loadNextChapter();
  }

  // 距离顶部较近时尝试向前补章节
  if (scrollTop < 300) {
    loadPrevChapter();
  }

  // 更新目录高亮
  updateTOCByScroll();
}

// 加载下一章内容（追加到当前内容底部）
function loadNextChapter() {
  if (windowEndChapterIndex >= book.totalChapters - 1) return;

  isLoadingNextChapter = true;

  const nextIndex = windowEndChapterIndex + 1;
  renderChapterSection(nextIndex, true);
  windowEndChapterIndex = nextIndex;
  trimWindowToLimit();

  if (windowEndChapterIndex >= book.totalChapters - 1) {
    showToast('已到达最后一章');
  }

  isLoadingNextChapter = false;
}

function loadPrevChapter() {
  if (windowStartChapterIndex <= 0) return;

  const prevIndex = windowStartChapterIndex - 1;
  const firstChapterNode = contentDiv.querySelector('.chapter-section');
  const firstTopBefore = firstChapterNode ? firstChapterNode.getBoundingClientRect().top : 0;

  renderChapterSection(prevIndex, false);
  windowStartChapterIndex = prevIndex;

  const firstTopAfter = firstChapterNode ? firstChapterNode.getBoundingClientRect().top : firstTopBefore;
  readerMain.scrollTop += firstTopAfter - firstTopBefore;

  trimWindowToLimit();
}

// 根据滚动位置更新目录高亮
function updateTOCByScroll() {
  const scrollTop = readerMain.scrollTop;
  const clientHeight = readerMain.clientHeight;
  const viewportMiddle = scrollTop + clientHeight / 2;

  // 获取所有章节区块
  const chapters = contentDiv.querySelectorAll('.chapter-section');
  if (!chapters.length) return;

  let activeIndex = 0;

  // 遍历找到视口中间所在的章节
  for (let i = 0; i < chapters.length; i++) {
    const rect = chapters[i].getBoundingClientRect();
    const chapterTop = rect.top + scrollTop - readerMain.offsetTop;
    const chapterBottom = chapterTop + rect.height;

    if (viewportMiddle >= chapterTop && viewportMiddle < chapterBottom) {
      activeIndex = i;
      break;
    }
    if (i === chapters.length - 1 && viewportMiddle >= chapterBottom) {
      activeIndex = i;
    }
  }

  // 更新 currentChapterIndex
  const dataIdx = chapters[activeIndex].dataset.chapterIndex;
  const chapterIndex = dataIdx !== undefined ? parseInt(dataIdx, 10) : activeIndex;

  if (chapterIndex !== currentChapterIndex) {
    currentChapterIndex = chapterIndex;
    renderTOC();

    // 让活动目录项滚动到可视区域
    const activeItem = tocList.querySelector('li.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

// 跳转到指定章节（目录点击时调用）
function scrollToChapter(index) {
  if (index < 0 || index >= book.totalChapters) return;

  closeNotesDrawer();
  currentChapterIndex = index;
  renderChapterWindow(index);

  const targetChapter = contentDiv.querySelector(`[data-chapter-index="${index}"]`);
  if (targetChapter) readerMain.scrollTop = targetChapter.offsetTop - 20;

  // 更新目录高亮
  renderTOC();
}

// 重建内容（当点击目录跳转到未加载的章节时）
function rebuildContent(targetIndex) {
  renderChapterWindow(targetIndex);
  const targetChapter = contentDiv.querySelector(`[data-chapter-index="${targetIndex}"]`);
  if (targetChapter) readerMain.scrollTop = targetChapter.offsetTop - 20;
}

// 清除预加载的缓冲内容
function clearBufferContent() {
  contentDiv.querySelectorAll('.chapter-buffer').forEach(el => el.remove());
}

// 应用额外自定义样式
function applyExtraCss(extraCss) {
  let extraStyle = document.getElementById('extra-style');
  if (!extraStyle) {
    extraStyle = document.createElement('style');
    extraStyle.id = 'extra-style';
    document.head.appendChild(extraStyle);
  }
  extraStyle.textContent = extraCss || '';
}

// 初始化
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const bookId = urlParams.get('bookId');

  if (!bookId) {
    showToast('未指定书籍');
    return;
  }

  book = await fetchBook(bookId);
  if (!book) {
    showToast('书籍不存在');
    return;
  }

  settings = await getSettings();
  applySettings();
  currentChapterIndex = book.lastChapterIndex || 0;

  renderBook();
  // renderBook 内部已调用 renderTOC，这里不需要重复调用
  initSpeech();
  initKeyboardShortcuts();
  initSettingInputs();

  // 恢复滚动位置并让目录同步
  setTimeout(() => {
    if (book.lastScrollPercent) {
      const scrollHeight = readerMain.scrollHeight - readerMain.clientHeight;
      readerMain.scrollTop = (scrollHeight * book.lastScrollPercent) / 100;
    }
    // 让目录的当前高亮项滚动到可视区域
    const activeItem = tocList.querySelector('li.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, 100);
}

// 应用设置到页面
function applySettings() {
  // 应用字体和排版
  document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
  document.documentElement.style.setProperty('--line-height', settings.lineHeight);
  document.documentElement.style.setProperty('--content-width', settings.contentWidth || '800px');
  document.documentElement.style.setProperty('--paragraph-height', settings.paragraphHeight || '1em');

  // 应用字体（支持用户手动输入的字体如 XHei Intel）
  if (settings.fontFamily) {
    document.documentElement.style.setProperty('--font-family', settings.fontFamily);
    document.body.style.fontFamily = settings.fontFamily;
  }

  // 应用额外自定义样式
  applyExtraCss(settings.extraCss);

  // 更新UI
  if (fontSizeValue) fontSizeValue.textContent = settings.fontSize + 'px';
  if (lineHeightValue) lineHeightValue.textContent = settings.lineHeight;
  if (lineHeightSlider) lineHeightSlider.value = settings.lineHeight;

  // 自动滚动设置
  autoReadRadios.forEach(radio => {
    const value = settings.autoScroll ? String(settings.autoScrollSpeed || '30') : 'off';
    radio.checked = radio.value === value;
  });

  // 语音设置
  if (speechRateSlider) speechRateSlider.value = settings.speechRate || 1;
  if (speechRateValue) speechRateValue.textContent = settings.speechRate || 1;
  if (speechPitchSlider) speechPitchSlider.value = settings.speechPitch || 1;
  if (speechPitchValue) speechPitchValue.textContent = settings.speechPitch || 1;

  // 目录默认隐藏
  if (settings.menuListHidden) {
    tocSidebar.classList.add('hidden');
  }

  // 段评角标开关
  updateNotesButtonVisibility();
  refreshRenderedNotes();
  syncDrawerPalette();
}

// 初始化设置面板的输入框
function initSettingInputs() {
  // 字体输入框
  if (fontFamilyInput) {
    fontFamilyInput.value = settings.fontFamily || '';
  }
  // 自定义样式输入框
  if (extraCssInput) {
    extraCssInput.value = settings.extraCss || '';
  }
}

// 渲染书籍
function renderBook() {
  bookTitle.textContent = book.name;
  renderBookMeta();

  const chapter = book.chapters[currentChapterIndex];
  if (!chapter) return;

  // 使用窗口化渲染，避免大章节跳转时重建过重
  renderChapterWindow(currentChapterIndex);
  const currentChapterNode = contentDiv.querySelector(`[data-chapter-index="${currentChapterIndex}"]`);
  if (currentChapterNode) {
    readerMain.scrollTop = currentChapterNode.offsetTop - 20;
  }

  // 更新目录高亮
  renderTOC();

  // 更新语音状态
  if (speechState !== 'stopped') {
    stopSpeech();
  }
}

// 渲染目录
function renderTOC() {
  if (tocList.children.length !== book.chapters.length) {
    tocList.innerHTML = book.chapters.map((ch, index) => `
      <li role="button" tabindex="-1" data-index="${index}" aria-current="false">${escapeHtml(processContent(ch.title))}</li>
    `).join('');
  }

  // 只更新状态，避免每次切章重建 801 个节点
  for (let i = 0; i < tocList.children.length; i++) {
    const li = tocList.children[i];
    const active = i === currentChapterIndex;
    li.classList.toggle('active', active);
    li.tabIndex = active ? 0 : -1;
    li.setAttribute('aria-current', active ? 'true' : 'false');
  }
}

// 保存阅读进度
function saveProgress() {
  const scrollHeight = readerMain.scrollHeight - readerMain.clientHeight;
  const scrollPercent = scrollHeight > 0 ? (readerMain.scrollTop / scrollHeight) * 100 : 0;
  updateProgress(book.id, currentChapterIndex, scrollPercent);

  if (settings.autoScroll && settings.autoScrollSpeed) {
    startAutoScroll();
  } else {
    stopAutoScroll();
  }
}

// 自动滚动
function startAutoScroll() {
  if (speechState !== 'stopped') return; // 朗读时禁用自动滚动
  stopAutoScroll();
  const seconds = settings.autoScrollSpeed || 30;
  const pixelsPerSecond = readerMain.clientHeight / seconds;
  autoScrollTimer = setInterval(() => {
    readerMain.scrollBy(0, pixelsPerSecond);
    if (readerMain.scrollTop >= readerMain.scrollHeight - readerMain.clientHeight - 10) {
      stopAutoScroll();
    }
  }, 1000);
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
}

// ========== 语音朗读 ==========
function initSpeech() {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function loadVoices() {
  const voices = speechSynthesis.getVoices();
  speechVoiceSelect.innerHTML = '<option value="">默认语音</option>';
  voices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${voice.name} (${voice.lang})`;
    speechVoiceSelect.appendChild(option);
  });
  if (settings.speechVoiceIndex && voices[settings.speechVoiceIndex]) {
    speechVoiceSelect.value = settings.speechVoiceIndex;
  }
}

function getChapterText() {
  return book.chapters[currentChapterIndex]?.content || '';
}

function startSpeech() {
  if (speechState === 'playing') return;

  const text = processContent(getChapterText());
  if (!text) return;

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = settings.speechRate || 1;
  currentUtterance.pitch = settings.speechPitch || 1;

  const voices = speechSynthesis.getVoices();
  if (speechVoiceSelect.value && voices[speechVoiceSelect.value]) {
    currentUtterance.voice = voices[speechVoiceSelect.value];
  }

  currentUtterance.onend = () => {
    speechState = 'stopped';
    updateSpeechUI();
    // 自动下一章
    if (currentChapterIndex < book.totalChapters - 1) {
      scrollToChapter(currentChapterIndex + 1);
      setTimeout(startSpeech, 500);
    }
  };

  currentUtterance.onerror = () => {
    speechState = 'stopped';
    updateSpeechUI();
  };

  speechSynthesis.speak(currentUtterance);
  speechState = 'playing';
  stopAutoScroll();
  updateSpeechUI();
}

function pauseSpeech() {
  speechSynthesis.pause();
  speechState = 'paused';
  updateSpeechUI();
}

function resumeSpeech() {
  speechSynthesis.resume();
  speechState = 'playing';
  updateSpeechUI();
}

function stopSpeech() {
  speechSynthesis.cancel();
  speechState = 'stopped';
  updateSpeechUI();
}

function updateSpeechUI() {
  switch (speechState) {
    case 'playing':
      speechStartBtn.style.display = 'none';
      speechPauseBtn.style.display = 'inline-block';
      speechStopBtn.style.display = 'inline-block';
      speechStatus.textContent = '朗读中...';
      break;
    case 'paused':
      speechStartBtn.style.display = 'inline-block';
      speechStartBtn.textContent = '继续';
      speechPauseBtn.style.display = 'none';
      speechStopBtn.style.display = 'inline-block';
      speechStatus.textContent = '已暂停';
      break;
    default:
      speechStartBtn.style.display = 'inline-block';
      speechStartBtn.textContent = '开始朗读';
      speechPauseBtn.style.display = 'none';
      speechStopBtn.style.display = 'none';
      speechStatus.textContent = '就绪';
  }
}

// 语音事件绑定
speechStartBtn.addEventListener('click', () => {
  if (speechState === 'paused') {
    resumeSpeech();
  } else {
    startSpeech();
  }
});

speechPauseBtn.addEventListener('click', pauseSpeech);
speechStopBtn.addEventListener('click', stopSpeech);

speechRateSlider.addEventListener('input', () => {
  speechRateValue.textContent = speechRateSlider.value;
  settings.speechRate = parseFloat(speechRateSlider.value);
});

speechPitchSlider.addEventListener('input', () => {
  speechPitchValue.textContent = speechPitchSlider.value;
  settings.speechPitch = parseFloat(speechPitchSlider.value);
});

speechVoiceSelect.addEventListener('change', () => {
  settings.speechVoiceIndex = parseInt(speechVoiceSelect.value) || 0;
});

// ========== 安静模式 ==========
function toggleQuietMode() {
  isQuietMode = !isQuietMode;
  document.body.classList.toggle('quiet-mode', isQuietMode);
  showToast(isQuietMode ? '安静模式已开启' : '安静模式已关闭');
}

// ========== 快捷键系统 ==========
// 快捷键表：id 为设置项名，def 为默认键，run 为处理函数
// 新增快捷键只需在此表加一行，无需改动分发逻辑
const SHORTCUTS = [
  { id: 'quietModeKey', def: 'q', run: () => toggleQuietMode() },
  { id: 'openPreferencesKey', def: 's', run: () => toggleSettingsPanel() },
  { id: 'hideMenuListKey', def: 'c', run: () => toggleTOC() }
];

function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

// 读取设置中的按键并归一化（兼容历史数据里的大写值）
function getShortcutKey(shortcut) {
  return String(settings[shortcut.id] || shortcut.def).toLowerCase();
}

function handleKeydown(e) {
  // 输入框/修饰键组合（Ctrl+C 复制等）/输入法组字/长按连发，一律不处理快捷键
  if (shouldIgnoreShortcut(e)) return;

  const key = e.key.toLowerCase();

  // 设置面板是模态层：打开时只响应 Esc，避免面板内操作被快捷键打断
  if (!settingsOverlay.classList.contains('hidden') && key !== 'escape') return;

  if (key === 'escape') {
    closeNotesDrawer();
    closeAllPanels();
    return;
  }

  const matched = SHORTCUTS.find((shortcut) => getShortcutKey(shortcut) === key);
  if (matched) {
    matched.run();
  }
}

function closeAllPanels() {
  settingsOverlay.classList.add('hidden');
  tocSidebar.classList.add('hidden');
  closeNotesDrawer();
}

// ========== 目录 ==========
// 书名下的作者/字数/连载状态 + 可折叠简介（仅带元信息的格式显示）
function renderBookMeta() {
  const lineText = [book.author, book.wordCount, book.bookStatus].filter(Boolean).join(' · ');
  const hasIntro = Boolean(book.intro);

  tocMeta.classList.toggle('hidden', !lineText && !hasIntro);
  tocMetaLine.textContent = lineText;
  tocMetaLine.classList.toggle('hidden', !lineText);

  tocIntro.classList.toggle('hidden', !hasIntro);
  if (hasIntro) {
    tocIntroBody.textContent = book.intro;
  }
  setIntroExpanded(false);
}

function setIntroExpanded(expanded) {
  tocIntroBody.classList.toggle('hidden', !expanded);
  tocIntroToggle.classList.toggle('expanded', expanded);
  tocIntroToggle.setAttribute('aria-expanded', String(expanded));
}

function toggleIntro() {
  setIntroExpanded(tocIntroBody.classList.contains('hidden'));
}

function toggleTOC(show) {
  if (show === undefined) {
    tocSidebar.classList.toggle('hidden');
  } else {
    tocSidebar.classList.toggle('hidden', !show);
  }
}

function toggleSettingsPanel(show) {
  if (show === undefined) {
    settingsOverlay.classList.toggle('hidden');
  } else {
    settingsOverlay.classList.toggle('hidden', !show);
  }
}

closeTocBtn.addEventListener('click', () => toggleTOC(false));
tocIntroToggle.addEventListener('click', toggleIntro);
// 目录点击 / 键盘导航
tocList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) scrollToChapter(parseInt(li.dataset.index, 10));
});

tocList.addEventListener('keydown', (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  const items = [...tocList.children];
  const index = items.indexOf(li);

  const focusAt = (nextIndex) => {
    const target = items[Math.max(0, Math.min(items.length - 1, nextIndex))];
    if (!target) return;
    items.forEach((item) => { item.tabIndex = item === target ? 0 : -1; });
    target.focus();
  };

  if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(index + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(index - 1); }
  else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
  else if (e.key === 'End') { e.preventDefault(); focusAt(items.length - 1); }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    scrollToChapter(index);
    focusAt(index);
  }
});

// ========== 段评交互 ==========
notesBtn.addEventListener('click', openChapterNotesDrawer);
closeNotesBtn.addEventListener('click', closeNotesDrawer);

// 抽屉内 Tab 焦点循环
notesDrawer.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusables = [...notesDrawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// 段尾角标 / 有段评的段落点击（事件委托，章节区块滚动重建后依然有效）
contentDiv.addEventListener('click', (event) => {
  if (!notesVisible()) return;

  const pill = event.target.closest('.note-pill');
  if (pill) {
    event.preventDefault();
    openNoteForPill(pill);
    return;
  }

  // 整段可点；正在选中文字（复制）时不触发
  const paragraph = event.target.closest('p[data-para]');
  if (!paragraph) return;

  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;

  const section = paragraph.closest('.chapter-section');
  if (!section) return;

  const chapterIndex = Number(section.dataset.chapterIndex);
  const para = Number(paragraph.dataset.para);
  if (!Number.isFinite(chapterIndex) || !Number.isFinite(para)) return;

  const notes = notesCache.get(chapterIndex);
  const hasSpan = notes && (notes.spans || []).some(span => span.para === para);
  if (!hasSpan) return;

  openParagraphNotes(chapterIndex, para);
});

// ========== 设置面板 ==========
settingsBtn.addEventListener('click', () => {
  toggleSettingsPanel(true);
});

closeSettingsBtn.addEventListener('click', () => toggleSettingsPanel(false));
// 点击遮罩关闭设置面板
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    toggleSettingsPanel(false);
  }
});

fontDecreaseBtn.addEventListener('click', () => {
  if (settings.fontSize > 14) {
    settings.fontSize -= 2;
    applySettings();
  }
});

fontIncreaseBtn.addEventListener('click', () => {
  if (settings.fontSize < 28) {
    settings.fontSize += 2;
    applySettings();
  }
});

lineHeightSlider.addEventListener('input', () => {
  settings.lineHeight = parseFloat(lineHeightSlider.value);
  lineHeightValue.textContent = settings.lineHeight;
});

// 字体输入框实时更新
fontFamilyInput.addEventListener('input', () => {
  settings.fontFamily = fontFamilyInput.value;
  applySettings();
});

// 自定义样式实时更新
extraCssInput.addEventListener('input', () => {
  settings.extraCss = extraCssInput.value;
  applySettings();
});

autoReadRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'off') {
      settings.autoScroll = false;
      settings.autoScrollSpeed = null;
      stopAutoScroll();
    } else {
      settings.autoScroll = true;
      settings.autoScrollSpeed = parseInt(radio.value);
      startAutoScroll();
    }
    saveProgress();
  });
});

saveSettingsBtn.addEventListener('click', async () => {
  // 保存字体和自定义样式
  settings.fontFamily = fontFamilyInput.value;
  settings.extraCss = extraCssInput.value;

  await saveSettings(settings);
  settingsOverlay.classList.add('hidden');
  showToast('设置已保存');
});

// ========== 设置保存 ==========

// ========== 滚动事件 ==========
readerMain.addEventListener('scroll', () => {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveProgress, 500);

  if (scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(() => {
    handleScroll();
    scrollTicking = false;
  });
});

// 页面可见性变化
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveProgress();
    if (speechState !== 'stopped') {
      stopSpeech();
    }
  }
});

// 窗口尺寸变化时重新贴右
window.addEventListener('resize', () => {
  syncDrawerPalette();
});

// 初始化
init();



