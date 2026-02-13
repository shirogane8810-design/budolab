// ============================================
// Google Apps Script - お問い合わせフォーム受信
// ============================================
// 【設置手順】
// 1. Google Drive で新しい Google スプレッドシートを作成
// 2. シート名を「お問い合わせ」に変更
// 3. 1行目にヘッダーを入力: 受信日時 | お名前 | メールアドレス | メッセージ | ステータス
// 4. メニュー「拡張機能」→「Apps Script」を開く
// 5. このファイルの内容をすべてコピーして貼り付け
// 6. 「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」
// 7. 実行するユーザー:「自分」、アクセス:「全員」
// 8. デプロイして表示されるURLをコピー
// 9. index.html の FORM_ENDPOINT 変数にそのURLを貼り付け
// ============================================

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('お問い合わせ');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }

    var data = JSON.parse(e.postData.contents);

    var timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    var name = data.name || '';
    var email = data.email || '';
    var message = data.message || '';

    sheet.appendRow([timestamp, name, email, message, '未対応']);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'BUDO LINK Contact API is running.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
