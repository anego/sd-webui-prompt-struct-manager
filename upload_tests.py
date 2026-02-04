import gspread
from oauth2client.service_account import ServiceAccountCredentials

# 認証設定
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
client = gspread.authorize(creds)

# 1. 新規スプレッドシート作成
spreadsheet = client.create("PSM_Quality_Assurance_Tests_v1.8")
# リーダーのメールアドレスに共有（編集権限付与）
# spreadsheet.share('your-email@gmail.com', perm_type='user', role='writer')

# シート1: 概要
sheet1 = spreadsheet.get_worksheet(0)
sheet1.update_title("1.Overview")
sheet1.append_row(["ID", "テスト項目", "手順", "期待値", "区分"])
sheet1.append_rows([
    ["1-1", "パネル起動", "PSMボタンクリック", "パネル表示", "自動"],
    ["1-2", "干渉防止", "コンソール確認", "エラーなし", "自動"],
    ["1-3", "ガード", "背景クリック", "閉じない", "自動"]
])

# シート2: エディタ
sheet2 = spreadsheet.add_worksheet(title="2.Editor", rows="100", cols="20")
sheet2.append_row(["ID", "テスト項目", "手順", "期待値", "区分"])
sheet2.append_rows([
    ["3-1", "V3起動", "📄+クリック", "編集窓表示", "自動"],
    ["3-2", "重み調整", "＋2回クリック", "1.2反映", "自動"]
])

# シート3: ワークフロー
sheet3 = spreadsheet.add_worksheet(title="3.Workflow", rows="100", cols="20")
sheet3.append_row(["ID", "テスト項目", "手順", "期待値", "区分"])
sheet3.append_rows([
    ["4-1", "単体削除", "削除クリック", "confirm表示", "自動"],
    ["4-2", "フォルダ削除", "削除クリック", "カスタムパネル", "自動"]
])

print(f"Spreadsheet created: {spreadsheet.url}")