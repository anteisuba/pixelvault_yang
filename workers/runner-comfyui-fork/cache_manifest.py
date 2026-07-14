"""Persistent, secret-free cache inventory and download history."""

import json
import os
import re
from datetime import datetime, timezone


_CIVITAI_FILE_RE = re.compile(
    r"^(?:civitai-ckpt-|civitai-)(?P<version_id>\d+)\.safetensors$",
    re.IGNORECASE,
)


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def _relative_path(path, volume_root):
    return os.path.relpath(path, volume_root).replace(os.sep, "/")


def _model_kind(relative_path):
    parts = relative_path.split("/")
    if len(parts) >= 3 and parts[0] == "models":
        return parts[1]
    return "volume"


def build_volume_file_index(volume_root, excluded_paths=()):
    """List physical files without hashing multi-GiB model contents."""
    excluded = {os.path.abspath(path) for path in excluded_paths if path}
    records = []
    if not os.path.isdir(volume_root):
        return records

    for root, dirs, files in os.walk(volume_root):
        dirs.sort()
        files.sort()
        for name in files:
            path = os.path.join(root, name)
            if path.endswith(".part") or os.path.abspath(path) in excluded:
                continue
            try:
                stat = os.stat(path)
            except FileNotFoundError:
                continue
            relative_path = _relative_path(path, volume_root)
            record = {
                "path": relative_path,
                "bytes": stat.st_size,
                "modifiedAt": datetime.fromtimestamp(
                    stat.st_mtime, timezone.utc
                ).isoformat(),
                "kind": _model_kind(relative_path),
            }
            match = _CIVITAI_FILE_RE.match(name)
            if match:
                record["civitaiVersionId"] = int(match.group("version_id"))
            records.append(record)
    return records


def write_volume_manifest(
    manifest_path,
    volume_root,
    inventory,
    history_path=None,
):
    """Atomically persist a current physical-file snapshot on the volume."""
    os.makedirs(os.path.dirname(manifest_path) or ".", exist_ok=True)
    files = build_volume_file_index(
        volume_root,
        excluded_paths=(manifest_path, history_path),
    )
    payload = {
        "schemaVersion": 1,
        "updatedAt": _utc_now(),
        "volumeRoot": volume_root,
        "fileCount": len(files),
        "fileBytes": sum(item["bytes"] for item in files),
        "inventory": inventory,
        "files": files,
    }
    tmp = manifest_path + ".part"
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp, manifest_path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return payload


def append_download_event(
    history_path,
    *,
    action,
    kind,
    source,
    filename,
    target_path,
    size_bytes=None,
):
    """Append one download/eviction event without persisting signed URLs."""
    os.makedirs(os.path.dirname(history_path) or ".", exist_ok=True)
    event = {
        "schemaVersion": 1,
        "timestamp": _utc_now(),
        "action": action,
        "kind": kind,
        "source": source,
        "filename": filename,
        "targetPath": target_path.replace(os.sep, "/"),
    }
    if size_bytes is not None:
        event["bytes"] = int(size_bytes)
    with open(history_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False, sort_keys=True))
        handle.write("\n")
    return event
