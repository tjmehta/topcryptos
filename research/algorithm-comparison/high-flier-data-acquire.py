#!/usr/bin/env python3
"""Bounded, resumable acquisition for the frozen high-flier data protocol.

This program discovers and validates public Binance Vision daily Spot archives. It
only acquires cohort inputs and daily panels; it intentionally computes no forward
outcomes, signals, entries, exits, or strategy statistics.
"""

from __future__ import annotations

import calendar
import csv
import errno
import gzip
import hashlib
import io
import json
import math
import os
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import zlib
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent
PROTOCOL_PATH = ROOT / "high-flier-data-protocol.md"
SIGNAL_PROTOCOL_PATH = ROOT / "high-flier-protocol.md"
IDENTITY_AUDIT_PATH = ROOT / "high-flier-identity-events.json"
DATA_DIR = ROOT / "high-flier-data"
RAW_DIR = DATA_DIR / "raw"
LISTINGS_DIR = DATA_DIR / "listings"
STATE_DIR = DATA_DIR / "state"
FINAL_DIR = DATA_DIR / "final"
STATE_PATH = STATE_DIR / "acquisition-state.json"
REVISION_PROVENANCE_PATH = STATE_DIR / "revision-provenance-final-two-fix.json"
PREVIOUS_FINAL_PROVENANCE_PATH = STATE_DIR / "revision-provenance-final.json"
CORRECTED_PROVENANCE_PATH = STATE_DIR / "revision-provenance-corrected.json"
ADOPTED_PROVENANCE_PATH = STATE_DIR / "revision-provenance.json"
PROVENANCE_AMENDMENT_PATH = STATE_DIR / "revision-provenance-amendment.json"
SELFTEST_PATH = DATA_DIR / "high-flier-data-acquire-selftest.py"

S3_ENDPOINT = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
ARCHIVE_PREFIX = "data/spot/monthly/klines/"
OBJECT_BASE_URL = "https://data.binance.vision/"
USER_AGENT = "topcryptos-high-flier-public-acquisition/1.0"

MAX_LIST_REQUESTS = 800
MAX_OBJECT_GETS = 20_000
MAX_DOWNLOADED_PERSISTED_BYTES = 100_000_000
MAX_CONCURRENCY = 4
MAX_REQUESTS_PER_SECOND = 4
MIN_REQUEST_INTERVAL_SECONDS = 1.0 / MAX_REQUESTS_PER_SECOND
MAX_ATTEMPTS = 4
BACKOFF_SECONDS = 1.0
MAX_LISTING_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_ARCHIVE_ZIP_BYTES = 8 * 1024 * 1024
MAX_EXPANDED_CSV_BYTES = 1 * 1024 * 1024
MAX_MONTHLY_ROWS = 64
MAX_CSV_LINE_BYTES = 16 * 1024
MAX_NUMERIC_FIELD_CHARS = 1024
MAX_DECIMAL_DIGITS = 1024
MAX_ABS_DECIMAL_EXPONENT = 1024
MAX_TIMESTAMP_DIGITS = 20
ALLOWED_LISTING_HOST = "s3-ap-northeast-1.amazonaws.com"
ALLOWED_OBJECT_HOST = "data.binance.vision"
SUPERSEDED_DATA_PROTOCOL_SHA256 = "423aa0cfa67f4ce831f85c108e5ad9a337ff5b4bdfb0ceb6fed0b492230162ed"

COHORT_YEARS = tuple(range(2020, 2026))
FROZEN_AT = "2026-09-12T07:22:19Z"
STUDY_SIGNAL_START = "2020-01-01"
STUDY_SIGNAL_END = "2025-12-31"
TOP_N = 50
STABLE_BASES = frozenset(
    ("USDC", "TUSD", "BUSD", "USDP", "PAX", "DAI", "USDS", "SUSD", "FDUSD", "AEUR", "EUR", "UST", "USTC", "USDD", "USD1")
)
LEVERAGED_SUFFIX_PAIRS = (("UP", "DOWN"), ("DOWN", "UP"), ("BULL", "BEAR"), ("BEAR", "BULL"))

# Identity events are schema-validated and normalized from the separately frozen
# high-flier-identity-events.json at runtime. BCC is a bar-quality observation,
# not a ninth identity event.
IDENTITY_EVENTS: tuple[dict[str, Any], ...] = ()
IDENTITY_SYMBOLS: frozenset[str] = frozenset()
RUNTIME_INPUT_SNAPSHOT: dict[str, Any] | None = None

QUALITY_EDGES: tuple[dict[str, Any], ...] = (
    {
        "edge_id": "BCCUSDT-2018-partial-terminal",
        "symbol": "BCCUSDT",
        "date": "2018-11-20",
        "last_observed_trade_utc": "2018-11-20T03:00:00Z",
        "status": "event_partial_terminal",
        "source_url": "https://data.binance.vision/data/spot/monthly/klines/BCCUSDT/1d/BCCUSDT-1d-2018-11.zip",
    },
)

MEMBERSHIP_COLUMNS = (
    "cohort_year",
    "reporting_block",
    "symbol",
    "base",
    "formation_month",
    "formation_valid_days",
    "formation_quote_volume",
    "formation_rank",
    "selected",
    "primary_reason",
    "all_reasons",
    "identity_ambiguity",
)
PANEL_COLUMNS = (
    "cohort_year",
    "reporting_block",
    "instrument_id",
    "symbol",
    "identity_segment_id",
    "date",
    "open_time_us",
    "close_time_us",
    "open_time_raw",
    "close_time_raw",
    "timestamp_unit",
    "open",
    "high",
    "low",
    "close",
    "base_volume",
    "quote_volume",
    "trade_count",
    "taker_buy_base_volume",
    "taker_buy_quote_volume",
    "source_archive",
    "source_row",
    "bar_status",
)

PRIMARY_REASON_ORDER = (
    "stable_base",
    "structured_leveraged_product",
    "missing_formation_archive",
    "checksum_or_archive_failure",
    "invalid_zip_or_csv",
    "missing_december_1",
    "missing_december_31",
    "fewer_than_28_valid_days",
    "duplicate_utc_date",
    "invalid_required_bar_fields",
    "eligible_below_rank_50",
    "selected",
)


class AcquisitionError(RuntimeError):
    pass


class CapStop(AcquisitionError):
    pass


def parse_utc_timestamp(text: str, field: str) -> datetime:
    if not isinstance(text, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", text):
        raise AcquisitionError(f"invalid identity timestamp {field}: {text!r}")
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise AcquisitionError(f"invalid identity timestamp {field}: {text!r}") from error


def load_identity_audit_bytes(data: bytes) -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    try:
        audit = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AcquisitionError(f"invalid identity audit JSON: {error}") from error
    required_top = ("status", "primaryTreatment", "dailyBucketWarning", "events", "rawVerificationPattern")
    if not isinstance(audit, dict) or any(key not in audit for key in required_top):
        raise AcquisitionError("identity audit lacks required top-level fields")
    if not isinstance(audit["events"], list) or len(audit["events"]) != 8:
        raise AcquisitionError("identity audit must contain the frozen bounded set of eight events")
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    symbol_pattern = re.compile(r"^[A-Z0-9]+USDT$")
    for index, raw in enumerate(audit["events"]):
        if not isinstance(raw, dict):
            raise AcquisitionError(f"identity event {index} is not an object")
        old_symbol = raw.get("oldSymbol")
        new_symbol = raw.get("newSymbol")
        if not symbol_pattern.fullmatch(str(old_symbol)) or not symbol_pattern.fullmatch(str(new_symbol)):
            raise AcquisitionError(f"identity event {index} has invalid symbols")
        sources = raw.get("sources")
        if not isinstance(sources, list) or not sources or any(
            not isinstance(url, str) or not url.startswith("https://") for url in sources
        ):
            raise AcquisitionError(f"identity event {index} has invalid sources")
        old_boundary = raw.get("oldLastObservedTradeUtc") or raw.get("oldTradingCeasedUtc") or raw.get("oldScheduledHaltUtc")
        new_boundary = raw.get("newTradingStartedUtc")
        if old_boundary is not None:
            parse_utc_timestamp(old_boundary, f"events[{index}].old")
        if new_boundary is not None:
            parse_utc_timestamp(new_boundary, f"events[{index}].new")
        if old_boundary is None or new_boundary is None:
            raise AcquisitionError(f"identity event {index} lacks an old/new boundary")
        event_id = f"{old_symbol}-{new_symbol}-{old_boundary[:10]}"
        if event_id in seen_ids:
            raise AcquisitionError(f"duplicate identity event id: {event_id}")
        seen_ids.add(event_id)
        normalized.append(
            {
                "event_id": event_id,
                "symbols": [old_symbol] if old_symbol == new_symbol else [old_symbol, new_symbol],
                "old_symbol": old_symbol,
                "new_symbol": new_symbol,
                "old_identity": raw.get("oldIdentity"),
                "new_identity": raw.get("newIdentity"),
                "event_kind": raw.get("type"),
                "last_pre_event_date": old_boundary[:10],
                "old_boundary_utc": old_boundary,
                "first_post_event_date": new_boundary[:10],
                "first_post_event_bar_open_utc": new_boundary,
                "conversion_ratio_metadata": raw.get("newUnitsPerOldUnit"),
                "crossing_policy": "unknown",
                "official_sources": list(sources),
                "source_record": raw,
            }
        )
    normalized.sort(key=lambda item: (item["old_boundary_utc"], item["event_id"]))
    return audit, tuple(normalized)


def configure_identity_events(data: bytes) -> dict[str, Any]:
    global IDENTITY_EVENTS, IDENTITY_SYMBOLS
    audit, events = load_identity_audit_bytes(data)
    IDENTITY_EVENTS = events
    IDENTITY_SYMBOLS = frozenset(symbol for event in events for symbol in event["symbols"])
    return audit


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _is_owned_path(path: Path) -> bool:
    try:
        path.absolute().relative_to(DATA_DIR.absolute())
        return True
    except ValueError:
        return False


def _owned_parts(path: Path) -> tuple[str, ...]:
    if not path.is_absolute() or not _is_owned_path(path):
        raise AcquisitionError(f"write/read path is outside owned data directory: {path}")
    relative = path.absolute().relative_to(DATA_DIR.absolute())
    if any(part in ("", ".", "..") for part in relative.parts):
        raise AcquisitionError(f"unsafe owned path: {path}")
    return relative.parts


def _open_owned_parent(path: Path, create: bool = False) -> tuple[int, str]:
    parts = _owned_parts(path)
    if not parts:
        raise AcquisitionError(f"owned file path has no leaf: {path}")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    root_fd = os.open(ROOT, flags)
    fd = root_fd
    try:
        for part in (DATA_DIR.name, *parts[:-1]):
            try:
                next_fd = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(part, 0o755, dir_fd=fd)
                next_fd = os.open(part, flags, dir_fd=fd)
            if fd != root_fd:
                os.close(fd)
            fd = next_fd
        if fd == root_fd:
            return os.dup(root_fd), parts[-1]
        result = os.dup(fd)
        return result, parts[-1]
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.ENOTDIR):
            raise AcquisitionError(f"symlink or non-directory component in owned path: {path}") from error
        raise
    finally:
        if fd != root_fd:
            os.close(fd)
        os.close(root_fd)


def ensure_owned_dir(path: Path) -> None:
    marker = path / ".dir-marker"
    fd, _ = _open_owned_parent(marker, create=True)
    os.close(fd)


def owned_file_exists(path: Path) -> bool:
    try:
        parent_fd, leaf = _open_owned_parent(path, create=False)
    except FileNotFoundError:
        return False
    try:
        try:
            info = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return False
        if stat.S_ISLNK(info.st_mode):
            raise AcquisitionError(f"symlinked owned file rejected: {path}")
        if not stat.S_ISREG(info.st_mode):
            raise AcquisitionError(f"owned path is not a regular file: {path}")
        return True
    finally:
        os.close(parent_fd)


def read_owned_bytes(path: Path, max_bytes: int | None = None) -> bytes:
    parent_fd, leaf = _open_owned_parent(path, create=False)
    try:
        fd = os.open(leaf, os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0), dir_fd=parent_fd)
    finally:
        os.close(parent_fd)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise AcquisitionError(f"owned path is not a regular file: {path}")
        if max_bytes is not None and info.st_size > max_bytes:
            raise AcquisitionError(f"owned file exceeds read bound {max_bytes}: {path}")
        limit = info.st_size if max_bytes is None else min(info.st_size, max_bytes)
        chunks: list[bytes] = []
        read_bytes = 0
        while read_bytes < limit:
            block = os.read(fd, min(1024 * 1024, limit - read_bytes))
            if not block:
                break
            chunks.append(block)
            read_bytes += len(block)
        if read_bytes != info.st_size:
            raise AcquisitionError(f"short or changing owned-file read: {path}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _assert_regular_input(path: Path) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError as error:
        raise AcquisitionError(f"required input missing: {path}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise AcquisitionError(f"required input must be a non-symlink regular file: {path}")


def read_input_bytes(path: Path) -> bytes:
    if _is_owned_path(path):
        return read_owned_bytes(path)
    _assert_regular_input(path)
    fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise AcquisitionError(f"input is not regular: {path}")
        chunks = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            chunks.append(block)
        return b"".join(chunks)
    finally:
        os.close(fd)


def sha256_file(path: Path) -> str:
    return sha256_bytes(read_input_bytes(path))


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"


def deterministic_gzip(data: bytes) -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as handle:
        handle.write(data)
    return output.getvalue()


def _write_all(fd: int, data: bytes) -> None:
    offset = 0
    while offset < len(data):
        written = os.write(fd, data[offset:])
        if written <= 0:
            raise AcquisitionError("short write")
        offset += written


def atomic_replace(path: Path, data: bytes) -> None:
    parent_fd, leaf = _open_owned_parent(path, create=True)
    temp_name = f".{leaf}.tmp-{os.getpid()}-{time.time_ns()}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    try:
        try:
            existing = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
            if stat.S_ISLNK(existing.st_mode) or not stat.S_ISREG(existing.st_mode):
                raise AcquisitionError(f"refusing to replace non-regular owned path: {path}")
        except FileNotFoundError:
            pass
        fd = os.open(temp_name, flags, 0o644, dir_fd=parent_fd)
        try:
            _write_all(fd, data)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temp_name, leaf, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        os.fsync(parent_fd)
    finally:
        try:
            os.unlink(temp_name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        os.close(parent_fd)


def write_new_or_hash_match(path: Path, data: bytes) -> str:
    expected = sha256_bytes(data)
    if owned_file_exists(path):
        if sha256_bytes(read_owned_bytes(path)) != expected:
            raise AcquisitionError(f"refusing to overwrite different existing file: {path}")
        return "matched"
    parent_fd, leaf = _open_owned_parent(path, create=True)
    temp_name = f".{leaf}.tmp-{os.getpid()}-{time.time_ns()}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(temp_name, flags, 0o644, dir_fd=parent_fd)
        try:
            _write_all(fd, data)
            os.fsync(fd)
        finally:
            os.close(fd)
        try:
            os.link(temp_name, leaf, src_dir_fd=parent_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
            os.fsync(parent_fd)
            return "created"
        except FileExistsError:
            if not owned_file_exists(path) or sha256_bytes(read_owned_bytes(path)) != expected:
                raise AcquisitionError(f"concurrent different file appeared: {path}")
            return "matched"
    finally:
        try:
            os.unlink(temp_name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        os.close(parent_fd)


def copy_new_or_hash_match(source: Path, target: Path) -> str:
    return write_new_or_hash_match(target, read_input_bytes(source))


def reporting_block(year: int) -> str:
    return "development" if year <= 2022 else "reserved_retrospective_evaluation"


def add_months(month: str, delta: int) -> str:
    year, month_number = (int(part) for part in month.split("-"))
    index = year * 12 + month_number - 1 + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def months_inclusive(first: str, last: str) -> list[str]:
    months = []
    current = first
    while current <= last:
        months.append(current)
        current = add_months(current, 1)
    return months


def archive_key(symbol: str, month: str) -> str:
    return f"{ARCHIVE_PREFIX}{symbol}/1d/{symbol}-1d-{month}.zip"


def raw_path_for_key(key: str) -> Path:
    if key.startswith("/") or ".." in Path(key).parts:
        raise AcquisitionError(f"unsafe object key: {key}")
    return RAW_DIR / key


def parse_decimal(text: str, strictly_positive: bool = False, nonnegative: bool = False) -> Decimal | None:
    if not isinstance(text, str) or len(text) == 0 or len(text) > MAX_NUMERIC_FIELD_CHARS:
        return None
    try:
        value = Decimal(text)
    except (InvalidOperation, ValueError):
        return None
    if not value.is_finite():
        return None
    sign, digits, exponent = value.as_tuple()
    if len(digits) > MAX_DECIMAL_DIGITS or abs(exponent) > MAX_ABS_DECIMAL_EXPONENT:
        return None
    if strictly_positive and value <= 0:
        return None
    if nonnegative and value < 0:
        return None
    return value


def exact_decimal_sum(values: Iterable[Decimal]) -> str:
    tuples = [value.as_tuple() for value in values]
    if not tuples:
        return "0"
    scale = max(0, max(-item.exponent for item in tuples))
    if scale > MAX_ABS_DECIMAL_EXPONENT:
        raise AcquisitionError("decimal sum scale exceeds frozen bound")
    total = 0
    for sign, digits, exponent in tuples:
        coefficient = int("".join(str(digit) for digit in digits) or "0")
        if sign:
            coefficient = -coefficient
        power = exponent + scale
        if power < 0 or power > 2 * MAX_ABS_DECIMAL_EXPONENT:
            raise AcquisitionError("decimal sum exponent exceeds frozen bound")
        total += coefficient * (10**power)
    negative = total < 0
    raw = str(abs(total)).rjust(scale + 1, "0")
    if scale:
        rendered = f"{raw[:-scale]}.{raw[-scale:]}"
    else:
        rendered = raw
    rendered = rendered.rstrip("0").rstrip(".") if "." in rendered else rendered
    if rendered in ("", "-0"):
        rendered = "0"
    return f"-{rendered}" if negative and rendered != "0" else rendered


def timestamp_to_us(raw: str) -> tuple[int | None, str]:
    if not isinstance(raw, str) or not re.fullmatch(r"\d+", raw) or len(raw) > MAX_TIMESTAMP_DIGITS:
        return None, "invalid"
    try:
        value = int(raw)
    except ValueError:
        return None, "invalid"
    unit = "microseconds" if value >= 100_000_000_000_000 else "milliseconds"
    microseconds = value if unit == "microseconds" else value * 1000
    if microseconds < 0 or microseconds > 253_402_300_799_999_999:
        return None, "invalid"
    return microseconds, unit


def datetime_from_us(value: int | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=value)
    except (OverflowError, ValueError):
        return None


def us_to_date(value: int | None) -> str:
    converted = datetime_from_us(value)
    return converted.date().isoformat() if converted is not None else ""


def validate_state_counters(state: dict[str, Any]) -> None:
    for name, cap in (
        ("list_requests", MAX_LIST_REQUESTS),
        ("object_gets", MAX_OBJECT_GETS),
        ("downloaded_persisted_bytes", MAX_DOWNLOADED_PERSISTED_BYTES),
    ):
        value = state.get(name)
        if type(value) is not int or value < 0 or value > cap:
            raise AcquisitionError(f"invalid state counter {name}: {value!r}")
    for name in ("failed_requests",):
        if not isinstance(state.get(name), list):
            raise AcquisitionError(f"invalid state field {name}")
    for name in ("object_acquisition", "listing_acquisition"):
        if not isinstance(state.get(name, {}), dict):
            raise AcquisitionError(f"invalid state field {name}")


def load_or_initialize_state() -> dict[str, Any]:
    ensure_owned_dir(STATE_DIR)
    if owned_file_exists(STATE_PATH):
        try:
            state = json.loads(read_owned_bytes(STATE_PATH))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AcquisitionError(f"invalid acquisition state JSON: {error}") from error
        if state.get("schema_version") != 1:
            raise AcquisitionError("unsupported acquisition state schema")
        state.setdefault("listing_acquisition", {})
        state.setdefault("last_request_started_epoch", None)
        state["last_request_started_monotonic"] = None
        validate_state_counters(state)
        return state
    state = {
        "schema_version": 1,
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "phase": "initialized",
        "list_requests": 0,
        "object_gets": 0,
        "downloaded_persisted_bytes": 0,
        "failed_requests": [],
        "object_acquisition": {},
        "listing_acquisition": {},
        "last_request_started_epoch": None,
        "last_request_started_monotonic": None,
        "stop_reason": None,
    }
    save_state(state)
    return state


def save_state(state: dict[str, Any]) -> None:
    validate_state_counters(state)
    serializable = dict(state)
    serializable["last_request_started_monotonic"] = None
    atomic_replace(STATE_PATH, canonical_json_bytes(serializable))


def pace_request(state: dict[str, Any]) -> None:
    now_epoch = time.time()
    now_monotonic = time.monotonic()
    waits = []
    previous_epoch = state.get("last_request_started_epoch")
    previous_monotonic = state.get("last_request_started_monotonic")
    if isinstance(previous_epoch, (int, float)):
        waits.append(MIN_REQUEST_INTERVAL_SECONDS - (now_epoch - previous_epoch))
    if isinstance(previous_monotonic, (int, float)):
        waits.append(MIN_REQUEST_INTERVAL_SECONDS - (now_monotonic - previous_monotonic))
    wait = max((value for value in waits if value > 0), default=0)
    if wait > 0:
        time.sleep(wait)
    state["last_request_started_epoch"] = time.time()
    state["last_request_started_monotonic"] = time.monotonic()


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


HTTP_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirectHandler())


def validate_request_url(url: str, request_kind: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment:
        raise AcquisitionError(f"unsafe request URL: {url}")
    if request_kind == "listing":
        if parsed.hostname != ALLOWED_LISTING_HOST or parsed.path != "/data.binance.vision":
            raise AcquisitionError(f"listing URL left frozen host/path: {url}")
    elif request_kind == "object":
        if parsed.hostname != ALLOWED_OBJECT_HOST or not parsed.path.startswith("/data/spot/monthly/klines/"):
            raise AcquisitionError(f"object URL left frozen host/path: {url}")
    else:
        raise AcquisitionError(f"unknown request kind: {request_kind}")


def read_response_bounded(response: Any, limit: int, expected_size: int | None) -> bytes:
    if limit < 0:
        raise CapStop("no persisted-byte budget remains")
    content_length_text = response.headers.get("Content-Length")
    if content_length_text is not None:
        if not re.fullmatch(r"\d+", content_length_text):
            raise AcquisitionError(f"invalid Content-Length: {content_length_text!r}")
        content_length = int(content_length_text)
        if expected_size is not None and content_length != expected_size:
            raise AcquisitionError(f"Content-Length {content_length} does not match listed size {expected_size}")
        if content_length > limit:
            raise CapStop(f"response Content-Length {content_length} exceeds remaining bound {limit}")
    chunks: list[bytes] = []
    total = 0
    while total <= limit:
        block = response.read(min(64 * 1024, limit + 1 - total))
        if not block:
            break
        chunks.append(block)
        total += len(block)
    if total > limit:
        raise CapStop(f"response exceeded bounded read limit {limit}")
    data = b"".join(chunks)
    if expected_size is not None and len(data) != expected_size:
        raise AcquisitionError(f"response size {len(data)} does not match listed size {expected_size}")
    return data


def request_bytes(
    state: dict[str, Any],
    url: str,
    request_kind: str,
    known_size: int | None = None,
) -> bytes:
    validate_request_url(url, request_kind)
    if RUNTIME_INPUT_SNAPSHOT is not None:
        verify_runtime_inputs(RUNTIME_INPUT_SNAPSHOT, state, "before_network_request")
    counter = "list_requests" if request_kind == "listing" else "object_gets"
    cap = MAX_LIST_REQUESTS if request_kind == "listing" else MAX_OBJECT_GETS
    if known_size is not None and (type(known_size) is not int or known_size < 0):
        raise AcquisitionError(f"invalid known object size: {known_size!r}")
    last_error: Exception | None = None
    attempts_made = 0

    for attempt in range(1, MAX_ATTEMPTS + 1):
        if state[counter] >= cap:
            raise CapStop(f"{request_kind} request cap reached before {url}")
        remaining = MAX_DOWNLOADED_PERSISTED_BYTES - state["downloaded_persisted_bytes"]
        per_response_cap = known_size if known_size is not None else MAX_LISTING_RESPONSE_BYTES
        read_limit = min(remaining, per_response_cap)
        if known_size is not None and known_size > remaining:
            raise CapStop(f"downloaded persisted byte cap would be exceeded before {url}")

        pace_request(state)
        state[counter] += 1
        attempts_made += 1
        save_state(state)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with HTTP_OPENER.open(request, timeout=60) as response:
                final_url = response.geturl()
                if final_url != url:
                    raise AcquisitionError(f"redirect or URL substitution refused: {url} -> {final_url}")
                data = read_response_bounded(response, read_limit, known_size)
            return data
        except urllib.error.HTTPError as error:
            last_error = error
            retryable = error.code == 429 or error.code >= 500
            if not retryable or attempt == MAX_ATTEMPTS:
                break
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            if attempt == MAX_ATTEMPTS:
                break
        time.sleep(BACKOFF_SECONDS * (2 ** (attempt - 1)))

    message = f"request failed after {attempts_made} attempt(s): {url}: {last_error}"
    state["failed_requests"].append({"kind": request_kind, "url": url, "attempts": attempts_made, "error": str(last_error)})
    save_state(state)
    raise AcquisitionError(message)


def persist_download(state: dict[str, Any], path: Path, data: bytes) -> str:
    if owned_file_exists(path):
        return write_new_or_hash_match(path, data)
    if state["downloaded_persisted_bytes"] + len(data) > MAX_DOWNLOADED_PERSISTED_BYTES:
        raise CapStop(f"persisting {path} would exceed byte cap")
    # Reserve bytes durably before creation. A crash may conservatively overcount,
    # but can never undercount and accidentally cross the frozen cap on resume.
    state["downloaded_persisted_bytes"] += len(data)
    save_state(state)
    return write_new_or_hash_match(path, data)


def listing_url(prefix: str, delimiter: str | None, continuation: str | None) -> str:
    query: dict[str, str] = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
    if delimiter is not None:
        query["delimiter"] = delimiter
    if continuation is not None:
        query["continuation-token"] = continuation
    return f"{S3_ENDPOINT}?{urllib.parse.urlencode(query)}"


def parse_listing_xml(data: bytes) -> dict[str, Any]:
    if len(data) > MAX_LISTING_RESPONSE_BYTES:
        raise AcquisitionError("listing XML exceeds frozen response bound")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise AcquisitionError(f"invalid listing XML: {error}") from error
    namespace_match = re.match(r"\{([^}]+)\}", root.tag)
    namespace = {"s3": namespace_match.group(1)} if namespace_match else {}
    ns_prefix = "s3:" if namespace else ""

    def text(name: str) -> str | None:
        node = root.find(f"{ns_prefix}{name}", namespace)
        return node.text if node is not None else None

    common_prefixes = []
    for node in root.findall(f"{ns_prefix}CommonPrefixes", namespace):
        child = node.find(f"{ns_prefix}Prefix", namespace)
        if child is not None and child.text:
            common_prefixes.append(child.text)
    objects = []
    for node in root.findall(f"{ns_prefix}Contents", namespace):
        values: dict[str, str] = {}
        for name in ("Key", "LastModified", "ETag", "Size"):
            child = node.find(f"{ns_prefix}{name}", namespace)
            values[name] = child.text if child is not None and child.text is not None else ""
        if not re.fullmatch(r"\d+", values["Size"]):
            raise AcquisitionError(f"invalid object size in listing: {values['Size']!r}")
        objects.append(
            {
                "key": values["Key"],
                "size": int(values["Size"]),
                "last_modified": values["LastModified"],
                "etag": values["ETag"].strip('"'),
            }
        )
    is_truncated_text = text("IsTruncated")
    if is_truncated_text not in ("true", "false"):
        raise AcquisitionError(f"invalid IsTruncated value: {is_truncated_text!r}")
    return {
        "prefix": text("Prefix") or "",
        "delimiter": text("Delimiter"),
        "continuation_token": text("ContinuationToken"),
        "is_truncated": is_truncated_text == "true",
        "next_continuation_token": text("NextContinuationToken"),
        "common_prefixes": common_prefixes,
        "objects": objects,
    }


def list_owned_regular_files(base: Path) -> list[Path]:
    try:
        info = base.lstat()
    except FileNotFoundError:
        return []
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise AcquisitionError(f"owned tree root is symlinked or not a directory: {base}")
    files: list[Path] = []
    stack = [base]
    while stack:
        current = stack.pop()
        with os.scandir(current) as entries:
            for entry in entries:
                path = Path(entry.path)
                if entry.is_symlink():
                    raise AcquisitionError(f"symlink in owned tree rejected: {path}")
                if entry.is_dir(follow_symlinks=False):
                    stack.append(path)
                elif entry.is_file(follow_symlinks=False):
                    files.append(path)
                else:
                    raise AcquisitionError(f"non-regular entry in owned tree: {path}")
    return sorted(files)


def verify_listing_chain(paths: list[Path], expected_prefix: str, expected_delimiter: str | None) -> None:
    continuation = None
    expected_page = 1
    for path in sorted(paths):
        match = re.fullmatch(r"page-(\d{3})\.xml", path.name)
        if not match or int(match.group(1)) != expected_page:
            raise AcquisitionError(f"non-contiguous listing page chain: {path}")
        parsed = parse_listing_xml(read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES))
        if parsed["prefix"] != expected_prefix or parsed["delimiter"] != expected_delimiter:
            raise AcquisitionError(f"adopted listing prefix/delimiter mismatch: {path}")
        if parsed["continuation_token"] != continuation:
            raise AcquisitionError(f"adopted listing continuation mismatch: {path}")
        continuation = parsed["next_continuation_token"]
        if parsed["is_truncated"] != (continuation is not None):
            raise AcquisitionError(f"adopted listing truncation mismatch: {path}")
        expected_page += 1
    if paths and continuation is not None:
        raise AcquisitionError(f"adopted listing chain is incomplete: {paths[-1].parent}")


def verify_adopted_listings_and_reconcile(state: dict[str, Any], provenance_data: bytes) -> dict[str, Any]:
    try:
        provenance = json.loads(provenance_data)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AcquisitionError(f"invalid adopted revision provenance: {error}") from error
    saved = provenance.get("saved_listings")
    checkpoint = provenance.get("cumulative_budget_counters_retained")
    if not isinstance(saved, dict) or not isinstance(checkpoint, dict):
        raise AcquisitionError("adopted revision provenance lacks listing/counter records")
    records = saved.get("files")
    if not isinstance(records, list) or len(records) != 128:
        raise AcquisitionError("adopted listing provenance must contain 128 files")
    if saved.get("counted_requests") != 129 or saved.get("persisted_response_count") != 128:
        raise AcquisitionError("adopted listing attempt/file counts changed")
    if checkpoint != {"list_requests": 129, "object_gets": 0, "downloaded_persisted_bytes": 2810628}:
        raise AcquisitionError("adopted checkpoint counters changed")
    adopted_paths: set[Path] = set()
    adopted_total = 0
    for record in records:
        if not isinstance(record, dict):
            raise AcquisitionError("invalid adopted listing record")
        relative = record.get("path")
        if not isinstance(relative, str) or not relative.startswith("high-flier-data/listings/"):
            raise AcquisitionError(f"invalid adopted listing path: {relative!r}")
        path = ROOT / relative
        data = read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES)
        if len(data) != record.get("bytes") or sha256_bytes(data) != record.get("sha256"):
            raise AcquisitionError(f"adopted listing hash/size mismatch: {path}")
        adopted_paths.add(path)
        adopted_total += len(data)
    if adopted_total != 2810628 or saved.get("persisted_bytes") != adopted_total:
        raise AcquisitionError("adopted listing byte total mismatch")
    if sha256_bytes(canonical_json_bytes(records)) != saved.get("record_set_sha256"):
        raise AcquisitionError("adopted listing record-set hash mismatch")
    actual_listing_paths = set(list_owned_regular_files(LISTINGS_DIR))
    if not adopted_paths.issubset(actual_listing_paths):
        raise AcquisitionError("one or more adopted listing files are missing")

    root_pages = [path for path in adopted_paths if path.parent == LISTINGS_DIR / "symbol-prefixes"]
    verify_listing_chain(root_pages, ARCHIVE_PREFIX, "/")
    by_directory: dict[Path, list[Path]] = defaultdict(list)
    for path in adopted_paths - set(root_pages):
        by_directory[path.parent].append(path)
    for directory, paths in sorted(by_directory.items(), key=lambda item: str(item[0])):
        symbol = directory.name
        if directory.parent != LISTINGS_DIR / "symbols" or not re.fullmatch(r"[A-Z0-9]+USDT", symbol):
            raise AcquisitionError(f"unexpected adopted listing directory: {directory}")
        verify_listing_chain(paths, f"{ARCHIVE_PREFIX}{symbol}/1d/", None)

    if state["list_requests"] < 129 or state["object_gets"] < 0 or state["downloaded_persisted_bytes"] < adopted_total:
        raise AcquisitionError("state counters regressed below adopted checkpoint")
    listing_bytes = sum(len(read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES)) for path in actual_listing_paths)
    downloaded_object_bytes = 0
    downloaded_object_count = 0
    raw_paths = list_owned_regular_files(RAW_DIR)
    object_records = state.get("object_acquisition", {})
    raw_keys = {str(path.relative_to(RAW_DIR)) for path in raw_paths}
    pending_statuses = {"download_pending_write", "external_reuse_pending_write"}
    final_statuses = {"downloaded", "reused_external_data"}
    for key, record in object_records.items():
        if not isinstance(record, dict) or record.get("status") not in pending_statuses | final_statuses:
            raise AcquisitionError(f"incomplete or invalid object state record: {key}")
        if key not in raw_keys and record.get("status") not in pending_statuses:
            raise AcquisitionError(f"completed object state record lacks raw file: {key}")
    for path in raw_paths:
        key = str(path.relative_to(RAW_DIR))
        record = object_records.get(key)
        if not isinstance(record, dict):
            raise AcquisitionError(f"raw object lacks state record: {key}")
        data = read_owned_bytes(path)
        if len(data) != record.get("bytes") or sha256_bytes(data) != record.get("sha256"):
            raise AcquisitionError(f"raw object/state mismatch: {key}")
        status = record.get("status")
        if status == "download_pending_write":
            record["status"] = status = "downloaded"
        elif status == "external_reuse_pending_write":
            record["status"] = status = "reused_external_data"
        if status == "downloaded":
            downloaded_object_bytes += len(data)
            downloaded_object_count += 1
    expected_persisted = listing_bytes + downloaded_object_bytes
    if state["downloaded_persisted_bytes"] < expected_persisted:
        raise AcquisitionError(
            f"persisted-byte counter undercounts verified files: {state['downloaded_persisted_bytes']} < {expected_persisted}"
        )
    state["unmaterialized_reserved_bytes"] = state["downloaded_persisted_bytes"] - expected_persisted
    if state["list_requests"] < len(actual_listing_paths) or state["object_gets"] < downloaded_object_count:
        raise AcquisitionError("request counters are inconsistent with persisted files")

    for path in adopted_paths:
        relative_data = str(path.relative_to(DATA_DIR))
        parsed = parse_listing_xml(read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES))
        data = read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES)
        adopted_record = {
            "status": "persisted",
            "path": relative_data,
            "prefix": parsed["prefix"],
            "delimiter": parsed["delimiter"],
            "continuation_token": parsed["continuation_token"],
            "next_continuation_token": parsed["next_continuation_token"],
            "page": int(path.stem.split("-")[1]),
            "bytes": len(data),
            "sha256": sha256_bytes(data),
        }
        prior_record = state["listing_acquisition"].get(relative_data)
        if isinstance(prior_record, dict) and "status" not in prior_record:
            prior_record = dict(prior_record, status="persisted")
        if prior_record is not None and prior_record != adopted_record:
            raise AcquisitionError(f"adopted listing state mismatch: {relative_data}")
        state["listing_acquisition"][relative_data] = adopted_record
    for path in actual_listing_paths - adopted_paths:
        relative_data = str(path.relative_to(DATA_DIR))
        if relative_data not in state["listing_acquisition"]:
            raise AcquisitionError(f"unrecorded listing file cannot be adopted: {relative_data}")
    for relative_data, record in state["listing_acquisition"].items():
        if not isinstance(record, dict) or record.get("status") not in ("persisted", "download_pending_write"):
            raise AcquisitionError(f"invalid listing state record: {relative_data}")
        path = DATA_DIR / relative_data
        if path not in actual_listing_paths:
            if record.get("status") == "download_pending_write":
                continue
            raise AcquisitionError(f"persisted listing state record lacks regular file: {relative_data}")
        data = read_owned_bytes(path, MAX_LISTING_RESPONSE_BYTES)
        if len(data) != record.get("bytes") or sha256_bytes(data) != record.get("sha256"):
            raise AcquisitionError(f"listing state/file mismatch: {relative_data}")
        record["status"] = "persisted"
    save_state(state)
    return provenance


def acquire_listing_pages(
    state: dict[str, Any],
    prefix: str,
    delimiter: str | None,
    target_dir: Path,
) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    common_prefixes: list[str] = []
    objects: list[dict[str, Any]] = []
    provenance: list[dict[str, Any]] = []
    continuation = None
    page_number = 1
    while True:
        page_path = target_dir / f"page-{page_number:03d}.xml"
        url = listing_url(prefix, delimiter, continuation)
        existed = owned_file_exists(page_path)
        data = (
            read_owned_bytes(page_path, MAX_LISTING_RESPONSE_BYTES)
            if existed
            else request_bytes(state, url, "listing")
        )
        parsed = parse_listing_xml(data)
        if parsed["prefix"] != prefix or parsed["delimiter"] != delimiter:
            raise AcquisitionError(f"listing prefix/delimiter mismatch in {page_path}")
        if parsed["continuation_token"] != continuation:
            raise AcquisitionError(f"listing continuation-chain mismatch in {page_path}")
        relative_path = str(page_path.relative_to(DATA_DIR))
        listing_record = {
            "status": "persisted" if existed else "download_pending_write",
            "path": relative_path,
            "prefix": prefix,
            "delimiter": delimiter,
            "continuation_token": continuation,
            "next_continuation_token": parsed["next_continuation_token"],
            "page": page_number,
            "bytes": len(data),
            "sha256": sha256_bytes(data),
        }
        existing_record = state["listing_acquisition"].get(relative_path)
        if isinstance(existing_record, dict) and "status" not in existing_record:
            existing_record = dict(existing_record, status="persisted")
        if existing_record is not None:
            comparable_record = dict(listing_record, status=existing_record.get("status"))
            if existing_record != comparable_record:
                raise AcquisitionError(f"listing state record mismatch: {relative_path}")
        state["listing_acquisition"][relative_path] = listing_record
        save_state(state)
        if not existed:
            persist_download(state, page_path, data)
            listing_record["status"] = "persisted"
            save_state(state)
        common_prefixes.extend(parsed["common_prefixes"])
        objects.extend(parsed["objects"])
        provenance.append(
            {
                "page": page_number,
                "path": str(page_path.relative_to(DATA_DIR)),
                "url": url,
                "bytes": len(data),
                "sha256": sha256_bytes(data),
                "acquisition": "persisted",
            }
        )
        if not parsed["is_truncated"]:
            break
        continuation = parsed["next_continuation_token"]
        if not continuation:
            raise AcquisitionError(f"truncated listing lacks continuation token: {prefix}")
        page_number += 1
    return common_prefixes, objects, provenance


def discover_inventory(state: dict[str, Any]) -> dict[str, Any]:
    root_prefixes, _, root_provenance = acquire_listing_pages(
        state, ARCHIVE_PREFIX, "/", LISTINGS_DIR / "symbol-prefixes"
    )
    symbols = sorted(
        prefix[len(ARCHIVE_PREFIX) : -1]
        for prefix in root_prefixes
        if prefix.startswith(ARCHIVE_PREFIX)
        and prefix.endswith("USDT/")
        and "/" not in prefix[len(ARCHIVE_PREFIX) : -1]
    )
    if len(symbols) != len(set(symbols)):
        raise AcquisitionError("duplicate USDT symbol prefixes discovered")

    by_symbol: dict[str, list[dict[str, Any]]] = {}
    listing_provenance = list(root_provenance)
    for index, symbol in enumerate(symbols, start=1):
        prefix = f"{ARCHIVE_PREFIX}{symbol}/1d/"
        _, objects, provenance = acquire_listing_pages(
            state, prefix, None, LISTINGS_DIR / "symbols" / symbol
        )
        by_symbol[symbol] = sorted(objects, key=lambda item: item["key"])
        listing_provenance.extend(provenance)
        if index % 50 == 0 or index == len(symbols):
            print(f"inventory {index}/{len(symbols)} symbols; listing requests={state['list_requests']}", flush=True)

    normalized_objects = sorted(
        (dict(item, symbol=symbol) for symbol, records in by_symbol.items() for item in records),
        key=lambda item: item["key"],
    )
    return {
        "symbols": symbols,
        "by_symbol": by_symbol,
        "objects": normalized_objects,
        "listing_provenance": listing_provenance,
    }


def object_index(inventory: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in inventory["objects"]}


def external_reuse_path(key: str) -> Path | None:
    if key.endswith(".CHECKSUM"):
        return None
    name = Path(key).name
    candidates = []
    if name.startswith("BTCUSDT-") or name.startswith("ETHUSDT-"):
        candidates.append(ROOT / "external-data" / name)
    candidates.append(ROOT / "high-flier-data-probe" / f"binance-spot-monthly-{name}")
    for candidate in candidates:
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode):
            return candidate
    return None


def obtain_object(
    state: dict[str, Any],
    key: str,
    listed: dict[str, Any],
    expected_sha256: str | None = None,
    allow_external_zip_reuse: bool = False,
) -> tuple[Path, dict[str, Any]]:
    target = raw_path_for_key(key)
    prior = state["object_acquisition"].get(key)
    if owned_file_exists(target):
        allowed_statuses = (
            ("downloaded", "download_pending_write")
            if key.endswith(".CHECKSUM")
            else ("downloaded", "download_pending_write", "reused_external_data", "external_reuse_pending_write")
        )
        if not isinstance(prior, dict) or prior.get("status") not in allowed_statuses:
            raise AcquisitionError(f"existing raw object lacks trusted state provenance: {target}")
        data = read_owned_bytes(target)
        actual_sha = sha256_bytes(data)
        if actual_sha != prior.get("sha256") or len(data) != prior.get("bytes"):
            raise AcquisitionError(f"existing raw object/state hash mismatch: {target}")
        if expected_sha256 is not None and actual_sha != expected_sha256:
            raise AcquisitionError(f"existing raw object checksum mismatch: {target}")
        if len(data) != listed["size"]:
            raise AcquisitionError(f"existing raw object size mismatch: {target}")
        if prior["status"] == "download_pending_write":
            prior["status"] = "downloaded"
            save_state(state)
        elif prior["status"] == "external_reuse_pending_write":
            prior["status"] = "reused_external_data"
            save_state(state)
        return target, prior

    if allow_external_zip_reuse and expected_sha256 is not None:
        reuse = external_reuse_path(key)
        if reuse is not None:
            reuse_data = read_input_bytes(reuse)
            reuse_sha = sha256_bytes(reuse_data)
            if len(reuse_data) == listed["size"] and reuse_sha == expected_sha256:
                record = {
                    "status": "external_reuse_pending_write",
                    "bytes": len(reuse_data),
                    "sha256": reuse_sha,
                    "source_path": str(reuse.relative_to(ROOT)),
                    "source_sha256": reuse_sha,
                    "listed_size": listed["size"],
                }
                state["object_acquisition"][key] = record
                save_state(state)
                write_new_or_hash_match(target, reuse_data)
                record["status"] = "reused_external_data"
                save_state(state)
                return target, record

    data = request_bytes(state, OBJECT_BASE_URL + key, "object", known_size=listed["size"])
    actual_sha = sha256_bytes(data)
    if expected_sha256 is not None and actual_sha != expected_sha256:
        raise AcquisitionError(f"downloaded checksum mismatch for {key}")
    pending = {
        "status": "download_pending_write",
        "bytes": len(data),
        "sha256": actual_sha,
        "listed_size": listed["size"],
    }
    state["object_acquisition"][key] = pending
    save_state(state)
    persist_download(state, target, data)
    record = dict(pending, status="downloaded")
    state["object_acquisition"][key] = record
    save_state(state)
    return target, record


def expected_checksum(sidecar_data: bytes, key: str) -> str:
    text = sidecar_data.decode("utf-8").strip()
    match = re.fullmatch(r"([0-9a-fA-F]{64})(?:\s+\*?.*)?", text)
    if not match:
        raise AcquisitionError(f"invalid SHA-256 sidecar for {key}")
    return match.group(1).lower()


def obtain_archive_pair(
    state: dict[str, Any],
    zip_key: str,
    objects: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    checksum_key = zip_key + ".CHECKSUM"
    zip_url = OBJECT_BASE_URL + zip_key
    checksum_url = OBJECT_BASE_URL + checksum_key
    common = {"zip_key": zip_key, "checksum_key": checksum_key, "zip_url": zip_url, "checksum_url": checksum_url}
    if zip_key not in objects:
        return {"status": "missing_archive", **common}
    if checksum_key not in objects:
        return {"status": "missing_checksum", **common}
    if objects[zip_key]["size"] > MAX_ARCHIVE_ZIP_BYTES:
        return {"status": "archive_safety_limit", **common, "error": "listed ZIP exceeds frozen compressed-byte bound"}
    if objects[checksum_key]["size"] > 64 * 1024:
        return {"status": "archive_safety_limit", **common, "error": "listed checksum exceeds frozen byte bound"}
    try:
        # CHECKSUM sidecars are never reused from external-data/probe by size.
        # A sidecar is either freshly fetched or an owned copy whose exact hash
        # is pinned in state from a prior successful current-revision fetch.
        checksum_path, checksum_acquisition = obtain_object(
            state, checksum_key, objects[checksum_key], allow_external_zip_reuse=False
        )
        expected_sha = expected_checksum(read_owned_bytes(checksum_path, 64 * 1024), checksum_key)
        zip_path, zip_acquisition = obtain_object(
            state, zip_key, objects[zip_key], expected_sha, allow_external_zip_reuse=True
        )
        return {
            "status": "verified",
            **common,
            "zip_path": str(zip_path.relative_to(DATA_DIR)),
            "checksum_path": str(checksum_path.relative_to(DATA_DIR)),
            "expected_sha256": expected_sha,
            "actual_sha256": sha256_file(zip_path),
            "zip_bytes": len(read_owned_bytes(zip_path)),
            "checksum_bytes": len(read_owned_bytes(checksum_path, 64 * 1024)),
            "listed": objects[zip_key],
            "checksum_listed": objects[checksum_key],
            "zip_acquisition": zip_acquisition,
            "checksum_acquisition": checksum_acquisition,
        }
    except CapStop:
        raise
    except Exception as error:  # Preserve a per-archive failure instead of survivor-filtering it.
        return {"status": "acquisition_failure", **common, "error": str(error)}


def row_status_and_values(fields: list[str]) -> dict[str, Any]:
    original_count = len(fields)
    padded = fields[:12] + [""] * max(0, 12 - len(fields))
    padded = padded[:12]
    (
        open_time_raw,
        open_text,
        high_text,
        low_text,
        close_text,
        base_volume_text,
        close_time_raw,
        quote_volume_text,
        trade_count_text,
        taker_base_text,
        taker_quote_text,
        _ignore,
    ) = padded
    statuses: list[str] = []
    if original_count != 12:
        statuses.append("field_count")

    open_value = parse_decimal(open_text, strictly_positive=True)
    high_value = parse_decimal(high_text, strictly_positive=True)
    low_value = parse_decimal(low_text, strictly_positive=True)
    close_value = parse_decimal(close_text, strictly_positive=True)
    price_values = (open_value, high_value, low_value, close_value)
    for label, value in zip(("open", "high", "low", "close"), price_values):
        if value is None:
            statuses.append(f"invalid_{label}")
    if all(value is not None for value in price_values):
        assert open_value is not None and high_value is not None and low_value is not None and close_value is not None
        if high_value < max(open_value, close_value) or low_value > min(open_value, close_value) or low_value > high_value:
            statuses.append("invalid_high_low")

    volume_values = []
    for label, text in (
        ("base_volume", base_volume_text),
        ("quote_volume", quote_volume_text),
        ("taker_buy_base_volume", taker_base_text),
        ("taker_buy_quote_volume", taker_quote_text),
    ):
        value = parse_decimal(text, nonnegative=True)
        volume_values.append(value)
        if value is None:
            statuses.append(f"invalid_{label}")
        elif value == 0:
            statuses.append(f"zero_{label}")

    try:
        if len(trade_count_text) > MAX_NUMERIC_FIELD_CHARS or not re.fullmatch(r"0|[1-9]\d*", trade_count_text):
            raise ValueError
        trade_count = int(trade_count_text)
        if trade_count == 0:
            statuses.append("zero_trade_count")
    except ValueError:
        trade_count = None
        statuses.append("invalid_trade_count")

    open_time_us, open_unit = timestamp_to_us(open_time_raw)
    close_time_us, close_unit = timestamp_to_us(close_time_raw)
    if open_time_us is None:
        statuses.append("invalid_open_timestamp")
    if close_time_us is None:
        statuses.append("invalid_close_timestamp")
    timestamp_unit = open_unit if open_unit == close_unit else f"{open_unit}/{close_unit}"
    if open_unit != close_unit:
        statuses.append("timestamp_unit_mismatch")
    date = us_to_date(open_time_us)
    if not date:
        statuses.append("invalid_utc_date")
    if open_time_us is not None:
        open_datetime = datetime_from_us(open_time_us)
        if open_datetime is None:
            statuses.append("invalid_open_timestamp_range")
        elif any((open_datetime.hour, open_datetime.minute, open_datetime.second, open_datetime.microsecond)):
            statuses.append("not_utc_midnight")
    if open_time_us is not None and close_time_us is not None and open_unit == close_unit:
        duration = close_time_us - open_time_us
        expected_duration = 86_399_999_000 if open_unit == "milliseconds" else 86_399_999_999
        if duration != expected_duration:
            statuses.append("partial_interval" if 0 < duration < expected_duration else "invalid_interval")
    if date:
        expected_unit = "milliseconds" if date < "2025-01-01" else "microseconds"
        if open_unit != expected_unit or close_unit != expected_unit:
            statuses.append("timestamp_unit_exception")

    invalidating_prefixes = (
        "field_count",
        "invalid_",
        "timestamp_unit_mismatch",
        "not_utc_midnight",
        "partial_interval",
        "timestamp_unit_exception",
    )
    complete_valid = not any(status == prefix or status.startswith(prefix) for status in statuses for prefix in invalidating_prefixes)
    return {
        "fields": padded,
        "date": date,
        "open_time_us": open_time_us,
        "close_time_us": close_time_us,
        "timestamp_unit": timestamp_unit,
        "quote_volume_decimal": volume_values[1],
        "statuses": statuses,
        "complete_valid": complete_valid,
        "trade_count_value": trade_count,
    }


def parse_archive(record: dict[str, Any]) -> dict[str, Any]:
    if record["status"] != "verified":
        return {"status": record["status"], "rows": [], "error": record.get("error")}
    path = DATA_DIR / record["zip_path"]
    try:
        zip_data = read_owned_bytes(path, MAX_ARCHIVE_ZIP_BYTES)
        with zipfile.ZipFile(io.BytesIO(zip_data), "r") as archive:
            infos = [info for info in archive.infolist() if not info.is_dir()]
            if len(infos) != 1:
                raise AcquisitionError(f"expected one CSV member, found {[info.filename for info in infos]}")
            info = infos[0]
            if info.flag_bits & 0x1:
                raise AcquisitionError("encrypted ZIP member refused")
            if info.file_size > MAX_EXPANDED_CSV_BYTES:
                raise AcquisitionError(f"expanded CSV exceeds {MAX_EXPANDED_CSV_BYTES} bytes")
            member = info.filename
            expanded = bytearray()
            with archive.open(info, "r") as raw:
                while len(expanded) <= MAX_EXPANDED_CSV_BYTES:
                    block = raw.read(min(64 * 1024, MAX_EXPANDED_CSV_BYTES + 1 - len(expanded)))
                    if not block:
                        break
                    expanded.extend(block)
            if len(expanded) > MAX_EXPANDED_CSV_BYTES or len(expanded) != info.file_size:
                raise AcquisitionError("expanded CSV size mismatch or bound exceeded")
        physical_lines = bytes(expanded).splitlines()
        if len(physical_lines) > MAX_MONTHLY_ROWS:
            raise AcquisitionError(f"monthly CSV exceeds {MAX_MONTHLY_ROWS} rows")
        rows = []
        for source_row, line in enumerate(physical_lines, start=1):
            if len(line) > MAX_CSV_LINE_BYTES:
                raise AcquisitionError(f"CSV line {source_row} exceeds {MAX_CSV_LINE_BYTES} bytes")
            try:
                decoded = line.decode("utf-8")
                parsed_rows = list(csv.reader([decoded], strict=True))
            except (UnicodeDecodeError, csv.Error) as error:
                raise AcquisitionError(f"invalid CSV line {source_row}: {error}") from error
            if len(parsed_rows) != 1:
                raise AcquisitionError(f"unexpected CSV parse result on line {source_row}")
            fields = parsed_rows[0]  # Blank physical rows intentionally become [].
            parsed = row_status_and_values(fields)
            parsed.update({"source_row": source_row, "member": member})
            rows.append(parsed)
    except Exception as error:
        return {"status": "invalid_zip_or_csv", "rows": [], "error": str(error)}

    source_order_violations = []
    previous_time = None
    date_counts = Counter(row["date"] for row in rows if row["date"])
    duplicate_dates = sorted(date for date, count in date_counts.items() if count > 1)
    for row in rows:
        if row["date"] in duplicate_dates:
            row["statuses"].append("duplicate_date")
            row["complete_valid"] = False
        current_time = row["open_time_us"]
        if current_time is not None and previous_time is not None and current_time <= previous_time:
            row["statuses"].append("source_order_violation")
            source_order_violations.append({"source_row": row["source_row"], "open_time_us": current_time})
        if current_time is not None:
            previous_time = current_time

    return {
        "status": "parsed",
        "rows": rows,
        "member": member,
        "duplicate_dates": duplicate_dates,
        "source_order_violations": source_order_violations,
    }


def leveraged_evidence(symbol: str, symbol_set: set[str]) -> dict[str, Any] | None:
    base = symbol[: -len("USDT")]
    for suffix, reciprocal_suffix in LEVERAGED_SUFFIX_PAIRS:
        if not base.endswith(suffix) or len(base) <= len(suffix):
            continue
        underlying = base[: -len(suffix)]
        underlying_symbol = underlying + "USDT"
        reciprocal_symbol = underlying + reciprocal_suffix + "USDT"
        same_symbol = underlying + suffix + "USDT"
        if underlying_symbol in symbol_set and reciprocal_symbol in symbol_set and same_symbol in symbol_set:
            return {
                "rule": "reciprocal_pair_plus_underlying",
                "suffix": suffix,
                "underlying": underlying,
                "underlying_symbol": underlying_symbol,
                "reciprocal_symbols": sorted((same_symbol, reciprocal_symbol)),
            }
    return None


def choose_primary_reason(reasons: Iterable[str]) -> str:
    reason_set = set(reasons)
    if "selected" in reason_set:
        return "selected"
    if "eligible_below_rank_50" in reason_set:
        return "eligible_below_rank_50"
    for reason in PRIMARY_REASON_ORDER:
        if reason in reason_set:
            return reason
    raise AcquisitionError(f"no primary reason for {sorted(reason_set)}")


def sort_eligible_by_formation_volume(records: list[dict[str, Any]]) -> None:
    # Python's sort is stable. Pre-sort raw symbols ascending, then sort direct
    # Decimal values descending so unary negation cannot apply Decimal context
    # precision and collapse distinct high-precision volumes into equal keys.
    records.sort(key=lambda item: item["symbol"])
    records.sort(key=lambda item: Decimal(item["formation_quote_volume"]), reverse=True)


def build_cohorts(
    state: dict[str, Any], inventory: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    objects = object_index(inventory)
    symbols = inventory["symbols"]
    candidates: list[dict[str, Any]] = []
    archive_records: dict[str, dict[str, Any]] = {}

    for cohort_year in COHORT_YEARS:
        formation_month = f"{cohort_year - 1:04d}-12"
        historical_symbol_set = {
            symbol
            for symbol in symbols
            if any(
                item["key"].endswith(".zip")
                and not item["key"].endswith(".zip.CHECKSUM")
                and (match := re.search(r"-(\d{4}-\d{2})\.zip$", item["key"])) is not None
                and match.group(1) <= formation_month
                for item in inventory["by_symbol"][symbol]
            )
        }
        historical_symbols = sorted(historical_symbol_set)
        eligible: list[dict[str, Any]] = []
        year_candidates: list[dict[str, Any]] = []
        for symbol_index, symbol in enumerate(historical_symbols, start=1):
            base = symbol[:-4]
            reasons: list[str] = []
            evidence = leveraged_evidence(symbol, historical_symbol_set)
            key = archive_key(symbol, formation_month)
            record: dict[str, Any] = {
                "cohort_year": cohort_year,
                "reporting_block": reporting_block(cohort_year),
                "formation_month": formation_month,
                "symbol": symbol,
                "base": base,
                "identity_ambiguity": symbol in IDENTITY_SYMBOLS,
                "leveraged_evidence": evidence,
                "formation_archive_key": key,
                "formation_archive_url": OBJECT_BASE_URL + key,
                "formation_checksum_url": OBJECT_BASE_URL + key + ".CHECKSUM",
                "formation_archive_present": key in objects,
                "formation_valid_days": 0,
                "formation_quote_volume": None,
                "formation_rank": None,
                "selected": False,
                "all_reasons": reasons,
            }
            if base in STABLE_BASES:
                reasons.append("stable_base")
            elif evidence is not None:
                reasons.append("structured_leveraged_product")
            else:
                if key not in archive_records:
                    archive_records[key] = obtain_archive_pair(state, key, objects)
                pair = archive_records[key]
                if pair["status"] == "missing_archive":
                    reasons.append("missing_formation_archive")
                elif pair["status"] != "verified":
                    reasons.append("checksum_or_archive_failure")
                    record["formation_archive_error"] = pair.get("error", pair["status"])
                else:
                    parsed = parse_archive(pair)
                    if parsed["status"] != "parsed":
                        reasons.append("invalid_zip_or_csv")
                        record["formation_archive_error"] = parsed.get("error")
                    else:
                        rows = parsed["rows"]
                        valid_by_date = {
                            row["date"]: row
                            for row in rows
                            if row["date"].startswith(formation_month) and row["complete_valid"]
                        }
                        record["formation_source_rows"] = len(rows)
                        record["formation_valid_days"] = len(valid_by_date)
                        record["formation_duplicate_dates"] = parsed["duplicate_dates"]
                        invalid_counts = Counter(
                            status
                            for row in rows
                            for status in row["statuses"]
                            if status.startswith("invalid_")
                            or status in ("field_count", "partial_interval", "timestamp_unit_exception")
                        )
                        record["formation_invalid_reason_counts"] = dict(sorted(invalid_counts.items()))
                        if f"{formation_month}-01" not in valid_by_date:
                            reasons.append("missing_december_1")
                        if f"{formation_month}-31" not in valid_by_date:
                            reasons.append("missing_december_31")
                        if len(valid_by_date) < 28:
                            reasons.append("fewer_than_28_valid_days")
                        if parsed["duplicate_dates"]:
                            reasons.append("duplicate_utc_date")
                        if invalid_counts:
                            reasons.append("invalid_required_bar_fields")
                        eligibility_failures = {
                            "missing_december_1",
                            "missing_december_31",
                            "fewer_than_28_valid_days",
                            "duplicate_utc_date",
                        }
                        if not eligibility_failures.intersection(reasons):
                            quote_values = [row["quote_volume_decimal"] for row in valid_by_date.values()]
                            if any(value is None for value in quote_values):
                                raise AcquisitionError("valid formation row lacks parsed quote volume")
                            record["formation_quote_volume"] = exact_decimal_sum(quote_values)
                            eligible.append(record)
            year_candidates.append(record)
            if symbol_index % 100 == 0 or symbol_index == len(historical_symbols):
                print(
                    f"formation {cohort_year}: {symbol_index}/{len(historical_symbols)}; object GETs={state['object_gets']}; bytes={state['downloaded_persisted_bytes']}",
                    flush=True,
                )

        sort_eligible_by_formation_volume(eligible)
        for rank, record in enumerate(eligible, start=1):
            record["formation_rank"] = rank
            if rank <= TOP_N:
                record["selected"] = True
                record["all_reasons"].append("selected")
            else:
                record["all_reasons"].append("eligible_below_rank_50")
        for record in year_candidates:
            record["primary_reason"] = choose_primary_reason(record["all_reasons"])
        candidates.extend(year_candidates)

    selected = [record for record in candidates if record["selected"]]
    return candidates, selected, archive_records


def assign_identity_segments(symbol: str, rows: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    sorted_rows = sorted(
        rows,
        key=lambda row: (
            row["open_time_us"] if row["open_time_us"] is not None else math.inf,
            row["source_archive"],
            row["source_row"],
        ),
    )
    event = next((item for item in IDENTITY_EVENTS if symbol in item["symbols"]), None)
    segment_number = 1
    previous_date = None
    segments: list[dict[str, Any]] = []
    current_segment_id = f"{symbol}:segment-{segment_number:02d}"
    current_dates: list[str] = []

    def finish_segment() -> None:
        if current_dates:
            segments.append(
                {
                    "identity_segment_id": current_segment_id,
                    "first_date": min(current_dates),
                    "last_date": max(current_dates),
                    "row_count": len(current_dates),
                }
            )

    assigned = []
    for row in sorted_rows:
        date = row["date"]
        explicit_boundary = bool(
            event
            and event.get("first_post_event_date")
            and date == event["first_post_event_date"]
            and previous_date is not None
        )
        gap_boundary = False
        if date and previous_date and date != previous_date:
            delta = (datetime.fromisoformat(date) - datetime.fromisoformat(previous_date)).days
            gap_boundary = delta > 1
        if explicit_boundary or gap_boundary:
            finish_segment()
            segment_number += 1
            current_segment_id = f"{symbol}:segment-{segment_number:02d}"
            current_dates = []
        row["identity_segment_id"] = current_segment_id
        if event:
            if event.get("last_pre_event_date") and date <= event["last_pre_event_date"]:
                row["identity_event_side"] = "pre"
            elif event.get("first_post_event_date") and date >= event["first_post_event_date"]:
                row["identity_event_side"] = "post"
            else:
                row["identity_event_side"] = "boundary_gap"
        if date:
            current_dates.append(date)
            previous_date = date
        assigned.append(current_segment_id)
    finish_segment()
    return assigned, segments


def month_end_date(month: str) -> str:
    year, month_number = (int(part) for part in month.split("-"))
    return f"{year:04d}-{month_number:02d}-{calendar.monthrange(year, month_number)[1]:02d}"


def date_gap_intervals(present_dates: set[str], start_date: str, end_date: str) -> list[dict[str, Any]]:
    start = datetime.fromisoformat(start_date).date()
    end = datetime.fromisoformat(end_date).date()
    gaps: list[dict[str, Any]] = []
    run_start = None
    current = start
    while current <= end:
        key = current.isoformat()
        if key not in present_dates and run_start is None:
            run_start = current
        if key in present_dates and run_start is not None:
            run_end = current - timedelta(days=1)
            gaps.append({"start": run_start.isoformat(), "end": run_end.isoformat(), "days": (run_end - run_start).days + 1})
            run_start = None
        current += timedelta(days=1)
    if run_start is not None:
        gaps.append({"start": run_start.isoformat(), "end": end.isoformat(), "days": (end - run_start).days + 1})
    return gaps


def acquire_follow_and_build_panel(
    state: dict[str, Any],
    selected: list[dict[str, Any]],
    inventory: dict[str, Any],
    archive_records: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, dict[str, Any]]]:
    objects = object_index(inventory)
    requests: list[tuple[int, str, str]] = []
    for member in selected:
        year = member["cohort_year"]
        first = f"{year - 1:04d}-11"
        last = f"{year + 1:04d}-02"
        for month in months_inclusive(first, last):
            requests.append((year, member["symbol"], month))
    unique_keys = sorted({archive_key(symbol, month) for _, symbol, month in requests})
    for index, key in enumerate(unique_keys, start=1):
        if key not in archive_records:
            archive_records[key] = obtain_archive_pair(state, key, objects)
        if index % 100 == 0 or index == len(unique_keys):
            print(
                f"follow archives {index}/{len(unique_keys)}; object GETs={state['object_gets']}; bytes={state['downloaded_persisted_bytes']}",
                flush=True,
            )

    parsed_cache: dict[str, dict[str, Any]] = {}
    panel: list[dict[str, Any]] = []
    quality: dict[str, Any] = {}
    for member in selected:
        year = member["cohort_year"]
        symbol = member["symbol"]
        first = f"{year - 1:04d}-11"
        last = f"{year + 1:04d}-02"
        months = months_inclusive(first, last)
        symbol_rows: list[dict[str, Any]] = []
        present_months: list[str] = []
        missing_months: list[dict[str, str]] = []
        archive_outcomes: list[dict[str, Any]] = []
        for month in months:
            key = archive_key(symbol, month)
            pair = archive_records[key]
            archive_outcomes.append({"month": month, "key": key, "status": pair["status"], "error": pair.get("error")})
            if pair["status"] != "verified":
                missing_months.append({"month": month, "reason": pair["status"]})
                continue
            present_months.append(month)
            if key not in parsed_cache:
                parsed_cache[key] = parse_archive(pair)
            parsed = parsed_cache[key]
            if parsed["status"] != "parsed":
                missing_months.append({"month": month, "reason": parsed["status"]})
                continue
            archive_name = Path(key).name
            for row in parsed["rows"]:
                fields = row["fields"]
                symbol_rows.append(
                    {
                        "date": row["date"],
                        "open_time_us": row["open_time_us"],
                        "close_time_us": row["close_time_us"],
                        "open_time_raw": fields[0],
                        "close_time_raw": fields[6],
                        "timestamp_unit": row["timestamp_unit"],
                        "open": fields[1],
                        "high": fields[2],
                        "low": fields[3],
                        "close": fields[4],
                        "base_volume": fields[5],
                        "quote_volume": fields[7],
                        "trade_count": fields[8],
                        "taker_buy_base_volume": fields[9],
                        "taker_buy_quote_volume": fields[10],
                        "source_archive": archive_name,
                        "source_row": row["source_row"],
                        "statuses": list(row["statuses"]),
                        "complete_valid": row["complete_valid"],
                    }
                )

        for event in IDENTITY_EVENTS:
            if symbol not in event["symbols"]:
                continue
            first_post = event.get("first_post_event_bar_open_utc")
            if first_post and not first_post.endswith("T00:00:00Z"):
                event_date = first_post[:10]
                if symbol == event["new_symbol"]:
                    for row in symbol_rows:
                        if row["date"] == event_date:
                            row["statuses"].append("non_midnight_first_trade")
                            row["complete_valid"] = False
            last_pre = event.get("old_boundary_utc")
            if last_pre and not last_pre.endswith("T00:00:00Z") and symbol == event["old_symbol"]:
                event_date = last_pre[:10]
                for row in symbol_rows:
                    if row["date"] == event_date:
                        row["statuses"].append("event_partial_terminal")
                        row["complete_valid"] = False

        for edge in QUALITY_EDGES:
            if symbol != edge["symbol"]:
                continue
            for row in symbol_rows:
                if row["date"] == edge["date"]:
                    if edge["status"] not in row["statuses"]:
                        row["statuses"].append(edge["status"])
                    row["complete_valid"] = False

        symbol_rows.sort(
            key=lambda row: (
                row["open_time_us"] if row["open_time_us"] is not None else math.inf,
                row["source_archive"],
                row["source_row"],
            )
        )
        date_counts = Counter(row["date"] for row in symbol_rows if row["date"])
        duplicate_dates = sorted(date for date, count in date_counts.items() if count > 1)
        for row in symbol_rows:
            if row["date"] in duplicate_dates and "duplicate_date" not in row["statuses"]:
                row["statuses"].append("duplicate_date")
                row["complete_valid"] = False

        _, segments = assign_identity_segments(symbol, symbol_rows)
        status_counts = Counter(status for row in symbol_rows for status in row["statuses"])
        raw_dates = {row["date"] for row in symbol_rows if row["date"]}
        valid_dates = {row["date"] for row in symbol_rows if row["date"] and row["complete_valid"]}
        requested_start_date = f"{first}-01"
        requested_end_date = month_end_date(last)
        raw_presence_gaps = date_gap_intervals(raw_dates, requested_start_date, requested_end_date)
        complete_valid_gaps = date_gap_intervals(valid_dates, requested_start_date, requested_end_date)
        source_order_violations = sum("source_order_violation" in row["statuses"] for row in symbol_rows)
        unit_counts = Counter(row["timestamp_unit"] for row in symbol_rows)
        quality_key = f"{year}:{symbol}"
        quality[quality_key] = {
            "cohort_year": year,
            "reporting_block": reporting_block(year),
            "symbol": symbol,
            "requested_months": months,
            "present_months": present_months,
            "missing_months": missing_months,
            "archive_outcomes": archive_outcomes,
            "source_rows": len(symbol_rows),
            "complete_valid_rows": sum(row["complete_valid"] for row in symbol_rows),
            "duplicate_dates": duplicate_dates,
            "source_order_violations": source_order_violations,
            "requested_start_date": requested_start_date,
            "requested_end_date": requested_end_date,
            "raw_presence_gaps": raw_presence_gaps,
            "complete_valid_gaps": complete_valid_gaps,
            "timestamp_unit_counts": dict(sorted(unit_counts.items())),
            "timestamp_unit_exceptions": status_counts.get("timestamp_unit_exception", 0),
            "invalid_row_reason_counts": dict(sorted(status_counts.items())),
            "first_date": min((row["date"] for row in symbol_rows if row["date"]), default=None),
            "last_date": max((row["date"] for row in symbol_rows if row["date"]), default=None),
            "identity_segments": segments,
            "identity_events": [event for event in IDENTITY_EVENTS if symbol in event["symbols"]],
            "quality_edges": [edge for edge in QUALITY_EDGES if symbol == edge["symbol"]],
        }

        for row in symbol_rows:
            detail_statuses = sorted(set(row["statuses"]))
            if any(status in detail_statuses for status in ("partial_interval", "event_partial_terminal", "non_midnight_first_trade")):
                status_class = "partial_terminal"
            elif row["complete_valid"]:
                status_class = "complete"
            else:
                status_class = "invalid"
            bar_status = "|".join((status_class, *detail_statuses)) if detail_statuses else status_class
            panel.append(
                {
                    "cohort_year": year,
                    "reporting_block": reporting_block(year),
                    "instrument_id": row["identity_segment_id"],
                    "symbol": symbol,
                    "identity_segment_id": row["identity_segment_id"],
                    "date": row["date"],
                    "open_time_us": "" if row["open_time_us"] is None else row["open_time_us"],
                    "close_time_us": "" if row["close_time_us"] is None else row["close_time_us"],
                    "open_time_raw": row["open_time_raw"],
                    "close_time_raw": row["close_time_raw"],
                    "timestamp_unit": row["timestamp_unit"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "close": row["close"],
                    "base_volume": row["base_volume"],
                    "quote_volume": row["quote_volume"],
                    "trade_count": row["trade_count"],
                    "taker_buy_base_volume": row["taker_buy_base_volume"],
                    "taker_buy_quote_volume": row["taker_buy_quote_volume"],
                    "source_archive": row["source_archive"],
                    "source_row": row["source_row"],
                    "bar_status": bar_status,
                }
            )

    panel.sort(key=lambda row: (row["cohort_year"], row["instrument_id"], row["date"], row["source_archive"], row["source_row"]))
    return panel, quality, archive_records


def csv_bytes(columns: tuple[str, ...], rows: Iterable[dict[str, Any]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode("utf-8")


def candidate_flow(candidates: list[dict[str, Any]], year: int) -> dict[str, Any]:
    subset = sorted((record for record in candidates if record["cohort_year"] == year), key=lambda item: item["symbol"])
    primary = Counter(record["primary_reason"] for record in subset)
    all_reasons = Counter(reason for record in subset for reason in record["all_reasons"])
    remaining = list(subset)
    stage_specs = (
        ("stable_base", {"stable_base"}),
        ("structured_leveraged_product", {"structured_leveraged_product"}),
        ("missing_formation_archive", {"missing_formation_archive"}),
        ("checksum_or_archive_failure", {"checksum_or_archive_failure"}),
        ("invalid_zip_or_csv", {"invalid_zip_or_csv"}),
        (
            "formation_bar_eligibility",
            {"missing_december_1", "missing_december_31", "fewer_than_28_valid_days", "duplicate_utc_date", "invalid_required_bar_fields"},
        ),
        ("rank_below_top_50", {"eligible_below_rank_50"}),
    )
    stages = []
    for name, reasons in stage_specs:
        before = len(remaining)
        excluded = sorted(record["symbol"] for record in remaining if record["primary_reason"] in reasons)
        remaining = [record for record in remaining if record["primary_reason"] not in reasons]
        stages.append(
            {
                "stage": name,
                "before_count": before,
                "excluded_count": len(excluded),
                "excluded_symbols": excluded,
                "after_count": len(remaining),
            }
        )
    selected_symbols = sorted(record["symbol"] for record in remaining if record["selected"])
    if len(selected_symbols) != len(remaining):
        raise AcquisitionError(f"candidate flow did not resolve to selected records for {year}")
    stages.append(
        {
            "stage": "selected",
            "before_count": len(remaining),
            "excluded_count": 0,
            "excluded_symbols": [],
            "after_count": len(remaining),
            "selected_symbols": selected_symbols,
        }
    )
    return {
        "historical_usdt_candidates": len(subset),
        "primary_reason_counts": dict(sorted(primary.items())),
        "all_reason_counts": dict(sorted(all_reasons.items())),
        "eligible": sum(record["formation_rank"] is not None for record in subset),
        "selected": sum(record["selected"] for record in subset),
        "stages": stages,
    }


def finalize(
    state: dict[str, Any],
    snapshot: dict[str, Any],
    inventory: dict[str, Any],
    candidates: list[dict[str, Any]],
    selected: list[dict[str, Any]],
    archive_records: dict[str, dict[str, Any]],
    panel: list[dict[str, Any]],
    quality: dict[str, Any],
) -> None:
    verify_runtime_inputs(snapshot, state, "finalize_start")
    frozen = snapshot["records"]
    protocol_sha = frozen["data_protocol"]["sha256"]
    signal_protocol_sha = frozen["signal_protocol"]["sha256"]
    identity_audit_sha = frozen["identity_event_audit"]["sha256"]
    identity_audit = json.loads(snapshot["bytes"]["identity_event_audit"])
    runner_sha = frozen["acquisition_program"]["sha256"]

    inventory_payload = {
        "schema_version": 1,
        "source": {
            "endpoint": S3_ENDPOINT,
            "archive_prefix": ARCHIVE_PREFIX,
            "discovery_rule": "historical archive prefixes ending exactly USDT",
        },
        "symbols": inventory["symbols"],
        "objects": inventory["objects"],
        "listing_provenance": inventory["listing_provenance"],
    }
    inventory_bytes = deterministic_gzip(canonical_json_bytes(inventory_payload))
    inventory_sha = sha256_bytes(inventory_bytes)

    membership_rows = []
    for record in sorted(candidates, key=lambda item: (item["cohort_year"], item["symbol"])):
        membership_rows.append(
            {
                "cohort_year": record["cohort_year"],
                "reporting_block": record["reporting_block"],
                "symbol": record["symbol"],
                "base": record["base"],
                "formation_month": record["formation_month"],
                "formation_valid_days": record["formation_valid_days"],
                "formation_quote_volume": record["formation_quote_volume"] or "",
                "formation_rank": record["formation_rank"] or "",
                "selected": "true" if record["selected"] else "false",
                "primary_reason": record["primary_reason"],
                "all_reasons": "|".join(record["all_reasons"]),
                "identity_ambiguity": "true" if record["identity_ambiguity"] else "false",
            }
        )
    membership_bytes = deterministic_gzip(csv_bytes(MEMBERSHIP_COLUMNS, membership_rows))
    panel_bytes = deterministic_gzip(csv_bytes(PANEL_COLUMNS, panel))

    quality_payload = {
        "schema_version": "high-flier-data-quality-v1",
        "identity_event_audit": {
            "path": IDENTITY_AUDIT_PATH.name,
            "sha256": identity_audit_sha,
            "status": identity_audit.get("status"),
            "daily_bucket_warning": identity_audit.get("dailyBucketWarning"),
        },
        "identity_events": IDENTITY_EVENTS,
        "quality_edges": QUALITY_EDGES,
        "cohort_symbols": quality,
        "totals": {
            "selected_memberships": len(selected),
            "panel_rows": len(panel),
            "memberships_with_missing_months": sum(bool(item["missing_months"]) for item in quality.values()),
            "duplicate_dates": sum(len(item["duplicate_dates"]) for item in quality.values()),
            "timestamp_unit_exceptions": sum(item["timestamp_unit_exceptions"] for item in quality.values()),
        },
    }
    quality_bytes = canonical_json_bytes(quality_payload)
    pre_manifest_artifacts = {
        "object_inventory": ("object-inventory.json.gz", inventory_bytes, "gzip"),
        "cohort_membership": ("cohort-membership.csv.gz", membership_bytes, "gzip"),
        "daily_panel": ("daily-panel.csv.gz", panel_bytes, "gzip"),
        "data_quality": ("data-quality.json", quality_bytes, "none"),
    }

    cohort_payload = {
        "schema_version": "high-flier-data-v1",
        "protocol_frozen": True,
        "frozen_at": FROZEN_AT,
        "data_protocol": {
            "path": PROTOCOL_PATH.name,
            "sha256": protocol_sha,
        },
        "signal_protocol": {
            "path": SIGNAL_PROTOCOL_PATH.name,
            "sha256": signal_protocol_sha,
        },
        "identity_event_audit": {
            "path": IDENTITY_AUDIT_PATH.name,
            "sha256": identity_audit_sha,
            "status": identity_audit.get("status"),
        },
        "frozen_inputs": frozen,
        "revision_provenance": {
            "path": frozen["revision_provenance"]["path"],
            "sha256": frozen["revision_provenance"]["sha256"],
            "superseded_data_protocol_sha256": SUPERSEDED_DATA_PROTOCOL_SHA256,
        },
        "study": {
            "signal_start": STUDY_SIGNAL_START,
            "signal_end": STUDY_SIGNAL_END,
        },
        "blocks": [
            {"name": "development", "start": "2020-01-01", "end": "2022-12-31", "exploratory": False},
            {"name": "reserved_retrospective_evaluation", "start": "2023-01-01", "end": "2025-12-31", "exploratory": False},
        ],
        "artifacts": {
            role: {
                "path": name,
                "sha256": sha256_bytes(data),
                "bytes": len(data),
                "compression": compression,
            }
            for role, (name, data, compression) in pre_manifest_artifacts.items()
        },
        "acquisition_program": {
            "path": Path(__file__).name,
            "sha256": runner_sha,
            "python": snapshot["revision"]["runtime_environment"]["python_version"],
            "runtime_environment": snapshot["revision"]["runtime_environment"],
            "revision_history": snapshot["revision"].get("program_revisions", []),
        },
        "source": {
            "provider": "Binance Vision historical market data",
            "attribution": "Historical Spot daily OHLCV archives provided by Binance Vision.",
            "list_objects_v2_endpoint": S3_ENDPOINT,
            "archive_base_url": OBJECT_BASE_URL,
            "archive_prefix": ARCHIVE_PREFIX,
            "interval": "1d",
            "discovered_usdt_prefix_count": len(inventory["symbols"]),
            "inventory_artifact_sha256": inventory_sha,
            "terms": {
                "url": "https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf",
                "version": "1.0",
                "last_updated": "2026-08-26",
                "license": "CC BY-NC-SA 4.0",
                "license_url": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
                "scope": "personal non-production non-commercial historical backtesting and research",
                "raw_external_redistribution_by_this_task": False,
                "commercial_or_production_use": False,
            },
        },
        "bounds": {
            "max_list_requests": MAX_LIST_REQUESTS,
            "max_object_gets": MAX_OBJECT_GETS,
            "max_downloaded_persisted_bytes": MAX_DOWNLOADED_PERSISTED_BYTES,
            "max_concurrency": MAX_CONCURRENCY,
            "actual_concurrency": 1,
            "max_sustained_requests_per_second": MAX_REQUESTS_PER_SECOND,
            "retry_attempt_limit": MAX_ATTEMPTS,
            "max_listing_response_bytes": MAX_LISTING_RESPONSE_BYTES,
            "max_archive_zip_bytes": MAX_ARCHIVE_ZIP_BYTES,
            "max_expanded_csv_bytes": MAX_EXPANDED_CSV_BYTES,
            "max_monthly_rows": MAX_MONTHLY_ROWS,
            "max_csv_line_bytes": MAX_CSV_LINE_BYTES,
            "max_numeric_field_chars": MAX_NUMERIC_FIELD_CHARS,
            "max_decimal_digits": MAX_DECIMAL_DIGITS,
            "max_abs_decimal_exponent": MAX_ABS_DECIMAL_EXPONENT,
            "redirect_policy": "fail_closed_no_redirects",
            "realized_list_requests": state["list_requests"],
            "realized_object_gets": state["object_gets"],
            "realized_downloaded_persisted_bytes": state["downloaded_persisted_bytes"],
            "unmaterialized_reserved_bytes": state.get("unmaterialized_reserved_bytes", 0),
        },
        "formation_rules": {
            "cohort_years": COHORT_YEARS,
            "formation_month": "preceding December",
            "ranking": "sum valid daily quote-asset volume descending, raw symbol ascending tie-break",
            "top_n": TOP_N,
            "minimum_valid_distinct_days": 28,
            "requires_december_1": True,
            "requires_december_31": True,
        },
        "exclusion_rules": {
            "stable_bases": sorted(STABLE_BASES),
            "leveraged_rule": "reciprocal UP/DOWN or BULL/BEAR archive prefixes plus underlying USDT archive prefix",
            "explicit_documented_leveraged_map": {},
        },
        "identity_rules": {
            "pair_key": "raw symbol",
            "cross_symbol_stitching": False,
            "cross_event_stitching": False,
            "crossing_policy": "unknown",
            "events": IDENTITY_EVENTS,
        },
        "quality_edges": QUALITY_EDGES,
        "candidate_flow": {str(year): candidate_flow(candidates, year) for year in COHORT_YEARS},
        "selected_symbols": {
            str(year): [
                record["symbol"]
                for record in sorted(selected, key=lambda item: (item["cohort_year"], item["formation_rank"]))
                if record["cohort_year"] == year
            ]
            for year in COHORT_YEARS
        },
        "candidates": sorted(candidates, key=lambda item: (item["cohort_year"], item["symbol"])),
        "archive_records": [archive_records[key] for key in sorted(archive_records)],
        "missing_requested_months": {
            key: item["missing_months"] for key, item in sorted(quality.items()) if item["missing_months"]
        },
        "limitations": [
            "Established liquid Binance Spot USDT venue pilot, not global top 500.",
            "No historical market-cap ranks; not an exact Classic backtest.",
            "Fixed annual cohorts omit within-year new listings.",
            "2020-2022 is development; 2023-2025 is reserved retrospective evaluation, not prospective proof.",
            "Missing later archives remain data flags and never survivor-filter cohort membership.",
        ],
    }
    cohort_bytes = canonical_json_bytes(cohort_payload)
    verify_runtime_inputs(snapshot, state, "before_final_artifact_writes")

    artifacts = {
        FINAL_DIR / "object-inventory.json.gz": inventory_bytes,
        FINAL_DIR / "cohort-membership.csv.gz": membership_bytes,
        FINAL_DIR / "daily-panel.csv.gz": panel_bytes,
        FINAL_DIR / "data-quality.json": quality_bytes,
        FINAL_DIR / "cohort-manifest.json": cohort_bytes,
    }
    for path, data in artifacts.items():
        write_new_or_hash_match(path, data)

    verify_runtime_inputs(snapshot, state, "before_file_hash_manifest")
    hashes = []
    frozen_paths = [
        PROTOCOL_PATH,
        SIGNAL_PROTOCOL_PATH,
        IDENTITY_AUDIT_PATH,
        Path(__file__).resolve(),
        REVISION_PROVENANCE_PATH,
        PREVIOUS_FINAL_PROVENANCE_PATH,
        CORRECTED_PROVENANCE_PATH,
        ADOPTED_PROVENANCE_PATH,
        PROVENANCE_AMENDMENT_PATH,
        SELFTEST_PATH,
    ]
    frozen_paths.extend(list_owned_regular_files(DATA_DIR / "versions"))
    frozen_paths.extend(list_owned_regular_files(RAW_DIR))
    frozen_paths.extend(list_owned_regular_files(LISTINGS_DIR))
    frozen_paths.extend(sorted(artifacts))
    for path in sorted(set(frozen_paths), key=str):
        relative = str(path.relative_to(ROOT))
        if path == PROTOCOL_PATH:
            role = "data_protocol"
        elif path == SIGNAL_PROTOCOL_PATH:
            role = "signal_protocol"
        elif path == IDENTITY_AUDIT_PATH:
            role = "identity_event_audit"
        elif path == Path(__file__).resolve():
            role = "acquisition_program"
        elif path in (REVISION_PROVENANCE_PATH, PREVIOUS_FINAL_PROVENANCE_PATH, CORRECTED_PROVENANCE_PATH, ADOPTED_PROVENANCE_PATH, PROVENANCE_AMENDMENT_PATH):
            role = "revision_provenance"
        elif path == SELFTEST_PATH:
            role = "offline_selftest"
        elif path.is_relative_to(DATA_DIR / "versions"):
            role = "archived_program_revision"
        elif path.is_relative_to(RAW_DIR):
            role = "raw_source_object"
        elif path.is_relative_to(LISTINGS_DIR):
            role = "list_objects_response"
        else:
            role = "final_artifact"
        data = read_input_bytes(path)
        hashes.append(
            {
                "path": relative,
                "bytes": len(data),
                "sha256": sha256_bytes(data),
                "role": role,
            }
        )
    hash_bytes = canonical_json_bytes(
        {
            "schema_version": "high-flier-data-hashes-v1",
            "frozen_at": FROZEN_AT,
            "frozen_metadata": frozen,
            "artifacts": hashes,
        }
    )
    write_new_or_hash_match(FINAL_DIR / "file-hashes.json", hash_bytes)
    verify_runtime_inputs(snapshot, state, "after_final_artifact_writes")

    state["phase"] = "complete"
    state["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    state["final_artifacts"] = {
        path.name: {"bytes": len(data), "sha256": sha256_bytes(data)} for path, data in artifacts.items()
    }
    state["final_artifacts"]["file-hashes.json"] = {
        "bytes": len(hash_bytes),
        "sha256": sha256_bytes(hash_bytes),
    }
    save_state(state)


def runtime_input_paths() -> dict[str, Path]:
    return {
        "data_protocol": PROTOCOL_PATH,
        "signal_protocol": SIGNAL_PROTOCOL_PATH,
        "identity_event_audit": IDENTITY_AUDIT_PATH,
        "acquisition_program": Path(__file__).resolve(),
        "revision_provenance": REVISION_PROVENANCE_PATH,
        "previous_final_revision_provenance": PREVIOUS_FINAL_PROVENANCE_PATH,
        "corrected_revision_provenance": CORRECTED_PROVENANCE_PATH,
        "adopted_revision_provenance": ADOPTED_PROVENANCE_PATH,
        "revision_provenance_amendment": PROVENANCE_AMENDMENT_PATH,
        "offline_selftest": SELFTEST_PATH,
    }


def capture_runtime_inputs() -> dict[str, Any]:
    records: dict[str, Any] = {}
    byte_images: dict[str, bytes] = {}
    for role, path in runtime_input_paths().items():
        data = read_input_bytes(path)
        byte_images[role] = data
        records[role] = {
            "path": str(path.relative_to(ROOT)),
            "bytes": len(data),
            "sha256": sha256_bytes(data),
        }
    configure_identity_events(byte_images["identity_event_audit"])
    try:
        revision = json.loads(byte_images["revision_provenance"])
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AcquisitionError(f"invalid corrected revision provenance: {error}") from error
    if revision.get("schema_version") != "high-flier-acquisition-final-two-fix-v1":
        raise AcquisitionError("unsupported final two-fix revision provenance schema")
    corrected = revision.get("corrected_revision", {})
    required_pins = {
        "corrected_revision": "acquisition_program",
        "data_protocol": "data_protocol",
        "signal_protocol": "signal_protocol",
        "identity_event_audit": "identity_event_audit",
        "previous_final_revision_provenance": "previous_final_revision_provenance",
        "corrected_revision_provenance": "corrected_revision_provenance",
        "adopted_revision_provenance": "adopted_revision_provenance",
        "revision_provenance_amendment": "revision_provenance_amendment",
        "offline_selftest": "offline_selftest",
    }
    for provenance_role, runtime_role in required_pins.items():
        pin = revision.get(provenance_role, {})
        expected = records[runtime_role]
        if not isinstance(pin, dict) or pin.get("sha256") != expected["sha256"] or pin.get("bytes") != expected["bytes"]:
            raise AcquisitionError(f"corrected provenance does not pin {runtime_role}")
    checkpoint = revision.get("cumulative_budget_checkpoint")
    if checkpoint != {
        "list_requests": 129,
        "persisted_listing_responses": 128,
        "unpersisted_counted_listing_attempts": 1,
        "object_gets": 0,
        "downloaded_persisted_bytes": 2810628,
    }:
        raise AcquisitionError("corrected provenance checkpoint changed")
    if revision.get("listing_record_set_sha256") != "eaf3ec5e95def5ffbb467e25c39ce615c16285b8cc8c12e4c8ee643daf91cd42":
        raise AcquisitionError("corrected provenance listing record-set hash changed")
    runtime_environment = {
        "implementation": sys.implementation.name,
        "python_version": sys.version.split()[0],
        "cache_tag": sys.implementation.cache_tag,
        "zlib_runtime_version": zlib.ZLIB_RUNTIME_VERSION,
    }
    if revision.get("runtime_environment") != runtime_environment:
        raise AcquisitionError("runtime environment differs from corrected provenance")
    archive_relative = corrected.get("archive_path")
    if not isinstance(archive_relative, str):
        raise AcquisitionError("corrected provenance lacks archived program path")
    archive_path = ROOT / archive_relative
    expected_archive_parent = DATA_DIR / "versions"
    try:
        archive_path.absolute().relative_to(expected_archive_parent.absolute())
    except ValueError as error:
        raise AcquisitionError("corrected program archive left owned versions directory") from error
    archive_data = read_input_bytes(archive_path)
    if archive_data != byte_images["acquisition_program"]:
        raise AcquisitionError("archived corrected program differs from executing image")
    records["archived_acquisition_program"] = {
        "path": str(archive_path.relative_to(ROOT)),
        "bytes": len(archive_data),
        "sha256": sha256_bytes(archive_data),
    }
    byte_images["archived_acquisition_program"] = archive_data
    return {
        "records": records,
        "bytes": byte_images,
        "revision": revision,
        "extra_paths": {"archived_acquisition_program": archive_path},
    }


def verify_runtime_inputs(snapshot: dict[str, Any], state: dict[str, Any], phase: str) -> None:
    expected_records = snapshot["records"]
    if state.get("frozen_inputs") != expected_records:
        raise AcquisitionError(f"state frozen inputs differ from executing snapshot during {phase}")
    paths = dict(runtime_input_paths())
    paths.update(snapshot.get("extra_paths", {}))
    for role, path in paths.items():
        data = read_input_bytes(path)
        expected = expected_records[role]
        if len(data) != expected["bytes"] or sha256_bytes(data) != expected["sha256"]:
            raise AcquisitionError(f"runtime input changed during {phase}: {role}")
    if sha256_bytes(snapshot["bytes"]["acquisition_program"]) != expected_records["acquisition_program"]["sha256"]:
        raise AcquisitionError("captured execution-source image changed in memory")


def enter_phase(state: dict[str, Any], snapshot: dict[str, Any], phase: str) -> None:
    verify_runtime_inputs(snapshot, state, f"enter_{phase}")
    state["phase"] = phase
    state.setdefault("phase_input_verifications", []).append(
        {"phase": phase, "input_record_sha256": sha256_bytes(canonical_json_bytes(snapshot["records"]))}
    )
    save_state(state)


def require_independent_reaudit_clearance(state: dict[str, Any], snapshot: dict[str, Any]) -> None:
    clearance = state.get("independent_reaudit_clearance")
    if state.get("network_resume_authorized") is not True or not isinstance(clearance, dict):
        raise AcquisitionError("independent re-audit clearance is required before any network-capable phase")
    expected = {
        "status": "cleared",
        "acquisition_program_sha256": snapshot["records"]["acquisition_program"]["sha256"],
        "revision_provenance_sha256": snapshot["records"]["revision_provenance"]["sha256"],
    }
    for key, value in expected.items():
        if clearance.get(key) != value:
            raise AcquisitionError(f"independent re-audit clearance has invalid {key}")
    reviewer = clearance.get("reviewer")
    reviewed_at = clearance.get("reviewed_at_utc")
    if not isinstance(reviewer, str) or not reviewer.strip():
        raise AcquisitionError("independent re-audit clearance lacks reviewer")
    parse_utc_timestamp(reviewed_at, "independent_reaudit_clearance.reviewed_at_utc")


def verify_completed(state: dict[str, Any]) -> None:
    for name, expected in state.get("final_artifacts", {}).items():
        path = FINAL_DIR / name
        if not owned_file_exists(path):
            raise AcquisitionError(f"completed-state artifact missing: {path}")
        data = read_owned_bytes(path)
        if len(data) != expected["bytes"] or sha256_bytes(data) != expected["sha256"]:
            raise AcquisitionError(f"completed-state artifact mismatch: {path}")
    print("acquisition already complete; all final artifact hashes match", flush=True)


def main() -> int:
    global RUNTIME_INPUT_SNAPSHOT
    snapshot = capture_runtime_inputs()
    RUNTIME_INPUT_SNAPSHOT = snapshot
    for directory in (RAW_DIR, LISTINGS_DIR, STATE_DIR, FINAL_DIR, DATA_DIR / "versions"):
        ensure_owned_dir(directory)
    state = load_or_initialize_state()
    verify_runtime_inputs(snapshot, state, "startup")
    verify_adopted_listings_and_reconcile(state, snapshot["bytes"]["adopted_revision_provenance"])
    verify_runtime_inputs(snapshot, state, "after_adopted_listing_reconciliation")
    if state.get("phase") == "complete":
        verify_completed(state)
        return 0
    require_independent_reaudit_clearance(state, snapshot)

    try:
        enter_phase(state, snapshot, "discovering_inventory")
        inventory = discover_inventory(state)
        verify_runtime_inputs(snapshot, state, "after_inventory_discovery")
        print(f"discovered {len(inventory['symbols'])} USDT archive prefixes", flush=True)

        enter_phase(state, snapshot, "forming_cohorts")
        candidates, selected, archive_records = build_cohorts(state, inventory)
        verify_runtime_inputs(snapshot, state, "after_cohort_formation")
        for year in COHORT_YEARS:
            chosen = [record for record in selected if record["cohort_year"] == year]
            print(f"cohort {year}: selected {len(chosen)}", flush=True)

        enter_phase(state, snapshot, "acquiring_follow_windows")
        panel, quality, archive_records = acquire_follow_and_build_panel(
            state, selected, inventory, archive_records
        )
        verify_runtime_inputs(snapshot, state, "after_follow_acquisition")

        enter_phase(state, snapshot, "finalizing")
        finalize(state, snapshot, inventory, candidates, selected, archive_records, panel, quality)
        print(
            f"complete: listings={state['list_requests']} object_gets={state['object_gets']} downloaded_persisted_bytes={state['downloaded_persisted_bytes']} panel_rows={len(panel)}",
            flush=True,
        )
        return 0
    except CapStop as error:
        state["phase"] = "stopped_before_cap"
        state["stop_reason"] = str(error)
        save_state(state)
        print(f"STOPPED BEFORE CAP: {error}", file=sys.stderr, flush=True)
        return 2
    except Exception as error:
        state["phase"] = "failed"
        state["stop_reason"] = str(error)
        save_state(state)
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AcquisitionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
