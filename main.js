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

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="#ff9f0a"/><circle cx="16" cy="16" r="11" fill="#1e1e1e"/>
    <path d="M16 9v7l5 3" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
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

  tray = new Tray(trayIcon().resize({ width: 16, height: 16 }));
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
