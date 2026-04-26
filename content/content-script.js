// 内容脚本 - 处理键盘快捷键

// 监听键盘事件
document.addEventListener('keydown', (e) => {
  // 左右方向键翻页
  if (e.key === 'ArrowLeft') {
    const prevBtn = document.querySelector('.prev-btn');
    if (prevBtn && !prevBtn.disabled) {
      prevBtn.click();
    }
  } else if (e.key === 'ArrowRight') {
    const nextBtn = document.querySelector('.next-btn');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.click();
    }
  }
});

// 通知 reader 页面键盘快捷键已启用
window.postMessage({ type: 'KEYBOARD_SHORTCUTS_ENABLED' }, '*');