import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, Optional

# ファイル全体のデータ(未知キー含む)。キーはルート直下のフィールド名。
PromptFileData = Dict[str, object]
FlushWriter = Callable[[Path, PromptFileData], None]
# パス(拡張子)に応じて適切な FlushWriter を解決する関数。
# キャッシュには .yaml/.json など異なる形式のファイルが混在しうるため、
# flush_all はファイルごとに writer を選べるよう resolver を受け取る。
WriterResolver = Callable[[Path], FlushWriter]


@dataclass
class CacheEntry:
    """1ファイル分のキャッシュ状態。プロセス存続期間中のみ有効。"""
    data: PromptFileData
    dirty: bool = False
    flush_task: Optional["asyncio.Task[None]"] = field(default=None, repr=False)


_cache: Dict[str, CacheEntry] = {}


def _key(path: Path) -> str:
    return str(path)


def get(path: Path) -> Optional[PromptFileData]:
    """キャッシュヒットすればファイル全体のデータを返す。ミスなら None。"""
    entry = _cache.get(_key(path))
    return entry.data if entry is not None else None


def seed(path: Path, data: PromptFileData) -> None:
    """
    ディスクから読み込んだ直後の状態を「非dirty」でキャッシュへ登録する。
    既にエントリが存在する場合(dirtyな変更を上書きしてしまう)は何もしない。
    """
    key = _key(path)
    if key in _cache:
        return
    _cache[key] = CacheEntry(data=data, dirty=False)


def _cancel_flush_task(entry: CacheEntry) -> None:
    if entry.flush_task is not None and not entry.flush_task.done():
        entry.flush_task.cancel()
    entry.flush_task = None


def update_and_schedule_flush(
    path: Path, patch: PromptFileData, writer: FlushWriter, delay: float = 1.5
) -> None:
    """
    キャッシュ上のデータへ patch をマージして dirty にし、
    delay 秒後に一度だけ writer(path, data) を呼ぶタスクをデバウンス予約する。
    直前に予約済みのタスクがあればキャンセルして再予約する。
    """
    key = _key(path)
    entry = _cache.get(key)
    if entry is None:
        entry = CacheEntry(data={})
        _cache[key] = entry

    entry.data.update(patch)
    entry.dirty = True

    _cancel_flush_task(entry)

    async def _delayed_flush() -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        flush(path, writer)

    try:
        entry.flush_task = asyncio.ensure_future(_delayed_flush())
    except RuntimeError:
        # 実行中のイベントループが無い場合 (テスト環境等) は即時flushへフォールバックする
        flush(path, writer)


def flush(path: Path, writer: FlushWriter) -> None:
    """
    dirty であれば writer(path, data) を同期実行してディスクへ書き込み、dirty を下ろす。
    保留中のデバウンスタスクがあれば、二重書き込みを避けるためキャンセルする。
    """
    key = _key(path)
    entry = _cache.get(key)
    if entry is None:
        return
    _cancel_flush_task(entry)
    if not entry.dirty:
        return
    writer(path, entry.data)
    entry.dirty = False


def flush_all(writer_resolver: WriterResolver) -> None:
    """
    全エントリを flush する。WebUI終了時などに使用する。
    キャッシュには .yaml/.json など異なる形式のファイルが混在しうるため、
    ファイルごとに writer_resolver でパスに応じた writer を解決して書き込む。
    """
    for key, entry in list(_cache.items()):
        _cancel_flush_task(entry)
        if entry.dirty:
            path = Path(key)
            writer = writer_resolver(path)
            writer(path, entry.data)
            entry.dirty = False


def invalidate(path: Path) -> None:
    """
    保留中の flush タスクをキャンセルし、キャッシュエントリを破棄する。
    書き込みは行わない (rename/delete の直前に使う)。
    """
    key = _key(path)
    entry = _cache.pop(key, None)
    if entry is not None:
        _cancel_flush_task(entry)


def _reset_for_test() -> None:
    """テスト間のモジュールレベル状態汚染を防ぐためのリセット関数。"""
    for entry in _cache.values():
        _cancel_flush_task(entry)
    _cache.clear()
