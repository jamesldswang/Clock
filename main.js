const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, shell } = require('electron');
const path = require('path');

const HOTKEY = 'Control+Alt+C'; // Fn 鍵 Windows 偵測不到，改用 Ctrl+Alt+C

let win, tray, pinned = false;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin());

const APP_CSS = `
  html, body { background: transparent !important; }
  body { padding: 0 !important; min-height: 100vh; overflow: hidden; }
  .window { border-radius: 16px; }
  .header { -webkit-app-region: drag; }
  .nav-tabs, .dot, button, input, select { -webkit-app-region: no-drag; }
  .dot { cursor: pointer; }
  .window-controls { align-items: center; }
  .app-version { margin-left: auto; font-size: 11px; color: #636366; letter-spacing: 0.3px; }
`;

function createWindow() {
  win = new BrowserWindow({
    width: 420, height: 640,
    frame: false, transparent: true, resizable: false,
    show: false, skipTaskbar: true, alwaysOnTop: true,
    icon: trayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // 隱藏時碼錶/計時器照常運作
      autoplayPolicy: 'no-user-gesture-required', // 鬧鐘沒有點擊也能出聲
    },
  });
  win.loadFile(path.join(__dirname, 'clock.html'));
  win.webContents.on('did-finish-load', () => win.webContents.insertCSS(APP_CSS));
  // 「加到 Google 日曆」等外部連結：用預設瀏覽器打開，不在 App 裡開新視窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://calendar.google.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('blur', () => { if (!pinned && !win.webContents.isDevToolsOpened()) win.hide(); });
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function showWin() {
  if (!win) return;
  const { x, y, width, height } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setPosition(Math.round(x + (width - 420) / 2), Math.round(y + (height - 640) / 2));
  win.show();
  win.focus();
}

function toggleWin() { win.isVisible() && win.isFocused() ? win.hide() : showWin(); }

// Windows 的 nativeImage 不支援 SVG（會變成空白灰框），所以直接畫成點陣圖。
// 設計座標是 32x32：橘色外圈、深色錶面、白色指針。
function drawIconBitmap(size) {
  const k = size / 32, SS = 4; // 每個像素取 4x4 個樣本做反鋸齒
  const buf = Buffer.alloc(size * size * 4);
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = (x + (sx + 0.5) / SS) / k, py = (y + (sy + 0.5) / SS) / k;
      const d = Math.hypot(px - 16, py - 16);
      let c = null;
      if (segDist(px, py, 16, 9, 16, 16) <= 1.25 || segDist(px, py, 16, 16, 21, 19) <= 1.25) c = [255, 255, 255];
      else if (d <= 11) c = [0x1e, 0x1e, 0x1e];
      else if (d <= 14) c = [0xff, 0x9f, 0x0a];
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const n = SS * SS, i = (y * size + x) * 4;
    // BGRA、預乘 alpha
    buf[i] = b / n; buf[i + 1] = g / n; buf[i + 2] = r / n; buf[i + 3] = (a / n) * 255;
  }
  return buf;
}

function trayIcon(size = 32) {
  return nativeImage.createFromBitmap(drawIconBitmap(size), { width: size, height: size });
}

function loginItemArgs() {
  return app.isPackaged ? [] : [path.resolve(__dirname)];
}

function buildTrayMenu() {
  const openAtLogin = app.getLoginItemSettings({
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: loginItemArgs(),
  }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `時鐘 v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: `顯示時鐘 (Ctrl+Alt+C)`, click: showWin },
    { label: '開機自動啟動', type: 'checkbox', checked: openAtLogin, click: (item) => {
        // portable 版要記錄 .exe 本身的位置，不能用解壓到暫存資料夾的路徑
        const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
        app.setLoginItemSettings({ openAtLogin: item.checked, path: exePath, args: loginItemArgs() });
      } },
    { type: 'separator' },
    { label: '結束', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  ipcMain.on('get-version', (e) => { e.returnValue = app.getVersion(); });
  createWindow();

  // 16px 給一般螢幕，另外附 32px 給高解析度（150%/200% 縮放）螢幕
  const trayImg = trayIcon(16);
  trayImg.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: drawIconBitmap(32) });
  tray = new Tray(trayImg);
  tray.setToolTip(`時鐘 v${app.getVersion()} — Ctrl+Alt+C`);
  tray.on('click', toggleWin);
  buildTrayMenu();

  if (!globalShortcut.register(HOTKEY, toggleWin)) {
    console.error('快捷鍵註冊失敗，可能被其他程式佔用：' + HOTKEY);
  }

  ipcMain.on('win', (_e, action) => {
    if (action === 'hide') win.hide();
    if (action === 'show') showWin();
    if (action === 'pin') { pinned = true; showWin(); }
    if (action === 'unpin') pinned = false;
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
