"""
Claude Managed Agents 対話型クライアント

使い方:
  export ANTHROPIC_API_KEY="sk-ant-..."
  python3 managed_agents_chat.py
"""

import os
import sys
from anthropic import Anthropic


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("エラー: ANTHROPIC_API_KEY が設定されていません。")
        print('  export ANTHROPIC_API_KEY="sk-ant-..."')
        sys.exit(1)

    client = Anthropic()

    # エージェントと環境は初回だけ作成（再利用可能）
    print("エージェントを準備中...")
    agent = client.beta.agents.create(
        name="Chronicle Assistant",
        model="claude-sonnet-4-6",
        system=(
            "あなたは万能なアシスタントです。日本語で回答してください。"
            "コード作成、Web検索、ファイル操作など何でもできます。"
            "作業の過程も説明してください。"
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )

    environment = client.beta.environments.create(
        name="interactive-env",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )

    session = client.beta.sessions.create(
        agent=agent.id,
        environment_id=environment.id,
        title="Interactive Session",
    )
    print(f"準備完了! (Session: {session.id})\n")

    # 対話ループ
    while True:
        try:
            user_input = input("\nあなた > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n終了します。")
            break

        if not user_input:
            continue
        if user_input in ("exit", "quit", "終了"):
            print("終了します。")
            break

        print()
        with client.beta.sessions.events.stream(session.id) as stream:
            client.beta.sessions.events.send(
                session.id,
                events=[
                    {
                        "type": "user.message",
                        "content": [{"type": "text", "text": user_input}],
                    },
                ],
            )

            for event in stream:
                match event.type:
                    case "agent.message":
                        for block in event.content:
                            print(block.text, end="", flush=True)
                    case "agent.tool_use":
                        print(f"\n  [ツール: {event.name}]")
                    case "session.status_idle":
                        print()
                        break


if __name__ == "__main__":
    main()
