// =====================================================
// BUDO LINK — Google Apps Script 完全版
// スプレッドシートのスクリプトエディタに貼り付けてデプロイ
// =====================================================

// ===== シート名設定（実際のシート名に合わせて変更） =====
const SHEET_STUDENTS  = 'students';       // 学生登録
const SHEET_JOBS      = '求人情報';        // 求人（既存シート名に合わせる）
const SHEET_CONTACTS  = 'お問い合わせ';    // お問い合わせ（既存）
const SHEET_COMPANIES = 'companies';       // 企業一覧（新規作成推奨）
const SHEET_OBOG      = 'obog';           // OB/OG（新規作成推奨）

// =====================================================
// doPost — 登録・更新・お問い合わせ
// =====================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const type = body.type;
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // ----- 学生登録 -----
    if (type === 'student_registration') {
      const sheet = ss.getSheetByName(SHEET_STUDENTS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // 列が存在しない場合は末尾に追加
      const requiredCols = ['userId','passwordHash','gakuchika','industries','occupations'];
      requiredCols.forEach(col => {
        if (!headers.includes(col)) {
          const newCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, newCol).setValue(col);
          headers.push(col);
        }
      });

      // メールアドレスの重複チェック
      const emailCol = headers.indexOf('email');
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][emailCol] === body.email) {
          return jsonResponse({ success: false, error: 'email_exists' });
        }
      }

      // 行追加
      const row = headers.map(h => body[h] !== undefined ? body[h] : '');
      sheet.appendRow(row);
      return jsonResponse({ success: true });
    }

    // ----- プロフィール更新（ガクチカ/業界/職種）-----
    if (type === 'student_update') {
      const sheet   = ss.getSheetByName(SHEET_STUDENTS);
      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      const emailCol = headers.indexOf('email');

      const updatableFields = ['gakuchika', 'industries', 'occupations'];

      for (let i = 1; i < data.length; i++) {
        if (data[i][emailCol] === body.email) {
          updatableFields.forEach(field => {
            if (body[field] !== undefined) {
              let col = headers.indexOf(field);
              if (col === -1) {
                col = headers.length;
                sheet.getRange(1, col + 1).setValue(field);
                headers.push(field);
              }
              sheet.getRange(i + 1, col + 1).setValue(body[field]);
            }
          });
          break;
        }
      }
      return jsonResponse({ success: true });
    }

    // ----- お問い合わせ保存 -----
    if (type === 'contact_form') {
      const sheet = ss.getSheetByName(SHEET_CONTACTS);
      if (sheet) {
        sheet.appendRow([
          body.sentAt || new Date().toLocaleString('ja-JP'),
          body.userId  || '',
          body.email   || '',
          body.name    || '',
          body.subject || '',
          body.body    || ''
        ]);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: 'unknown_type' });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// =====================================================
// doGet — ログイン・データ取得
// =====================================================
function doGet(e) {
  const type = (e.parameter || {}).type;
  const ss   = SpreadsheetApp.getActiveSpreadsheet();

  // ----- ログイン認証 -----
  if (type === 'login') {
    const email = e.parameter.email || '';
    const hash  = e.parameter.hash  || '';
    const sheet = ss.getSheetByName(SHEET_STUDENTS);
    const data  = sheet.getDataRange().getValues();
    const headers   = data[0];
    const emailCol  = headers.indexOf('email');
    const hashCol   = headers.indexOf('passwordHash');

    for (let i = 1; i < data.length; i++) {
      if (data[i][emailCol] === email && data[i][hashCol] === hash) {
        const user = {};
        headers.forEach((h, j) => { if (h && h !== 'passwordHash') user[h] = data[i][j]; });
        return jsonResponse({ success: true, user });
      }
    }
    return jsonResponse({ success: false });
  }

  // ----- 企業一覧 -----
  if (type === 'get_companies') {
    const sheet = ss.getSheetByName(SHEET_COMPANIES);
    if (!sheet) return jsonResponse({ success: true, data: [] });
    return jsonResponse({ success: true, data: sheetToArray(sheet) });
  }

  // ----- 求人・インターン -----
  if (type === 'get_jobs') {
    const sheet = ss.getSheetByName(SHEET_JOBS);
    if (!sheet) return jsonResponse({ success: true, data: [] });
    return jsonResponse({ success: true, data: sheetToArray(sheet) });
  }

  // ----- OB/OG -----
  if (type === 'get_obog') {
    const sheet = ss.getSheetByName(SHEET_OBOG);
    if (!sheet) return jsonResponse({ success: true, data: [] });
    return jsonResponse({ success: true, data: sheetToArray(sheet) });
  }

  return jsonResponse({ success: false, error: 'unknown_type' });
}

// =====================================================
// ヘルパー関数
// =====================================================

// シートの全行をオブジェクト配列に変換
function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== ''))  // 空行スキップ
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[String(h)] = row[i]; });
      return obj;
    });
}

// JSON レスポンス生成（CORS対応）
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
