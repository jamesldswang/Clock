const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, shell } = require('electron');
const path = require('path');
const http = require('http');

const HOTKEY = 'Control+Alt+C'; // Fn 鍵 Windows 偵測不到，改用 Ctrl+Alt+C
// 給外部程式設定鬧鐘的本機 API（只聽 127.0.0.1）；可以用環境變數 CLOCK_API_PORT 換埠號
const API_PORT = Number(process.env.CLOCK_API_PORT) || 17321;
let apiStatus = '啟動中';

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

// --- 本機 API：把請求轉給頁面的 window.clockApi.handle()，鬧鐘資料只在頁面那邊管理 ---
function startApi() {
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body, null, 2));
  };
  const server = http.createServer((req, res) => {
    // 擋掉網頁送來的請求：Host 必須是本機（防 DNS rebinding），而且不能帶 Origin（瀏覽器的跨站請求一定會帶）
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${API_PORT}` && host !== `localhost:${API_PORT}`) return send(res, 403, { error: '只接受 127.0.0.1 或 localhost' });
    if (req.headers.origin) return send(res, 403, { error: '不接受瀏覽器網頁送來的請求' });

    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) { send(res, 413, { error: '內容太大' }); req.destroy(); }
    });
    req.on('end', async () => {
      if (res.writableEnded) return;
      const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
      const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['api', 'alarms', id?]
      if (parts[0] !== 'api') return send(res, 404, { error: '網址要以 /api 開頭，說明請看 GET /api' });
      if (parts.length === 1) {
        return send(res, 200, {
          app: '時鐘', version: require('./package.json').version,
          endpoints: ['GET /api/alarms', 'POST /api/alarms', 'GET /api/alarms/:id', 'PATCH /api/alarms/:id', 'DELETE /api/alarms/:id'],
        });
      }
      if (parts[1] !== 'alarms' || parts.length > 3) return send(res, 404, { error: '找不到這個網址' });
      let id = null;
      if (parts[2] !== undefined) {
        id = Number(parts[2]);
        if (!Number.isInteger(id)) return send(res, 404, { error: 'id 要是數字' });
      }
      let body = null;
      if (raw.trim()) {
        try { body = JSON.parse(raw); } catch { return send(res, 400, { error: '內容不是正確的 JSON' }); }
      }
      try {
        if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
        const r = await win.webContents.executeJavaScript(
          `window.clockApi.handle(${JSON.stringify({ method: req.method, id, body })})`);
        send(res, r.status, r.body);
      } catch (e) {
        send(res, 500, { error: '時鐘頁面處理失敗：' + (e && e.message || e) });
      }
    });
  });
  server.on('error', (e) => {
    apiStatus = e.code === 'EADDRINUSE' ? `埠 ${API_PORT} 被占用，API 未啟動` : 'API 未啟動';
    console.error('API 無法啟動：' + e.message);
    if (tray) buildTrayMenu();
  });
  server.listen(API_PORT, '127.0.0.1', () => {
    apiStatus = `API：http://127.0.0.1:${API_PORT}/api`;
    if (tray) buildTrayMenu();
  });
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
    { label: apiStatus, enabled: false },
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
  startApi();

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
