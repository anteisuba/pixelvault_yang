"""Bounded cache policy for dynamic Runner files on the network volume."""

import os
import shutil


DEFAULT_RESERVE_BYTES = 8 * 1024 * 1024 * 1024


def volume_used_bytes(volume_root):
    """网络卷上所有文件的实际大小之和。

    RunPod 网络卷的配额（开的是多少 GB）从文件系统报的剩余量里看不出来——2026-09-27
    生产上 80G 配额写满时 `shutil.disk_usage` 仍报有余量，LRU 一次都没清，下载写到一半撞
    `[Errno 122] Disk quota exceeded`。所以配额按卷上实际文件算。
    """
    total = 0
    for root, _dirs, files in os.walk(volume_root):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
    return total


def _managed_in_dir(path, root, prefixes):
    try:
        relative = os.path.relpath(path, root)
    except ValueError:
        return False
    if relative.startswith("..") or os.path.dirname(relative) not in ("", "."):
        return False
    return os.path.basename(path).startswith(prefixes)


def list_managed_files(lora_dir, checkpoint_dir, diffusion_dir=None):
    """Only files created by PixelVault's dynamic paths are evictable."""
    managed = []
    roots = [
        (lora_dir, ("civitai-", "hf-")),
        (checkpoint_dir, ("civitai-ckpt-",)),
    ]
    if diffusion_dir:
        roots.append((diffusion_dir, ("civitai-ckpt-",)))
    for root, prefixes in roots:
        if not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            path = os.path.join(root, name)
            if os.path.isfile(path) and _managed_in_dir(path, root, prefixes):
                managed.append(path)
    return managed


def touch_cache_hit(path):
    """mtime is the LRU access clock; refresh it on every cache hit."""
    if os.path.exists(path):
        os.utime(path, None)


def ensure_cache_capacity(
    destination,
    incoming_bytes,
    lora_dir,
    checkpoint_dir,
    diffusion_dir=None,
    protected_paths=(),
    reserve_bytes=None,
    disk_usage_fn=shutil.disk_usage,
    quota_bytes=None,
    volume_root=None,
    used_bytes_fn=volume_used_bytes,
):
    """Evict oldest managed files until download + free-space reserve fit.

    配了卷配额（`RUNNER_VOLUME_QUOTA_BYTES`，与 RunPod 上开的容量一致）就按「配额 − 卷上
    实际文件大小」算剩余，和文件系统报的剩余取小者；没配则只看文件系统。
    """
    reserve = (
        int(os.environ.get("RUNNER_CACHE_RESERVE_BYTES", DEFAULT_RESERVE_BYTES))
        if reserve_bytes is None
        else reserve_bytes
    )
    if quota_bytes is None:
        quota_bytes = int(os.environ.get("RUNNER_VOLUME_QUOTA_BYTES") or 0) or None
    free = disk_usage_fn(os.path.dirname(destination) or destination).free
    if quota_bytes and volume_root:
        free = min(free, max(0, quota_bytes - used_bytes_fn(volume_root)))
    required = max(0, int(incoming_bytes or 0)) + max(0, int(reserve))
    if free >= required:
        return []

    protected = {os.path.abspath(path) for path in protected_paths}
    protected.add(os.path.abspath(destination))
    candidates = [
        path
        for path in list_managed_files(lora_dir, checkpoint_dir, diffusion_dir)
        if os.path.abspath(path) not in protected
    ]
    candidates.sort(key=lambda path: os.stat(path).st_mtime)

    available = free
    evicted = []
    for path in candidates:
        size = os.path.getsize(path)
        os.remove(path)
        available += size
        evicted.append(path)
        if available >= required:
            return evicted

    raise RuntimeError(
        "Runner volume has insufficient free space after managed-cache eviction"
    )


def cache_inventory(
    lora_dir, checkpoint_dir, diffusion_dir=None, disk_usage_fn=shutil.disk_usage
):
    files = list_managed_files(lora_dir, checkpoint_dir, diffusion_dir)
    volume_path = lora_dir if os.path.exists(lora_dir) else checkpoint_dir
    usage = disk_usage_fn(volume_path)
    return {
        "managed_files": len(files),
        "managed_bytes": sum(os.path.getsize(path) for path in files),
        "free_bytes": usage.free,
        "total_bytes": usage.total,
    }
