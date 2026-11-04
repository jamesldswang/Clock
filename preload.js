const { ipcRenderer, webFrame } = require('electron');

// 計時結束跳 alert 前先把視窗叫出來
webFrame.executeJavaScript(`(() => {
  const orig = window.alert.bind(window);
  window.alert = (msg) => { window.__clockApp.pin(); orig(msg); window.__clockApp.unpin(); };
})()`);

window.addEventListener('DOMContentLoaded', () => {
  // 右上角顯示版號
  const ver = document.createElement('span');
  ver.className = 'app-version';
  ver.textContent = 'v' + ipcRenderer.sendSync('get-version');
  document.querySelector('.window-controls')?.appendChild(ver);

  // 紅點 / 黃點 = 隱藏視窗
  document.querySelector('.dot-close')?.addEventListener('click', () => ipcRenderer.send('win', 'hide'));
  document.querySelector('.dot-min')?.addEventListener('click', () => ipcRenderer.send('win', 'hide'));
});

require('electron').contextBridge.exposeInMainWorld('__clockApp', {
  show: () => ipcRenderer.send('win', 'show'),
  pin: () => ipcRenderer.send('win', 'pin'),
  unpin: () => ipcRenderer.send('win', 'unpin'),
});
