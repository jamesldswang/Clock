---
name: clock-app
description: 修改、測試、打包「時鐘」桌面 App（C:\Users\user\ClockApp，Electron，macOS 風格的世界時鐘／鬧鐘／碼錶／計時器，Ctrl+Alt+C 叫出）。只要使用者要改時鐘 App 的功能或畫面、修 bug、加城市或鬧鐘功能、重新打包 zip、更新版號或 README，就先載入這個 skill。
---

# 時鐘 App

這是一個 Electron 桌面 App。它把一個單頁的 `clock.html` 包成常駐在系統匣的視窗，按 **Ctrl+Alt+C** 會跳出來或隱藏。使用者用繁體中文溝通，回覆、程式註解、UI 文字也都用繁體中文。

## 檔案

| 檔案 | 內容 |
|------|------|
| `clock.html` | **所有功能都在這裡**：HTML、CSS、JS 寫在同一個檔案。分四個區塊：世界時鐘、鬧鐘、碼錶、計時器 |
| `main.js` | Electron 主程式：無邊框透明視窗、全域快捷鍵、系統匣選單、開機自動啟動、失焦自動隱藏、外部連結交給瀏覽器開，以及注入 App 專用的 CSS（`APP_CSS`） |
| `preload.js` | 在右上角放版號；紅點／黃點按下去會隱藏視窗；包裝 `alert`，跳出提示時先把視窗叫出來；提供 `window.__clockApp.{show,pin,unpin}` |
| `build.js` | 打包腳本（`npm run dist`），產出 `dist/Clock-<版號>-win-x64/` 和同名 `.zip` |
| `tools/run-in-app.js` | 測試工具：在真正的 App 裡執行一段 JS，然後印出結果 |
| `README.md` | 給使用者看的說明，最後有「版本紀錄」 |
| `start.vbs` | 不經打包、直接從原始碼啟動 App 的捷徑 |

`clock.html` 一定要能單獨用瀏覽器打開，所以呼叫 App 專用的功能時，要寫成 `window.__clockApp?.pin()` 這種有沒有都不會出錯的寫法。

## 每次修改後的流程

1. **改程式**：功能和畫面改 `clock.html`；視窗、快捷鍵、系統匣改 `main.js`。
2. **先關掉正在跑的 App**：App 有單一實例鎖，沒關掉的話，測試和打包都會出問題。
   ```bash
   powershell -NoProfile -Command "Get-Process | Where-Object { \$_.Path -like 'C:\Users\user\ClockApp\*' } | Stop-Process -Force"
   ```
3. **測試**（見下一節）。
4. **更新 `README.md`**：在功能表格和「版本紀錄」裡補上這次的變更。如果原本的「已知限制」解決了，就把那一條刪掉。
5. **打包**：`npm run dist`
6. **重新啟動 App**：使用者平常用的是打包版。
   ```bash
   powershell -NoProfile -Command "Start-Process 'C:\Users\user\ClockApp\dist\Clock-1.2.0-win-x64\時鐘.exe'"
   ```
   路徑裡的 `1.2.0` 要換成現在的版號。

版號在 `package.json` 的 `version`。使用者沒說要改就不要動；改了之後，視窗右上角、系統匣選單和 zip 檔名都會自動跟著變。

## 測試

### 邏輯測試（優先用這個）

寫一個 JS 檔，用 `tools/run-in-app.js` 在真正的 App 頁面裡執行：

```bash
cd /c/Users/user/ClockApp
./node_modules/electron/dist/electron.exe tools/run-in-app.js <測試檔.js>
```

- 測試檔裡可以直接呼叫 `clock.html` 的全域函式和變數。最後一個運算式的值（可以是 Promise）會印成一行 `RESULT {"result": ..., "openedExternal": [...]}`。
- `openedExternal` 是頁面原本要用瀏覽器打開的網址，例如 Google 日曆連結。測試時不會真的打開瀏覽器。
- 測試用的是獨立的暫存 userData，**不會動到使用者存的鬧鐘和城市**。
- 範例在 `tools/example-test.js`。
- 測試檔不要放進 `dist`。`build.js` 只會複製 `main.js`、`preload.js`、`clock.html`。

如果要測時間有關的邏輯，例如鬧鐘到點，不要真的等。直接呼叫判斷函式並傳入指定的時間，例如 `isDue(alarm, new Date(2026, 10, 4, 7, 0), '07:00')`。要測響鈴流程時，先把 `window.startRinging` 換成空函式，就不會真的出聲。

### 畫面確認

1. 用 SendKeys 送出 `^%c` 叫出視窗。
2. 用 PowerShell 截圖，再用 Read 看圖。截圖程式要先呼叫 `SetProcessDPIAware()`，因為螢幕是 1920×1080、150% 縮放；不呼叫的話，抓到的座標和畫面對不起來。
3. 視窗寬 420、高 640（邏輯像素），開啟時會放在滑鼠所在螢幕的正中央。

**截圖會拍到使用者桌面上的其他視窗，例如聊天內容。截圖存在 scratchpad，看完馬上刪掉，也不要在回覆裡描述截圖裡別人的內容。**

## 一定要知道的限制與踩過的坑

- **Fn 鍵不能當快捷鍵。** Fn 是筆電鍵盤韌體自己處理的，Windows 收不到。快捷鍵定義在 `main.js` 的 `HOTKEY`。
- **不能打包成單一 `.exe`。** 這台電腦開了 Windows 11 的「智慧型應用程式控制」，會擋下沒有數位簽章、又沒有信譽的執行檔。electron-builder 產生的 portable exe 會被擋，錯誤訊息是 `An Application Control policy has blocked this file`。`build.js` 的做法是直接複製原版的 `electron.exe` 並改名成 `時鐘.exe`，檔案內容（hash）不變，所以 Windows 認得、不會擋。**不要改回 electron-builder，也不要修改 exe 本身**，例如改圖示或寫入版本資訊。
- **圖示不能用 SVG。** Windows 的 `nativeImage` 讀不了 SVG，系統匣會變成灰色空框（1.0.1 修正）。現在是 `main.js` 的 `drawIconBitmap(size)` 直接畫 BGRA 點陣圖，再用 `nativeImage.createFromBitmap` 轉成圖示；系統匣用 16px，另外用 `addRepresentation` 附 32px 給高 DPI。要改圖示就改這個函式，不要再用 SVG data URL。
- **electron-builder 的 winCodeSign 解壓會失敗**，因為這台電腦沒有建立 symlink 的權限。現在已經沒有用 electron-builder，只是記錄下來。
- **npm 預設擋 postinstall。** 第一次 `npm install` 之後，要執行 `npm install-scripts approve electron` 和 `npm rebuild electron`，才會下載 Electron 執行檔。
- **不要用 `<input type="time">` 和 `type="date"`。** 使用者回報時間沒辦法設定。鬧鐘的時、分和年、月、日都改成自製的 ▲▼ 轉輪（`.time-spinner`，支援按住連續調整、鍵盤上下鍵、滑鼠滾輪）。要新增時間或日期欄位時，沿用 `stepAlarm()` 那一套寫法。
- **視窗失焦會自動隱藏。** 鬧鐘響或跳出 `alert` 時，要先呼叫 `window.__clockApp.pin()`，結束後再 `unpin()`，不然視窗會被收起來。
- **背景要繼續計時。** BrowserWindow 設了 `backgroundThrottling: false`，視窗隱藏時碼錶、計時器、鬧鐘照常運作。另外設了 `autoplayPolicy: 'no-user-gesture-required'`，鬧鐘沒有人點擊也能出聲。
- **每次播放鈴聲都會建立一個新的 AudioContext**，播完一定要 `close()`，否則 Chromium 的 AudioContext 數量會超過上限。
- **外部連結**：頁面用 `window.open(url)`，再由 `main.js` 的 `setWindowOpenHandler` 交給 `shell.openExternal` 打開。目前只允許 `https://calendar.google.com/`；要加別的網域，改那個判斷式。
- **使用者輸入的文字要跳脫。** 鬧鐘標籤這類使用者自己打的字，放進 `innerHTML` 之前一定要先經過 `escapeHtml()`。
- **開機自動啟動、寫入 Startup 資料夾這類會一直留在系統上的設定**，不要自己做，只能留給使用者在系統匣選單自己勾。之前直接建立 Startup 捷徑，被權限系統擋下來了。

## 資料怎麼存

- 存在 `localStorage`，位置在 `%APPDATA%\時鐘`（Electron 的 userData）。
- 存了兩個 key：`clock.alarms` 和 `clock.cities`。存取一律透過 `loadSaved(key, fallback)` 和 `save(key, value)`，兩個都有 try/catch。
- **只要改到 `alarms` 或 `cities`，就要呼叫 `saveAlarms()` 或 `saveCities()`。**
- 鬧鐘的資料格式：
  ```js
  { id, time: 'HH:MM', label, sound: 'spring' | 'classic', enabled,
    repeat: 'once' | 'weekly' | 'date',
    days: [0..6],            // repeat === 'weekly'，0 是週日
    date: 'YYYY-MM-DD',      // repeat === 'date'
    early: 10 }              // 有勾「提前 10 分鐘先響一次」才有（分鐘數，常數 EARLY_MIN）
  ```
  - 單次（`once`）和指定日期（`date`）的鬧鐘響過之後，會自動把 `enabled` 設成 `false`。
  - 改資料格式時，要考慮使用者已經存的舊資料：缺少的欄位要有預設值，或者在載入時補上。

## 功能清單（改之前先看有沒有現成的函式可以用）

- **世界時鐘**：`cities`、`updateWorldClocks()`（清單變動時重建卡片）、`tickWorldClocks()`（每秒只更新時間文字，不重建，否則 ✕ 按鈕會按不到）、`addCity()`、`deleteCity(i)`。可以選的城市在 `CITY_GROUPS`（每筆 `[城市, 國家或省份, 英文名, IANA 時區]`，依地區分組；`buildCitySelect()` 產生選項、`filterCities()` 搜尋）。重複判斷是「時區＋名稱」，因為很多中國城市都是 `Asia/Shanghai`。加新城市後要確認時區名稱有效（`new Intl.DateTimeFormat('en', { timeZone })` 不會丟錯）。德州用的是 `America/Chicago`。
- **鬧鐘**：
  - 清單：`renderAlarms()`、`repeatText(a)`、`deleteAlarm(id)`、`toggleAlarm(id)`
  - 新增：`openAddAlarmModal()`、`openEditAlarmModal(id)`（修改：同一個視窗，`editingAlarmId` 不是 null 時 `addAlarm()` 會取代原本那筆、保留 id、重新開啟）、`addAlarm()`、`setRepeatMode(mode)`
  - 到點判斷：`isDue(a, now, hhmm)`、`checkAlarms()`（每秒執行一次；沒有正式鬧鐘要響時，會用「現在＋early 分鐘」的日期時間去跑 `isDue`，符合就 `startRinging(a, a.early)` 響預告。預告不會把單次／指定日期的鬧鐘關掉）
  - 響鈴：`startRinging()`、`stopRinging()`、`ringCycle()`。流程是「鈴聲 → 用 `speechSynthesis` 念標籤（優先用 zh-TW 語音）」，一直重複，直到按停止或滿 1 分鐘。
  - Google 日曆：`googleCalendarUrl(a)`、`openGoogleCalendar(a)`。用的是一鍵加入的網址，**是單向的**，App 裡刪除或修改鬧鐘不會同步到日曆。使用者選了這個做法；完整的 API 同步要先到 Google Cloud 設定 OAuth，所以當時沒有做。
- **碼錶**：`toggleStopwatch()`、`lapOrReset()`（執行中是計圈，暫停中是重設）、`renderLaps()`（顯示本圈時間和累計時間，最快一圈綠色、最慢一圈紅色）、`resetStopwatch()`。
- **計時器**：`toggleTimer()`、`resetTimer()`、`updateTimerPreview()`（輸入框改了，上方顯示馬上跟著變）、`formatTimer()`（超過 1 小時顯示成 `時:分:秒`）。
- **鈴聲**：`playAlarmSound(type)` 會回傳鈴聲的長度（秒）。
