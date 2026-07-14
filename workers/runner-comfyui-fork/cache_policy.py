"""Bounded cache policy for dynamic Runner files on the network volume."""

import os
import shutil


DEFAULT_RESERVE_BYTES = 8 * 1024 * 1024 * 1024


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
):
    """Evict oldest managed files until download + free-space reserve fit."""
    reserve = (
        int(os.environ.get("RUNNER_CACHE_RESERVE_BYTES", DEFAULT_RESERVE_BYTES))
        if reserve_bytes is None
        else reserve_bytes
    )
    usage = disk_usage_fn(os.path.dirname(destination) or destination)
    required = max(0, int(incoming_bytes or 0)) + max(0, int(reserve))
    if usage.free >= required:
        return []

    protected = {os.path.abspath(path) for path in protected_paths}
    protected.add(os.path.abspath(destination))
    candidates = [
        path
        for path in list_managed_files(lora_dir, checkpoint_dir, diffusion_dir)
        if os.path.abspath(path) not in protected
    ]
    candidates.sort(key=lambda path: os.stat(path).st_mtime)

    available = usage.free
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
