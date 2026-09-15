import asyncio
from pathlib import Path
from typing import Dict, List

import pytest

from scripts.psm import cache


@pytest.fixture(autouse=True)
def reset_cache_state():
    """cache モジュールはプロセス存続期間中生き続けるモジュールレベル状態を持つため、
    テスト間の汚染を防ぐため各テストの前後でリセットする。"""
    cache._reset_for_test()
    yield
    cache._reset_for_test()


class RecordingWriter:
    """cache.flush から呼ばれる書き込み関数の代わりに、呼び出し履歴を記録するテストダブル。"""

    def __init__(self) -> None:
        self.calls: List[Dict[str, object]] = []

    def __call__(self, path: Path, data: Dict[str, object]) -> None:
        self.calls.append({"path": path, "data": dict(data)})


# -------------------------------------------------------------------------
# get / seed
# -------------------------------------------------------------------------

def test_get_returns_none_for_unseeded_path() -> None:
    # Arrange
    path = Path("/virtual/unseeded.yaml")

    # Act
    result = cache.get(path)

    # Assert
    assert result is None


def test_seed_populates_cache() -> None:
    # Arrange
    path = Path("/virtual/a.yaml")

    # Act
    cache.seed(path, {"positive": []})

    # Assert
    assert cache.get(path) == {"positive": []}


def test_seed_does_not_overwrite_existing_entry() -> None:
    """seed はディスク由来の初期値を登録するためのものなので、
    既に(dirtyな変更を含む)エントリがある場合は上書きしてはならない。"""
    # Arrange
    path = Path("/virtual/a.yaml")
    cache.seed(path, {"positive": ["first"]})

    # Act
    cache.seed(path, {"positive": ["second"]})

    # Assert
    assert cache.get(path) == {"positive": ["first"]}


# -------------------------------------------------------------------------
# update_and_schedule_flush (デバウンスの核心)
# -------------------------------------------------------------------------

def test_update_and_schedule_flush_does_not_write_immediately() -> None:
    # Arrange
    path = Path("/virtual/a.yaml")
    writer = RecordingWriter()

    async def scenario() -> None:
        cache.update_and_schedule_flush(path, {"positive": [1]}, writer, delay=1.0)
        # スケジュールした直後はまだ書き込まれていない
        assert writer.calls == []

    # Act & Assert
    asyncio.run(scenario())


def test_update_and_schedule_flush_writes_after_delay() -> None:
    # Arrange
    path = Path("/virtual/a.yaml")
    writer = RecordingWriter()

    async def scenario() -> None:
        cache.update_and_schedule_flush(path, {"positive": [1]}, writer, delay=0.01)
        await asyncio.sleep(0.05)

    # Act
    asyncio.run(scenario())

    # Assert: delay経過後に1回だけ書き込まれる
    assert len(writer.calls) == 1
    assert writer.calls[0]["data"]["positive"] == [1]


def test_update_and_schedule_flush_debounces_rapid_successive_calls() -> None:
    """
    ウェイトスライダーのドラッグ操作を模した連続呼び出し。
    5回の更新に対し、実際のディスク書き込みは最後の1回分だけにまとまることを検証する。
    """
    # Arrange
    path = Path("/virtual/slider.yaml")
    writer = RecordingWriter()

    async def scenario() -> None:
        for weight in [0.8, 0.9, 1.0, 1.1, 1.2]:
            cache.update_and_schedule_flush(path, {"weight": weight}, writer, delay=0.03)
            await asyncio.sleep(0.005)  # delay より十分短い間隔で連続呼び出し
        await asyncio.sleep(0.08)  # 最後の呼び出しから delay 経過するまで待つ

    # Act
    asyncio.run(scenario())

    # Assert
    assert len(writer.calls) == 1
    assert writer.calls[0]["data"]["weight"] == 1.2


# -------------------------------------------------------------------------
# flush / flush_all
# -------------------------------------------------------------------------

def test_flush_skips_write_when_not_dirty() -> None:
    # Arrange
    path = Path("/virtual/b.yaml")
    writer = RecordingWriter()
    cache.seed(path, {"positive": []})  # seed直後は dirty=False

    # Act
    cache.flush(path, writer)

    # Assert
    assert writer.calls == []


def test_flush_all_writes_every_dirty_entry_and_none_others() -> None:
    # Arrange
    writer = RecordingWriter()
    path_dirty = Path("/virtual/dirty.yaml")
    path_clean = Path("/virtual/clean.yaml")
    cache.seed(path_clean, {"positive": []})

    async def scenario() -> None:
        cache.update_and_schedule_flush(path_dirty, {"positive": [1]}, writer, delay=100)
        # まだ保留中のはず (delayが長いため)
        assert writer.calls == []
        cache.flush_all(lambda _path: writer)

    # Act
    asyncio.run(scenario())

    # Assert: dirtyだった1件のみ書き込まれる
    assert len(writer.calls) == 1
    assert writer.calls[0]["path"] == path_dirty


def test_flush_all_resolves_writer_per_path_extension() -> None:
    """
    キャッシュには .yaml と .json が混在しうるため、flush_all は
    単一のwriterを全件に固定適用するのではなく、パスごとに resolver で
    適切なwriterを解決して使うことを検証する。
    (この解決をせず単一writerへ固定してしまうと、.jsonファイルの中身が
     YAML形式で書き込まれてしまう不具合が実際に発生した)
    """
    # Arrange
    yaml_writer = RecordingWriter()
    json_writer = RecordingWriter()
    path_yaml = Path("/virtual/a.yaml")
    path_json = Path("/virtual/b.json")

    def resolver(path: Path):
        return json_writer if path.suffix == ".json" else yaml_writer

    async def scenario() -> None:
        cache.update_and_schedule_flush(path_yaml, {"positive": [1]}, yaml_writer, delay=100)
        cache.update_and_schedule_flush(path_json, {"positive": [2]}, json_writer, delay=100)
        cache.flush_all(resolver)

    # Act
    asyncio.run(scenario())

    # Assert: それぞれ対応するwriterでのみ書き込まれる
    assert len(yaml_writer.calls) == 1
    assert yaml_writer.calls[0]["path"] == path_yaml
    assert len(json_writer.calls) == 1
    assert json_writer.calls[0]["path"] == path_json


# -------------------------------------------------------------------------
# invalidate (rename/delete 前のキャッシュ破棄)
# -------------------------------------------------------------------------

def test_invalidate_removes_entry() -> None:
    # Arrange
    path = Path("/virtual/a.yaml")
    cache.seed(path, {"positive": []})

    # Act
    cache.invalidate(path)

    # Assert
    assert cache.get(path) is None


def test_invalidate_cancels_pending_flush_so_deleted_file_is_not_resurrected() -> None:
    """
    削除の直前に invalidate すると、保留中だった flush タスクが後から発火しても
    書き込みが実行されない (削除したファイルが復活しない) ことを保証する。
    """
    # Arrange
    path = Path("/virtual/to_delete.yaml")
    writer = RecordingWriter()

    async def scenario() -> None:
        cache.update_and_schedule_flush(path, {"positive": [1]}, writer, delay=0.02)
        cache.invalidate(path)
        # 本来flushされるはずだったタイミングまで待つ
        await asyncio.sleep(0.05)

    # Act
    asyncio.run(scenario())

    # Assert
    assert cache.get(path) is None
    assert writer.calls == []
