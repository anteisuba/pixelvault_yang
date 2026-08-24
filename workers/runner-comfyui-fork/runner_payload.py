"""Pure validation/normalization helpers for RunPod ComfyUI job payloads."""

UINT64_MAX = 18_446_744_073_709_551_615

ALLOWED_INPUT_IMAGE_SOURCE = "r2"


def safe_basename(name):
    """Reject anything that could escape its target directory."""
    if not name or "/" in name or "\\" in name or ".." in name:
        raise ValueError(f"Invalid filename (path traversal blocked): {name!r}")
    return name


def build_input_image_specs(images_to_fetch):
    """Validate `input.images_to_fetch` into `(name, url)` pairs ready to download.

    v7：参考图改走 URL，不再由 app 侧 base64 后塞进请求体。旧路径有两堵墙：
    Cloudflare Worker 只有 128MB 内存（整张图转 base64 会把它撑爆），且 base64
    膨胀 4/3 后会顶穿 RunPod /run 的 10MiB 请求体上限——一张 ~8MB 的参考图正好
    卡在两者之间，同一张图连点两次会分别撞上这两堵墙。

    走的是 loras_to_fetch 已经验证过的那条路：app 只传 URL，GPU worker 自己拉。
    安全模型同 ensure_loras——source 白名单 + 纯 basename，URL 由 app 侧保证只会
    是我们自己的 R2 链接；额外要求 https，挡掉 http 明文与内网元数据端点。
    """
    if not images_to_fetch:
        return []
    if not isinstance(images_to_fetch, list):
        raise ValueError("images_to_fetch must be a list")

    specs = []
    for spec in images_to_fetch:
        if not isinstance(spec, dict):
            raise ValueError("images_to_fetch entries must be objects")
        source = spec.get("source")
        if source != ALLOWED_INPUT_IMAGE_SOURCE:
            raise ValueError(
                f"Refusing input image from disallowed source: {source!r}"
            )
        name = safe_basename(spec.get("name", ""))
        url = spec.get("url")
        if not url or not isinstance(url, str):
            raise ValueError(f"Missing download url for input image {name!r}")
        if not url.lower().startswith("https://"):
            raise ValueError(f"Input image url must be https: {name!r}")
        specs.append((name, url))
    return specs


def normalize_workflow_seeds(job):
    """Convert decimal-string KSampler seeds to Python ints without precision loss."""
    if not isinstance(job, dict):
        return job
    inp = job.get("input")
    if not isinstance(inp, dict):
        return job
    workflow = inp.get("workflow")
    if not isinstance(workflow, dict):
        return job

    for node in workflow.values():
        if not isinstance(node, dict) or node.get("class_type") != "KSampler":
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        seed = inputs.get("seed")
        if isinstance(seed, str):
            if not seed.isascii() or not seed.isdigit():
                raise ValueError("Runner seed must be an unsigned decimal string")
            parsed = int(seed, 10)
            if parsed > UINT64_MAX:
                raise ValueError("Runner seed exceeds uint64")
            inputs["seed"] = parsed
        elif isinstance(seed, int):
            if seed < 0 or seed > UINT64_MAX:
                raise ValueError("Runner seed exceeds uint64")
        elif seed is not None:
            raise ValueError("Runner seed must be an integer or decimal string")
    return job
