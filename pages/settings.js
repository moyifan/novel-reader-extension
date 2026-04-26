// 设置页面逻辑

let settings = null;

const fontDecreaseBtn = document.getElementById('fontDecrease');
const fontIncreaseBtn = document.getElementById('fontIncrease');
const fontSizeValue = document.getElementById('fontSizeValue');
const lineHeightSlider = document.getElementById('lineHeightSlider');
const themeBtns = document.querySelectorAll('.theme-btn');
const pageFlipRadios = document.querySelectorAll('input[name="pageFlip"]');
const autoReadRadios = document.querySelectorAll('input[name="autoRead"]');
const saveBtn = document.getElementById('saveBtn');
const toast = document.getElementById('toast');

function getSettings() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve));
}

function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, resolve));
}

async function init() {
  settings = await getSettings();
  applyToUI();
}

function applyToUI() {
  fontSizeValue.textContent = settings.fontSize + 'px';
  lineHeightSlider.value = settings.lineHeight;

  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });

  pageFlipRadios.forEach(radio => {
    radio.checked = radio.value === settings.pageFlip;
  });

  autoReadRadios.forEach(radio => {
    const value = settings.autoScroll ? String(settings.autoScrollSpeed || '30') : 'off';
    radio.checked = radio.value === value;
  });
}

fontDecreaseBtn.addEventListener('click', () => {
  if (settings.fontSize > 14) {
    settings.fontSize -= 2;
    fontSizeValue.textContent = settings.fontSize + 'px';
  }
});

fontIncreaseBtn.addEventListener('click', () => {
  if (settings.fontSize < 24) {
    settings.fontSize += 2;
    fontSizeValue.textContent = settings.fontSize + 'px';
  }
});

lineHeightSlider.addEventListener('change', (e) => {
  settings.lineHeight = parseFloat(e.target.value);
});

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    settings.theme = btn.dataset.theme;
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

pageFlipRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    settings.pageFlip = e.target.value;
  });
});

autoReadRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'off') {
      settings.autoScroll = false;
      settings.autoScrollSpeed = null;
    } else {
      settings.autoScroll = true;
      settings.autoScrollSpeed = parseInt(e.target.value);
    }
  });
});

saveBtn.addEventListener('click', async () => {
  await saveSettings(settings);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
});

init();