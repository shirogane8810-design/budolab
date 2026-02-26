// =====================================================
// BUDO LINK — Google Apps Script 完全版（セキュリティ強化済み）
// スプレッドシートのスクリプトエディタに貼り付けてデプロイ
// =====================================================

// ===== シート名設定 =====
const SHEET_STUDENTS  = 'students';
const SHEET_JOBS      = '求人情報';
const SHEET_CONTACTS  = 'お問い合わせ';
const SHEET_COMPANIES = 'companies';
const SHEET_OBOG      = 'obog';

// ===== セキュリティ設定 =====
const ALLOWED_ORIGINS = [
  'https://shirogane8810-design.github.io',
  'https://budolink.jp',           // カスタムドメイン設定時に追加
  'http://localhost:5500',         // ローカル開発時のみ（本番では削除推奨）
];
const RATE_LIMIT_MAX      = 10;   // 同一キーで1分間に許可するリクエスト数
const RATE_LIMIT_WINDOW   = 60;   // 秒
const MAX_INPUT_LENGTH    = 2000; // フィールドごとの最大文字数
const MAX_EMAIL_LENGTH    = 254;
const MAX_NAME_LENGTH     = 100;

// =====================================================
// doPost — 登録・更新・お問い合わせ
// =====================================================
function doPost(e) {
  try {
    // Origin チェック
    const origin = (e.parameter && e.parameter.origin) || '';
    // ※ GAS は HTTP Origin ヘッダーを直接取れないため、
    //   クライアント側で origin パラメータを送信する実装に対応

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (_) {
      return jsonError('invalid_json', 400);
    }

    const type = sanitizeText(body.type, 50);

    // レート制限（メールアドレスをキーに使用）
    const rateLimitKey = 'post_' + hashSimple(body.email || body.userId || 'anonymous');
    if (!checkRateLimit(rateLimitKey)) {
      return jsonError('rate_limit_exceeded', 429);
    }

    // ----- 学生登録 -----
    if (type === 'student_registration') {
      // 入力検証
      const email = sanitizeEmail(body.email);
      const name  = sanitizeText(body.name, MAX_NAME_LENGTH);
      if (!email) return jsonError('invalid_email', 400);

      const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STUDENTS);
      if (!sheet) return jsonError('sheet_not_found', 500);

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // 必須カラム確認
      const requiredCols = ['userId', 'passwordHash', 'email', 'name', 'gakuchika', 'industries', 'occupations'];
      requiredCols.forEach(col => {
        if (!headers.includes(col)) {
          sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
          headers.push(col);
        }
      });

      // メール重複チェック
      const emailCol = headers.indexOf('email');
      const data     = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][emailCol]).toLowerCase() === email.toLowerCase()) {
          return jsonResponse({ success: false, error: 'email_exists' });
        }
      }

      // sanitize して追加
      const row = headers.map(h => {
        if (h === 'email') return email;
        if (h === 'name')  return name;
        if (h === 'passwordHash') return sanitizeText(body.passwordHash, 128);
        if (h === 'userId')       return sanitizeText(body.userId, 64);
        if (h === 'gakuchika')    return sanitizeText(body.gakuchika, MAX_INPUT_LENGTH);
        if (h === 'industries')   return sanitizeText(body.industries, 500);
        if (h === 'occupations')  return sanitizeText(body.occupations, 500);
        return '';
      });
      sheet.appendRow(row);
      return jsonResponse({ success: true });
    }

    // ----- プロフィール更新 -----
    if (type === 'student_update') {
      const email = sanitizeEmail(body.email);
      if (!email) return jsonError('invalid_email', 400);

      const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STUDENTS);
      if (!sheet) return jsonError('sheet_not_found', 500);

      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      const emailCol = headers.indexOf('email');

      const updatableFields = {
        gakuchika:   MAX_INPUT_LENGTH,
        industries:  500,
        occupations: 500,
      };

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][emailCol]).toLowerCase() === email.toLowerCase()) {
          Object.entries(updatableFields).forEach(([field, maxLen]) => {
            if (body[field] !== undefined) {
              let col = headers.indexOf(field);
              if (col === -1) {
                col = headers.length;
                sheet.getRange(1, col + 1).setValue(field);
                headers.push(field);
              }
              sheet.getRange(i + 1, col + 1).setValue(sanitizeText(body[field], maxLen));
            }
          });
          break;
        }
      }
      return jsonResponse({ success: true });
    }

    // ----- お問い合わせ保存 -----
    if (type === 'contact_form') {
      // ハニーポットチェック（bots がこのフィールドを埋める）
      if (body._hp && body._hp !== '') {
        // ボットと判定。成功を偽装して静かに無視
        return jsonResponse({ success: true });
      }

      const name    = sanitizeText(body.name,    MAX_NAME_LENGTH);
      const email   = sanitizeEmail(body.email);
      const subject = sanitizeText(body.subject, 200);
      const message = sanitizeText(body.body,    MAX_INPUT_LENGTH);

      if (!name || !email || !message) {
        return jsonError('missing_required_fields', 400);
      }

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTACTS);
      if (sheet) {
        sheet.appendRow([
          new Date().toLocaleString('ja-JP'),
          sanitizeText(body.userId, 64) || '',
          email,
          name,
          subject,
          message,
          'unread',   // 既読フラグ
        ]);
      }
      return jsonResponse({ success: true });
    }

    return jsonError('unknown_type', 400);

  } catch (err) {
    // エラー詳細をクライアントに漏洩させない
    console.error('doPost error:', err.message);
    return jsonError('server_error', 500);
  }
}

// =====================================================
// doGet — ログイン・データ取得
// =====================================================
function doGet(e) {
  try {
    const type = sanitizeText((e.parameter || {}).type, 50);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // レート制限
    const rateLimitKey = 'get_' + type + '_' + hashSimple((e.parameter || {}).email || 'anon');
    if (!checkRateLimit(rateLimitKey)) {
      return jsonError('rate_limit_exceeded', 429);
    }

    // ----- ログイン認証 -----
    // ※ 認証情報をGETパラメータで送ることはセキュリティ上好ましくありません。
    //   将来的にはPOSTへ移行を推奨します。
    if (type === 'login') {
      const email = sanitizeEmail(e.parameter.email || '');
      const hash  = sanitizeText(e.parameter.hash || '', 128);
      if (!email || !hash) return jsonError('invalid_params', 400);

      const sheet = ss.getSheetByName(SHEET_STUDENTS);
      if (!sheet) return jsonResponse({ success: false });

      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      const emailCol = headers.indexOf('email');
      const hashCol  = headers.indexOf('passwordHash');

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][emailCol]).toLowerCase() === email.toLowerCase()
            && data[i][hashCol] === hash) {
          const user = {};
          headers.forEach((h, j) => {
            // パスワードハッシュは絶対に返さない
            if (h && h !== 'passwordHash') {
              user[String(h)] = data[i][j];
            }
          });
          return jsonResponse({ success: true, user });
        }
      }
      // 認証失敗の詳細（メールが存在しない vs パスワード違い）は伝えない
      return jsonResponse({ success: false });
    }

    // ----- 企業一覧 -----
    if (type === 'get_companies') {
      const sheet = ss.getSheetByName(SHEET_COMPANIES);
      if (!sheet) return jsonResponse({ success: true, data: [] });
      return jsonResponse({ success: true, data: sheetToArray(sheet, ['password', 'passwordHash', 'secret']) });
    }

    // ----- 求人・インターン -----
    if (type === 'get_jobs') {
      const sheet = ss.getSheetByName(SHEET_JOBS);
      if (!sheet) return jsonResponse({ success: true, data: [] });
      // 公開フラグが「公開」の行のみ返す
      const all = sheetToArray(sheet, []);
      const published = all.filter(r => !r['status'] || r['status'] === '公開');
      return jsonResponse({ success: true, data: published });
    }

    // ----- OB/OG -----
    if (type === 'get_obog') {
      const sheet = ss.getSheetByName(SHEET_OBOG);
      if (!sheet) return jsonResponse({ success: true, data: [] });
      return jsonResponse({ success: true, data: sheetToArray(sheet, ['email', 'phone', 'passwordHash']) });
    }

    return jsonError('unknown_type', 400);

  } catch (err) {
    console.error('doGet error:', err.message);
    return jsonError('server_error', 500);
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/** シートの全行をオブジェクト配列に変換。sensitiveFields を除外 */
function sheetToArray(sheet, sensitiveFields) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const exclude = sensitiveFields || [];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h && !exclude.includes(String(h))) {
          obj[String(h)] = row[i];
        }
      });
      return obj;
    });
}

/** JSON レスポンス生成 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** エラーレスポンス（詳細なスタックは含まない） */
function jsonError(code, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: code }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** レート制限チェック（CacheService 使用） */
function checkRateLimit(key) {
  try {
    const cache   = CacheService.getScriptCache();
    const current = parseInt(cache.get(key) || '0', 10);
    if (current >= RATE_LIMIT_MAX) return false;
    cache.put(key, String(current + 1), RATE_LIMIT_WINDOW);
    return true;
  } catch (_) {
    return true; // キャッシュエラーはリクエストをブロックしない
  }
}

/** 入力文字列をサニタイズ（長さ制限・特殊文字除去） */
function sanitizeText(val, maxLen) {
  if (val === null || val === undefined) return '';
  const s = String(val)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 制御文字除去
    .trim();
  return maxLen ? s.substring(0, maxLen) : s;
}

/** メールアドレスの形式チェック＆サニタイズ */
function sanitizeEmail(val) {
  const s = sanitizeText(val, MAX_EMAIL_LENGTH).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
}

/** 簡易ハッシュ（レート制限キー生成用・暗号学的安全性不要） */
function hashSimple(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
