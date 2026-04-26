// 阅读器页面逻辑
import { SKINS, convertChinese, applyReplaceRules } from '../shared/constants.js';
import { escapeHtml } from '../shared/utils.js';

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
const settingsBtn = document.getElementById('settingsBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
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
const themeBtns = document.querySelectorAll('.theme-btn');
const autoReadRadios = document.querySelectorAll('input[name="autoRead"]');
const saveSettingsBtn = document.getElementById('saveSettings');
const bookmarksOverlay = document.getElementById('bookmarksOverlay');
const closeBookmarksBtn = document.getElementById('closeBookmarks');
const bookmarksList = document.getElementById('bookmarksList');
const toast = document.getElementById('toast');

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


function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

function processContent(text) {
  let result = text;

  // 应用自定义替换规则
  if (settings.customReplaceRules) {
    result = applyReplaceRules(result, settings.customReplaceRules);
  }

  // 繁简转换
  if (settings.chineseConversion === 'to-tw') {
    result = convertChinese(result, 'to-tw');
  }

  return result;
}

function splitToParagraphs(content, options = {}) {
  const lines = content.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      result.push('<p>' + escapeHtml(trimmed) + '</p>');
    }
  }

  return result.join('\n');
}

// 滚动加载和目录联动逻辑
let isLoadingNextChapter = false; // 防止重复加载
let loadedChapterCount = 1; // 已加载的章节数量（默认第一章）

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

  // 更新目录高亮
  updateTOCByScroll();
}

// 加载下一章内容（追加到当前内容底部）
function loadNextChapter() {
  // 已经是最后一章
  if (loadedChapterCount >= book.totalChapters) {
    showToast('已到达最后一章');
    return;
  }

  isLoadingNextChapter = true;

  // 获取下一章内容（基于已加载的章节数量）
  const nextChapter = book.chapters[loadedChapterCount];
  if (!nextChapter) {
    isLoadingNextChapter = false;
    return;
  }

  const processedContent = processContent(nextChapter.content);
  const chapterHtml = `<div class="chapter-section" data-chapter-index="${loadedChapterCount}">
    <h2 class="chapter-title">${escapeHtml(nextChapter.title)}</h2>
    ${splitToParagraphs(processedContent)}
  </div>`;

  contentDiv.insertAdjacentHTML('beforeend', chapterHtml);

  // 更新已加载章节计数
  loadedChapterCount++;

  isLoadingNextChapter = false;
}

// 根据滚动位置更新目录高亮
function updateTOCByScroll() {
  const scrollTop = readerMain.scrollTop;
  const clientHeight = readerMain.clientHeight;
  const viewportMiddle = scrollTop + clientHeight / 2; // 视口中间位置

  // 获取所有章节区块
  const chapters = contentDiv.querySelectorAll('.chapter-section');
  if (!chapters.length) return;

  let activeIndex = 0;

  // 找出当前视口中点的章节
  chapters.forEach((chapter, index) => {
    const rect = chapter.getBoundingClientRect();
    const chapterTop = rect.top + scrollTop - readerMain.offsetTop;
    const chapterBottom = chapterTop + rect.height;

    // 如果视口中间在这个章节的范围内
    if (viewportMiddle >= chapterTop && viewportMiddle < chapterBottom) {
      activeIndex = index;
    }
  });

  // 如果视口中间在最后一个章节之后
  const lastChapter = chapters[chapters.length - 1];
  if (lastChapter) {
    const lastRect = lastChapter.getBoundingClientRect();
    const lastTop = lastRect.top + scrollTop - readerMain.offsetTop;
    if (viewportMiddle >= lastTop + lastRect.height) {
      activeIndex = chapters.length - 1;
    }
  }

  // 更新 currentChapterIndex
  const chapterIndex = parseInt(chapters[activeIndex].dataset.chapterIndex) || activeIndex;
  if (chapterIndex !== currentChapterIndex) {
    currentChapterIndex = chapterIndex;
    // 只更新目录高亮，不重新渲染内容
    renderTOC();
  }
}

// 跳转到指定章节（目录点击时调用）
function scrollToChapter(index) {
  if (index < 0 || index >= book.totalChapters) return;

  // 清除预加载缓冲
  clearBufferContent();

  // 记录当前章节
  currentChapterIndex = index;

  // 如果目标章节还未加载，需要先加载之前的章节
  if (index >= loadedChapterCount) {
    // 重新渲染所有内容
    rebuildContent(index);
  } else {
    // 内容已加载，直接滚动到目标位置
    const targetChapter = contentDiv.querySelector(`[data-chapter-index="${index}"]`);
    if (targetChapter) {
      const rect = targetChapter.getBoundingClientRect();
      readerMain.scrollTop = rect.top + readerMain.scrollTop - readerMain.offsetTop - 20;
    }
  }

  // 更新目录高亮
  renderTOC();
}

// 重建内容（当点击目录跳转到未加载的章节时）
function rebuildContent(targetIndex) {
  // 清除现有内容
  contentDiv.innerHTML = '';
  loadedChapterCount = 1;

  // 重新渲染从第一章到目标章节的所有内容
  for (let i = 0; i <= targetIndex; i++) {
    const chapter = book.chapters[i];
    const processedContent = processContent(chapter.content);
    const chapterHtml = `<div class="chapter-section" data-chapter-index="${i}">
      <h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>
      ${splitToParagraphs(processedContent)}
    </div>`;
    contentDiv.insertAdjacentHTML('beforeend', chapterHtml);
    loadedChapterCount = i + 2;
  }

  // 滚动到目标章节
  const targetChapter = contentDiv.querySelector(`[data-chapter-index="${targetIndex}"]`);
  if (targetChapter) {
    readerMain.scrollTop = targetChapter.offsetTop - 20;
  }
}

// 清除预加载的缓冲内容
function clearBufferContent() {
  contentDiv.querySelectorAll('.chapter-buffer').forEach(el => el.remove());
}

// 应用皮肤
function applySkin(skinName) {
  const skinCss = SKINS[skinName] || '';
  let skinStyle = document.getElementById('skin-style');
  if (!skinStyle) {
    skinStyle = document.createElement('style');
    skinStyle.id = 'skin-style';
    document.head.appendChild(skinStyle);
  }
  skinStyle.textContent = skinCss;
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

  book = await getBook(bookId);
  if (!book) {
    showToast('书籍不存在');
    return;
  }

  settings = await getSettings();
  applySettings();
  currentChapterIndex = book.lastChapterIndex || 0;

  renderBook();
  renderTOC();
  initSpeech();
  initKeyboardShortcuts();
  initSettingInputs();

  // 恢复滚动位置
  setTimeout(() => {
    if (book.lastScrollPercent) {
      const scrollHeight = readerMain.scrollHeight - readerMain.clientHeight;
      readerMain.scrollTop = (scrollHeight * book.lastScrollPercent) / 100;
    }
  }, 100);
}

// 应用设置到页面
function applySettings() {
  // 应用主题
  document.body.dataset.theme = settings.theme;

  // 应用皮肤
  applySkin(settings.skinName);

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

  // 主题按钮高亮
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });

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
  const chapter = book.chapters[currentChapterIndex];
  if (!chapter) return;

  // 处理内容（繁简转换、拼音字修复）
  const processedContent = processContent(chapter.content);

  // 使用章节区块结构（支持滚动加载）
  contentDiv.innerHTML = `<div class="chapter-section" data-chapter-index="${currentChapterIndex}">
    <h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>
    ${splitToParagraphs(processedContent)}
  </div>`;

  // 重置已加载章节计数
  loadedChapterCount = 1;

  // 更新目录高亮
  renderTOC();

  // 更新语音状态
  if (speechState !== 'stopped') {
    stopSpeech();
  }
}

// 渲染目录
function renderTOC() {
  tocList.innerHTML = book.chapters.map((ch, index) => `
    <li data-index="${index}" class="${index === currentChapterIndex ? 'active' : ''}">${escapeHtml(ch.title)}</li>
  `).join('');

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
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  // 如果在输入框中，不处理快捷键
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const key = e.key.toLowerCase();

  switch (key) {
    case settings.quietModeKey || 'q':
      toggleQuietMode();
      break;
    case settings.openPreferencesKey || 's':
      settingsOverlay.classList.toggle('hidden');
      if (!settingsOverlay.classList.contains('hidden')) {
        bookmarksOverlay.classList.add('hidden');
      }
      break;
    case settings.hideMenuListKey || 'c':
      toggleTOC();
      break;
    case 'escape':
      closeAllPanels();
      break;
  }
}

function closeAllPanels() {
  settingsOverlay.classList.add('hidden');
  bookmarksOverlay.classList.add('hidden');
}

// ========== 目录 ==========
function toggleTOC(show) {
  if (show === undefined) {
    tocSidebar.classList.toggle('hidden');
  } else {
    tocSidebar.classList.toggle('hidden', !show);
  }
}

closeTocBtn.addEventListener('click', () => toggleTOC(false));
// 目录点击事件 - 使用事件委托
tocList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) scrollToChapter(parseInt(li.dataset.index));
});

// ========== 设置面板 ==========
settingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.remove('hidden');
  bookmarksOverlay.classList.add('hidden');
});

closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
// 点击遮罩关闭设置面板
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.add('hidden');
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

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    settings.theme = btn.dataset.theme;
    applySettings();
  });
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

// ========== 书签 ==========
bookmarkBtn.addEventListener('click', async () => {
  const bookmark = {
    id: generateId(),
    bookId: book.id,
    chapterIndex: currentChapterIndex,
    scrollPercent: 0,
    createdAt: Date.now(),
    note: book.chapters[currentChapterIndex]?.title || ''
  };
  await addBookmark(bookmark);
  showToast('书签已添加');
});

bookmarksOverlay.addEventListener('click', (e) => {
  if (e.target === bookmarksOverlay) {
    bookmarksOverlay.classList.add('hidden');
  }
});
closeBookmarksBtn.addEventListener('click', () => bookmarksOverlay.classList.add('hidden'));

function renderBookmarks(bookmarks) {
  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = '<li style="text-align:center;color:#999;padding:20px;">暂无书签</li>';
    return;
  }
  bookmarksList.innerHTML = bookmarks.map(bm => `
    <li data-id="${bm.id}" data-index="${bm.chapterIndex}">
      <span class="bookmark-chapter">第 ${bm.chapterIndex + 1} 章</span>
      <span class="bookmark-note">${escapeHtml(bm.note)}</span>
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
      scrollToChapter(parseInt(li.dataset.index));
      bookmarksOverlay.classList.add('hidden');
    });
  });
}

async function deleteBookmarkById(id) {
  await deleteBookmark(id);
  renderBookmarks(await getBookmarks(book.id));
}

// 双击显示书签列表
bookmarkBtn.addEventListener('dblclick', async () => {
  bookmarksOverlay.classList.remove('hidden');
  renderBookmarks(await getBookmarks(book.id));
});

// ========== 滚动事件 ==========
readerMain.addEventListener('scroll', () => {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveProgress, 500);

  // 处理滚动加载和目录联动
  handleScroll();
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

// 初始化
init();