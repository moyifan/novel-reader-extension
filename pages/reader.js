// 阅读器页面逻辑

let book = null;
let settings = null;
let currentChapterIndex = 0;
let autoScrollTimer = null;
let scrollSaveTimer = null;

// DOM 元素
const bookTitle = document.getElementById('bookTitle');
const chapterTitle = document.getElementById('chapterTitle');
const contentDiv = document.getElementById('content');
const progressSpan = document.getElementById('progress');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const menuBtn = document.getElementById('menuBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const settingsBtn = document.getElementById('settingsBtn');
const closeBtn = document.getElementById('closeBtn');
const tocPanel = document.getElementById('tocPanel');
const closeTocBtn = document.getElementById('closeToc');
const tocList = document.getElementById('tocList');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsBtn = document.getElementById('closeSettings');
const fontDecreaseBtn = document.getElementById('fontDecrease');
const fontIncreaseBtn = document.getElementById('fontIncrease');
const fontSizeValue = document.getElementById('fontSizeValue');
const lineHeightSlider = document.getElementById('lineHeightSlider');
const themeBtns = document.querySelectorAll('.theme-btn');
const pageFlipRadios = document.querySelectorAll('input[name="pageFlip"]');
const autoReadRadios = document.querySelectorAll('input[name="autoRead"]');
const saveSettingsBtn = document.getElementById('saveSettings');
const bookmarksOverlay = document.getElementById('bookmarksOverlay');
const closeBookmarksBtn = document.getElementById('closeBookmarks');
const bookmarksList = document.getElementById('bookmarksList');
const toast = document.getElementById('toast');

// Storage API wrappers
function getBook(bookId) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_BOOK', bookId }, resolve));
}

function getSettings() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve));
}

function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, resolve));
}

function updateProgress(bookId, chapterIndex, scrollPercent) {
  return new Promise((resolve) => chrome.runtime.sendMessage({
    type: 'UPDATE_PROGRESS', bookId, chapterIndex, scrollPercent
  }, resolve));
}

function getBookmarks(bookId) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS', bookId }, resolve));
}

function addBookmark(bookmark) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'ADD_BOOKMARK', bookmark }, resolve));
}

function deleteBookmark(bookmarkId) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId }, resolve));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function showToast(toastElement, message) {
  toastElement.textContent = message;
  toastElement.classList.remove('hidden');
  setTimeout(() => toastElement.classList.add('hidden'), 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function splitToParagraphs(content) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

// 初始化
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const bookId = urlParams.get('bookId');

  if (!bookId) {
    showToast(toast, '未指定书籍');
    return;
  }

  book = await getBook(bookId);
  if (!book) {
    showToast(toast, '书籍不存在');
    return;
  }

  settings = await getSettings();
  applySettings();
  currentChapterIndex = book.lastChapterIndex || 0;
  renderBook();
  renderTOC();
}

// 应用设置到页面
function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
  document.documentElement.style.setProperty('--line-height', settings.lineHeight);
  fontSizeValue.textContent = settings.fontSize + 'px';
  lineHeightSlider.value = settings.lineHeight;

  themeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === settings.theme));
  pageFlipRadios.forEach(radio => radio.checked = radio.value === settings.pageFlip);
  autoReadRadios.forEach(radio => {
    const value = settings.autoScroll ? String(settings.autoScrollSpeed || '30') : 'off';
    radio.checked = radio.value === value;
  });
}

// 渲染书籍
function renderBook() {
  bookTitle.textContent = book.name;
  const chapter = book.chapters[currentChapterIndex];
  if (!chapter) return;

  chapterTitle.textContent = chapter.title;
  contentDiv.innerHTML = splitToParagraphs(chapter.content);
  progressSpan.textContent = `${currentChapterIndex + 1} / ${book.totalChapters}`;
  prevBtn.disabled = currentChapterIndex === 0;
  nextBtn.disabled = currentChapterIndex >= book.totalChapters - 1;
}

// 渲染目录
function renderTOC() {
  tocList.innerHTML = book.chapters.map((ch, index) => `
    <li data-index="${index}" class="${index === currentChapterIndex ? 'active' : ''}">${ch.title}</li>
  `).join('');

  tocList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      goToChapter(parseInt(li.dataset.index));
      closeTOC();
    });
  });
}

// 跳转到章节
function goToChapter(index) {
  if (index < 0 || index >= book.totalChapters) return;
  currentChapterIndex = index;
  renderBook();
  renderTOC();
  saveProgress();
  window.scrollTo(0, 0);
}

// 保存阅读进度
function saveProgress() {
  const scrollHeight = document.body.scrollHeight - window.innerHeight;
  const scrollPercent = scrollHeight > 0 ? (window.scrollY / scrollHeight) * 100 : 0;
  updateProgress(book.id, currentChapterIndex, scrollPercent);

  if (settings.autoScroll && settings.autoScrollSpeed) {
    startAutoScroll();
  } else {
    stopAutoScroll();
  }
}

// 自动滚动
function startAutoScroll() {
  stopAutoScroll();
  autoScrollTimer = setInterval(() => window.scrollBy(0, 50), 1000);
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
}

// 添加书签
bookmarkBtn.addEventListener('click', async () => {
  const bookmark = {
    id: generateId(),
    bookId: book.id,
    chapterIndex: currentChapterIndex,
    scrollPosition: window.scrollY,
    createdAt: Date.now(),
    note: book.chapters[currentChapterIndex]?.title || ''
  };
  await addBookmark(bookmark);
  showToast(toast, '书签已添加');
});

// 显示书签列表
bookmarkBtn.addEventListener('dblclick', async () => {
  bookmarksOverlay.classList.remove('hidden');
  renderBookmarks(await getBookmarks(book.id));
});

// 设置按钮
settingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));

fontDecreaseBtn.addEventListener('click', () => {
  if (settings.fontSize > 14) { settings.fontSize -= 2; applySettings(); }
});
fontIncreaseBtn.addEventListener('click', () => {
  if (settings.fontSize < 24) { settings.fontSize += 2; applySettings(); }
});
lineHeightSlider.addEventListener('change', (e) => { settings.lineHeight = parseFloat(e.target.value); applySettings(); });

themeBtns.forEach(btn => btn.addEventListener('click', () => { settings.theme = btn.dataset.theme; applySettings(); }));

pageFlipRadios.forEach(radio => radio.addEventListener('change', (e) => { settings.pageFlip = e.target.value; }));

autoReadRadios.forEach(radio => radio.addEventListener('change', (e) => {
  if (e.target.value === 'off') { settings.autoScroll = false; settings.autoScrollSpeed = null; }
  else { settings.autoScroll = true; settings.autoScrollSpeed = parseInt(e.target.value); }
  saveProgress();
}));

saveSettingsBtn.addEventListener('click', async () => {
  await saveSettings(settings);
  settingsOverlay.classList.add('hidden');
  showToast(toast, '设置已保存');
});

closeBookmarksBtn.addEventListener('click', () => bookmarksOverlay.classList.add('hidden'));

function renderBookmarks(bookmarks) {
  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = '<li style="text-align:center;color:#999;">暂无书签</li>';
    return;
  }
  bookmarksList.innerHTML = bookmarks.map(bm => `
    <li data-id="${bm.id}" data-index="${bm.chapterIndex}">
      <span class="bookmark-chapter">第 ${bm.chapterIndex + 1} 章</span>
      <span class="bookmark-note">${bm.note}</span>
      <span class="bookmark-delete" data-delete-id="${bm.id}">删除</span>
    </li>
  `).join('');

  bookmarksList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('bookmark-delete')) {
        e.stopPropagation();
        deleteBookmarkById(e.target.dataset.deleteId);
        return;
      }
      goToChapter(parseInt(li.dataset.index));
      bookmarksOverlay.classList.add('hidden');
    });
  });
}

async function deleteBookmarkById(id) {
  await deleteBookmark(id);
  renderBookmarks(await getBookmarks(book.id));
}

// 关闭按钮
closeBtn.addEventListener('click', () => window.close());

// 点击翻页
contentDiv.addEventListener('click', (e) => {
  if (settings.pageFlip !== 'click') return;
  const rect = contentDiv.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  goToChapter(clickY < rect.height / 2 ? currentChapterIndex - 1 : currentChapterIndex + 1);
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') goToChapter(currentChapterIndex - 1);
  else if (e.key === 'ArrowRight') goToChapter(currentChapterIndex + 1);
  else if (e.key === 'Escape') {
    settingsOverlay.classList.add('hidden');
    bookmarksOverlay.classList.add('hidden');
    if (!tocPanel.classList.contains('hidden')) closeTOC();
  }
});

// 滚动保存
window.addEventListener('scroll', () => {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveProgress, 500);
});

// 页面可见性变化
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveProgress();
});

// 目录
menuBtn.addEventListener('click', () => tocPanel.classList.toggle('hidden'));
closeTocBtn.addEventListener('click', closeTOC);
function closeTOC() { tocPanel.classList.add('hidden'); }

init();