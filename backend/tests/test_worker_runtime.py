import asyncio

from app.infrastructure import database


def test_run_worker_disposes_connections_in_each_event_loop(monkeypatch) -> None:
    disposal_loops: list[asyncio.AbstractEventLoop] = []

    class FakeEngine:
        async def dispose(self) -> None:
            disposal_loops.append(asyncio.get_running_loop())

    async def current_loop() -> asyncio.AbstractEventLoop:
        return asyncio.get_running_loop()

    monkeypatch.setattr(database, "engine", FakeEngine())

    first_loop = database.run_worker(current_loop())
    second_loop = database.run_worker(current_loop())

    assert disposal_loops == [first_loop, second_loop]
    assert first_loop is not second_loop
    assert first_loop.is_closed()
    assert second_loop.is_closed()
