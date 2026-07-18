#!/usr/bin/env python3
"""gemba-yomi 完了通知メール(Gmail SMTP経由)。

collector(node src/index.js)が $GITHUB_OUTPUT に出した実行結果を
環境変数で受け取り、状態に応じた本文を組み立てて送信する。

必要な環境変数(Secrets):
  GMAIL_USERNAME     … 送信元Gmailアドレス
  GMAIL_APP_PASSWORD … Gmailのアプリパスワード(通常のパスワード不可)
  NOTIFY_TO          … 通知先アドレス
実行時に付与:
  STATUS/DATE/TOTAL/DOMESTIC/FOREIGN/HIGH/SKIPPED/HIGH_TITLES
  REPO/BRANCH(直リンク生成用)
"""
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def env(name, default=""):
    return os.environ.get(name, default) or default


def main():
    status = env("STATUS")
    if not status:
        # collectorがサマリを出さずに終了(想定外)。GitHubの標準失敗通知に委ねる。
        print("STATUS未設定のため通知をスキップ")
        return

    date = env("DATE")
    total = env("TOTAL", "0")
    domestic = env("DOMESTIC", "0")
    foreign = env("FOREIGN", "0")
    high = env("HIGH", "0")
    skipped = env("SKIPPED", "0")
    repo = env("REPO")
    branch = env("BRANCH", "master")
    high_titles = [t.strip() for t in env("HIGH_TITLES").splitlines() if t.strip()]

    draft_url = f"https://github.com/{repo}/blob/{branch}/drafts/{date}.md"

    if status == "generated":
        subject = f"[gemba-yomi] 今週の下書き {date}(重要度高 {high}件 / 全{total}件)"
        highlights = "\n".join(f"- {t}" for t in high_titles) if high_titles else "-(今週は重要度「高」なし)"
        skip_line = f"\n- 畜種フィルタでスキップ: {skipped}件" if skipped not in ("", "0") else ""
        body = f"""今週の畜産ニュース下書きを生成しました。

■ 収集サマリ
- 合計: {total}件(国内 {domestic} / 海外 {foreign})
- 重要度「高」: {high}件{skip_line}

■ 今週の目玉(重要度「高」)
{highlights}

▼ 下書き(GitHub)
{draft_url}
"""
    elif status in ("no-new", "all-skipped"):
        subject = f"[gemba-yomi] 今週は新着なし {date}"
        if status == "all-skipped":
            extra = f"収集はありましたが、牛の現場に関係する項目はありませんでした(スキップ {skipped}件)。"
        else:
            extra = "収集した中に新着はありませんでした。"
        body = f"""今週は新着がなく、下書きは生成していません。

{extra}
"""
    elif status == "seeded":
        subject = f"[gemba-yomi] 初期シード完了 {date}"
        body = f"""初期シードを実行しました({total}件をseen.jsonに記録)。下書きは生成していません。
次回以降の実行で、これより後の新着分が処理されます。
"""
    else:
        print(f"未知のstatus: {status}。通知をスキップ")
        return

    user = env("GMAIL_USERNAME")
    password = env("GMAIL_APP_PASSWORD")
    to = env("NOTIFY_TO")
    if not (user and password and to):
        print("メール認証情報(GMAIL_USERNAME/GMAIL_APP_PASSWORD/NOTIFY_TO)が不足。通知をスキップ")
        sys.exit(1)

    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    ctx = ssl.create_default_context()
    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.starttls(context=ctx)
        s.login(user, password)
        s.send_message(msg)
    print(f"通知メール送信: {subject} -> {to}")


if __name__ == "__main__":
    main()
