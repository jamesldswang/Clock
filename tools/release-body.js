// 產生 GitHub Release 的 JSON 內容（給 tools/release.sh 用）。
// 用法：node tools/release-body.js <輸出檔>
// 說明文字取自 README「版本紀錄」裡目前版本的段落。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const v = require(path.join(root, 'package.json')).version;
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r/g, '');

const lines = readme.split('\n');
const start = lines.findIndex((l) => l.startsWith(`### ${v}`));
if (start < 0) { console.error(`README 的版本紀錄裡找不到 ### ${v}`); process.exit(1); }
let end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
if (end < 0) end = lines.length;
const notes = lines.slice(start + 1, end).join('\n').trim();

const body = {
  tag_name: `v${v}`,
  target_commitish: 'main',
  name: `時鐘 v${v}`,
  body: [
    '## 下載',
    '',
    `下載下方的 \`Clock-${v}-win-x64.zip\`，解壓縮後雙擊 \`時鐘.exe\`，按 **Ctrl+Alt+C** 叫出時鐘。`,
    '',
    '系統需求：Windows 10／11 64 位元，不需要安裝 Node.js。如果出現「Windows 已保護您的電腦」，點「其他資訊」→「仍要執行」。',
    '',
    '## 變更',
    '',
    notes,
  ].join('\n'),
};

fs.writeFileSync(process.argv[2], JSON.stringify(body), 'utf8');
