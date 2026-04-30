// 阅读器页面逻辑
import { SKINS, convertChinese, applyReplaceRules } from '../shared/constants.js';
import { escapeHtml } from '../shared/utils.js';
import { getBook as fetchBook, getSettings, saveSettings, updateProgress } from '../shared/storage.js';

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

// Storage API wrappers - 使用 shared/storage.js
// getBook, getSettings, saveSettings, updateProgress 已从 shared/storage.js 导入


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
  if (settings.chineseConversion === 'to-tw' || settings.chineseConversion === 'to-cn') {
    result = convertChinese(result, settings.chineseConversion);
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
  const processedTitle = processContent(nextChapter.title);
  const chapterHtml = `<div class="chapter-section" data-chapter-index="${loadedChapterCount}">
    <h2 class="chapter-title">${escapeHtml(processedTitle)}</h2>
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

  // 清除预加载缓冲
  clearBufferContent();

  // 记录当前章节
  currentChapterIndex = index;

  // 检查目标章节是否已加载到 DOM 中
  const targetChapter = contentDiv.querySelector(`[data-chapter-index="${index}"]`);
  if (targetChapter) {
    // 章节已加载，直接滚动到目标位置
    readerMain.scrollTop = targetChapter.offsetTop - 20;
  } else {
    // 章节未加载，重新渲染所有内容
    rebuildContent(index);
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
    const processedTitle = processContent(chapter.title);
    const chapterHtml = `<div class="chapter-section" data-chapter-index="${i}">
      <h2 class="chapter-title">${escapeHtml(processedTitle)}</h2>
      ${splitToParagraphs(processedContent)}
    </div>`;
    contentDiv.insertAdjacentHTML('beforeend', chapterHtml);
  }

  // 已加载章节数
  loadedChapterCount = targetIndex + 1;

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
  // 处理标题（繁简转换）
  const processedTitle = processContent(chapter.title);

  // 使用章节区块结构（支持滚动加载）
  contentDiv.innerHTML = `<div class="chapter-section" data-chapter-index="${currentChapterIndex}">
    <h2 class="chapter-title">${escapeHtml(processedTitle)}</h2>
    ${splitToParagraphs(processedContent)}
  </div>`;

  // 重置已加载章节计数（基于当前章节位置，这样才能正确加载后续章节）
  loadedChapterCount = currentChapterIndex + 1;

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
    <li data-index="${index}" class="${index === currentChapterIndex ? 'active' : ''}">${escapeHtml(processContent(ch.title))}</li>
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

// ========== 设置保存 ==========

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