"""
Claude Managed Agents デモスクリプト

使い方:
  1. APIキーを環境変数に設定:
     export ANTHROPIC_API_KEY="your-api-key-here"

  2. 実行:
     python3 managed_agents_demo.py
"""

import os
import sys
from anthropic import Anthropic


def main():
    # APIキーの確認
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("エラー: ANTHROPIC_API_KEY が設定されていません。")
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    client = Anthropic()

    # --- Step 1: エージェントを作成 ---
    print("1. エージェントを作成中...")
    agent = client.beta.agents.create(
        name="Chronicle Assistant",
        model="claude-sonnet-4-6",
        system=(
            "あなたは優秀なコーディングアシスタントです。"
            "日本語で回答してください。"
            "コードを書くときは、きれいで分かりやすいコードを書いてください。"
        ),
        tools=[
            {"type": "agent_toolset_20260401"},
        ],
    )
    print(f"   Agent ID: {agent.id}")

    # --- Step 2: 環境を作成 ---
    print("2. 実行環境を作成中...")
    environment = client.beta.environments.create(
        name="chronicle-demo-env",
        config={
            "type": "cloud",
            "networking": {"type": "unrestricted"},
        },
    )
    print(f"   Environment ID: {environment.id}")

    # --- Step 3: セッションを開始 ---
    print("3. セッションを開始中...")
    session = client.beta.sessions.create(
        agent=agent.id,
        environment_id=environment.id,
        title="Chronicle Demo Session",
    )
    print(f"   Session ID: {session.id}")

    # --- Step 4: メッセージを送信してストリーミングで受信 ---
    task = (
        "Pythonで「今日のランダム名言」を生成するスクリプトを作成して実行してください。"
        "日本語の名言を5つ含めて、ランダムに1つ表示するようにしてください。"
    )

    print(f"\n4. タスクを送信: {task}\n")
    print("=" * 60)

    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [
                        {"type": "text", "text": task},
                    ],
                },
            ],
        )

        for event in stream:
            match event.type:
                case "agent.message":
                    for block in event.content:
                        print(block.text, end="", flush=True)
                case "agent.tool_use":
                    print(f"\n  [ツール使用: {event.name}]")
                case "agent.tool_result":
                    pass  # ツール結果は agent.message で表示される
                case "session.status_idle":
                    print("\n" + "=" * 60)
                    print("\nエージェント完了!")
                    break

    print(f"\nセッション確認: https://console.anthropic.com")


if __name__ == "__main__":
    main()
