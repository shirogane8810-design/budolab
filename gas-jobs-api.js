// ============================================
// Google Apps Script - 求人情報 API
// ============================================
// 【設置手順】
// 1. Google Drive で新しい Google スプレッドシートを作成
// 2. シート名を「求人情報」に変更
// 3. 1行目にヘッダーを入力:
//    ID | 企業名 | 職種名 | 業種カテゴリ | 勤務地 | 給与 | 雇用形態 | 仕事内容 | 応募条件 | 掲載状態
// 4. 業種カテゴリは以下のいずれかを入力:
//    sales（営業）, planning（企画）, engineer（エンジニア）,
//    education（教育）, finance（金融）, sports（スポーツ）
// 5. 掲載状態は「公開」または「非公開」
// 6. メニュー「拡張機能」→「Apps Script」を開く
// 7. このファイルの内容をすべてコピーして貼り付け
// 8. 「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」
// 9. 実行するユーザー:「自分」、アクセス:「全員」
// 10. デプロイして表示されるURLをコピー
// 11. jobs.html の JOBS_API_ENDPOINT 変数にそのURLを貼り付け
// ============================================

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('求人情報');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var jobs = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      // 掲載状態が「公開」のもののみ
      if (row[9] === '公開') {
        jobs.push({
          id: row[0],
          company: row[1],
          title: row[2],
          category: row[3],
          location: row[4],
          salary: row[5],
          type: row[6],
          description: row[7],
          requirements: row[8],
          status: row[9]
        });
      }
    }

    // カテゴリフィルター
    var category = e.parameter.category || '';
    if (category) {
      jobs = jobs.filter(function(job) {
        return job.category === category;
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', jobs: jobs }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
