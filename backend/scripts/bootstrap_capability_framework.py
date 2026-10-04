import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

import app.main  # noqa: E402, F401
from app.auth.models import User  # noqa: E402
from app.catalog.framework import bootstrap_capability_framework  # noqa: E402
from app.infrastructure.database import SessionFactory, engine  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="初始化能力翻译器正式目录和图谱")
    parser.add_argument("--admin-username", help="执行初始化的管理员用户名")
    return parser


async def run(admin_username: str | None) -> dict:
    async with SessionFactory() as db:
        statement = select(User).where(User.role == "admin", User.is_active.is_(True))
        if admin_username:
            statement = statement.where(
                User.username_normalized == admin_username.strip().casefold()
            )
        actor = await db.scalar(statement.order_by(User.created_at).limit(1))
        if actor is None:
            raise RuntimeError("没有可用的管理员账号")
        return await bootstrap_capability_framework(db, actor)


async def main() -> None:
    args = build_parser().parse_args()
    try:
        result = await run(args.admin_username)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
