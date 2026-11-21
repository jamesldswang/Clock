// 範例測試：tools/run-in-app.js 會在 clock.html 頁面裡執行這段程式碼
(async () => {
  const out = {};

  // 鬧鐘：新增一個指定日期的鬧鐘
  openAddAlarmModal();
  setRepeatMode('once');
  dates.on = { y: new Date().getFullYear() + 1, mo: 1, d: 1 }; alarmH = 0; alarmM = 0;
  renderAlarmSpinner();
  document.getElementById('alarmLabelInput').value = '新年快樂';
  addAlarm();
  out.alarms = alarms.map(a => `${a.time} ${a.label} | ${repeatText(a)}`);

  // 碼錶：跑一下、計圈、暫停、重設
  toggleStopwatch();
  await new Promise(r => setTimeout(r, 200));
  lapOrReset();
  toggleStopwatch();
  out.lapButtonWhenPaused = document.getElementById('swLapBtn').textContent; // 應該是「重設」
  lapOrReset();
  out.stopwatchAfterReset = document.getElementById('stopwatchDisplay').textContent;

  return out;
})()
