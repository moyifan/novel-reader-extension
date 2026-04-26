// 设置页面逻辑
import { DEFAULT_SETTINGS, SKINS } from '../shared/constants.js';

let settings = null;

// DOM 元素
const fontSizeDisplay = document.getElementById('fontSizeDisplay');
const fontSizeSlider = document.getElementById('fontSize');
const lineHeightDisplay = document.getElementById('lineHeightDisplay');
const lineHeightSlider = document.getElementById('lineHeight');
const paragraphHeightDisplay = document.getElementById('paragraphHeightDisplay');
const paragraphHeightSlider = document.getElementById('paragraphHeight');
const contentWidthInput = document.getElementById('contentWidth');
const fontFamilySelect = document.getElementById('fontFamily');
const extraCssTextarea = document.getElementById('extraCss');
const skinGrid = document.getElementById('skinGrid');
const chineseConversionRadios = document.querySelectorAll('input[name="chineseConversion"]');
const customReplaceRulesTextarea = document.getElementById('customReplaceRules');
const quietModeKeyInput = document.getElementById('quietModeKey');
const openPreferencesKeyInput = document.getElementById('openPreferencesKey');
const hideMenuListKeyInput = document.getElementById('hideMenuListKey');
const openSpeechKeyInput = document.getElementById('openSpeechKey');
const speechRateDisplay = document.getElementById('speechRateDisplay');
const speechRateSlider = document.getElementById('speechRate');
const speechPitchDisplay = document.getElementById('speechPitchDisplay');
const speechPitchSlider = document.getElementById('speechPitch');
const menuListHiddenCheckbox = document.getElementById('menuListHidden');
const hidePreferencesButtonCheckbox = document.getElementById('hidePreferencesButton');
const dblclickPauseCheckbox = document.getElementById('dblclickPause');
const scrollAnimateCheckbox = document.getElementById('scrollAnimate');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');

function getSettings() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve));
}

function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, resolve));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

async function init() {
  settings = await getSettings();
  applyToUI();
  bindEvents();
}

function applyToUI() {
  // 字体排版
  fontSizeSlider.value = settings.fontSize || 18;
  fontSizeDisplay.textContent = (settings.fontSize || 18) + 'px';

  lineHeightSlider.value = settings.lineHeight || 1.8;
  lineHeightDisplay.textContent = settings.lineHeight || 1.8;

  paragraphHeightSlider.value = parseFloat(settings.paragraphHeight || '1');
  paragraphHeightDisplay.textContent = settings.paragraphHeight || '1em';

  contentWidthInput.value = settings.contentWidth || '800px';
  fontFamilySelect.value = settings.fontFamily || 'Source Han Serif SC';
  extraCssTextarea.value = settings.extraCss || '';

  // 皮肤
  skinGrid.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skin === (settings.skinName || '缺省皮肤'));
  });

  // 繁简转换
  chineseConversionRadios.forEach(radio => {
    radio.checked = radio.value === (settings.chineseConversion || 'disable');
  });
  customReplaceRulesTextarea.value = settings.customReplaceRules || '';

  // 快捷键
  quietModeKeyInput.value = settings.quietModeKey || 'q';
  openPreferencesKeyInput.value = settings.openPreferencesKey || 's';
  hideMenuListKeyInput.value = settings.hideMenuListKey || 'c';
  openSpeechKeyInput.value = settings.openSpeechKey || 'a';

  // 语音
  speechRateSlider.value = settings.speechRate || 1;
  speechRateDisplay.textContent = settings.speechRate || 1;
  speechPitchSlider.value = settings.speechPitch || 1;
  speechPitchDisplay.textContent = settings.speechPitch || 1;

  // 界面控制
  menuListHiddenCheckbox.checked = settings.menuListHidden || false;
  hidePreferencesButtonCheckbox.checked = settings.hidePreferencesButton || false;
  dblclickPauseCheckbox.checked = settings.dblclickPause !== false;
  scrollAnimateCheckbox.checked = settings.scrollAnimate || false;
}

function bindEvents() {
  // 字体大小
  fontSizeSlider.addEventListener('input', () => {
    settings.fontSize = parseInt(fontSizeSlider.value);
    fontSizeDisplay.textContent = settings.fontSize + 'px';
  });

  document.getElementById('fontDecrease').addEventListener('click', () => {
    if (settings.fontSize > 14) {
      settings.fontSize -= 2;
      fontSizeSlider.value = settings.fontSize;
      fontSizeDisplay.textContent = settings.fontSize + 'px';
    }
  });

  document.getElementById('fontIncrease').addEventListener('click', () => {
    if (settings.fontSize < 28) {
      settings.fontSize += 2;
      fontSizeSlider.value = settings.fontSize;
      fontSizeDisplay.textContent = settings.fontSize + 'px';
    }
  });

  // 行高
  lineHeightSlider.addEventListener('input', () => {
    settings.lineHeight = parseFloat(lineHeightSlider.value);
    lineHeightDisplay.textContent = settings.lineHeight;
  });

  // 段落间距
  paragraphHeightSlider.addEventListener('input', () => {
    settings.paragraphHeight = paragraphHeightSlider.value + 'em';
    paragraphHeightDisplay.textContent = settings.paragraphHeight;
  });

  // 其他输入
  contentWidthInput.addEventListener('change', () => {
    settings.contentWidth = contentWidthInput.value;
  });

  fontFamilySelect.addEventListener('change', () => {
    settings.fontFamily = fontFamilySelect.value;
  });

  extraCssTextarea.addEventListener('change', () => {
    settings.extraCss = extraCssTextarea.value;
  });

  // 皮肤选择
  skinGrid.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.skinName = btn.dataset.skin;
      skinGrid.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 繁简转换
  chineseConversionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      settings.chineseConversion = radio.value;
    });
  });

  customReplaceRulesTextarea.addEventListener('change', () => {
    settings.customReplaceRules = customReplaceRulesTextarea.value;
  });

  // 快捷键
  quietModeKeyInput.addEventListener('change', () => {
    settings.quietModeKey = quietModeKeyInput.value.toLowerCase();
  });

  openPreferencesKeyInput.addEventListener('change', () => {
    settings.openPreferencesKey = openPreferencesKeyInput.value.toLowerCase();
  });

  hideMenuListKeyInput.addEventListener('change', () => {
    settings.hideMenuListKey = hideMenuListKeyInput.value.toLowerCase();
  });

  openSpeechKeyInput.addEventListener('change', () => {
    settings.openSpeechKey = openSpeechKeyInput.value.toLowerCase();
  });

  // 语音
  speechRateSlider.addEventListener('input', () => {
    settings.speechRate = parseFloat(speechRateSlider.value);
    speechRateDisplay.textContent = settings.speechRate;
  });

  speechPitchSlider.addEventListener('input', () => {
    settings.speechPitch = parseFloat(speechPitchSlider.value);
    speechPitchDisplay.textContent = settings.speechPitch;
  });

  // 界面控制
  menuListHiddenCheckbox.addEventListener('change', () => {
    settings.menuListHidden = menuListHiddenCheckbox.checked;
  });

  hidePreferencesButtonCheckbox.addEventListener('change', () => {
    settings.hidePreferencesButton = hidePreferencesButtonCheckbox.checked;
  });

  dblclickPauseCheckbox.addEventListener('change', () => {
    settings.dblclickPause = dblclickPauseCheckbox.checked;
  });

  scrollAnimateCheckbox.addEventListener('change', () => {
    settings.scrollAnimate = scrollAnimateCheckbox.checked;
  });

  // 保存
  saveBtn.addEventListener('click', async () => {
    await saveSettings(settings);
    showToast('设置已保存');
  });

  // 恢复默认
  resetBtn.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    applyToUI();
    showToast('已恢复默认设置');
  });
}

init();
