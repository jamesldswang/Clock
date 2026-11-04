// 在真正的 App 裡執行一段測試程式碼，並印出結果。
//
// 用法（在 ClockApp 資料夾）：
//   ./node_modules/electron/dist/electron.exe tools/run-in-app.js <測試檔.js>
//
// 測試檔的內容會在 clock.html 頁面裡執行（可以直接呼叫頁面上的函式，例如
// openAddAlarmModal()、addAlarm()、toggleStopwatch()）。最後一個運算式的值
// （可以是 Promise）會以 JSON 印成一行 `RESULT {...}`。
//
// 用獨立的暫存資料夾當 userData，不會動到使用者真正存的鬧鐘和城市。
// 執行前要先關掉正在跑的時鐘 App，否則單一實例鎖會讓這個程式直接結束。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

const testFile = process.argv.find(a => a.endsWith('.js') && !a.endsWith('run-in-app.js'));
if (!testFile) { console.error('用法：electron tools/run-in-app.js <測試檔.js>'); process.exit(2); }

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clock-test-')));
require(path.join(__dirname, '..', 'main.js'));

// 不要真的打開瀏覽器；記下來給測試看
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const code = fs.readFileSync(path.resolve(testFile), 'utf8');
  let exitCode = 0;
  try {
    const result = await win.webContents.executeJavaScript(code);
    console.log('RESULT ' + JSON.stringify({ result, openedExternal: opened }));
  } catch (e) {
    console.log('ERROR ' + (e && e.message || e));
    exitCode = 1;
  }
  app.isQuitting = true;
  app.exit(exitCode);
});
