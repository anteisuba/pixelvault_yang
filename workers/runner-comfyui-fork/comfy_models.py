"""ComfyUI 模型可见性闸 —— 新下载的权重「当次提交即可用」的唯一保证。

起因（2026-09-04 生产）：LoRA `civitai-2797481.safetensors` 首次使用，fork 已把它
下到 `/runpod-volume/models/loras/`，可官方 handler 随即提交的 workflow 被 ComfyUI
挡回：

    Node lora-1 (errors): value_not_in_list — lora_name:
    'civitai-2797481.safetensors' not in (list of length 39)

原样再点一次即成功。原因是 ComfyUI 的 `folder_paths` 把每个模型目录的文件清单缓存在
**ComfyUI 自己的进程**里，按目录 mtime 失效；本 wrapper 是另一个进程，且模型目录是
RunPod 网络卷（属性有客户端缓存）——我们写完文件那一刻，ComfyUI 进程看到的清单可能还
是旧的。LoraLoader 的 `lora_name` 是 combo，校验就打在那份旧清单上。

所以「下完就交给官方 handler」是不成立的假设。这里改成**按 ComfyUI 自己的视角验收**：
提交前逐个 model-loader 节点问 `/object_info/<class_type>`，直到 workflow 里引用的每
个权重文件都出现在它的候选清单里，才放行。等不到就抛错——不降级、不改 workflow、不
静默跳过，让失败带着文件名大声暴露。

本模块只有纯逻辑（无第三方依赖），HTTP/时钟由调用方注入，便于单元测试。
"""

# class_type → 那个「引用模型文件名、由 ComfyUI 按目录清单校验」的输入字段。
# 名册与 workers/execution/src/models/runner/{workflow,anima-workflow}-builder.ts
# 造的节点一一对应：漏一个 = 那类权重回到「首次使用必失败一次」。
MODEL_FILE_FIELDS = {
    "CheckpointLoaderSimple": "ckpt_name",
    "UNETLoader": "unet_name",
    "CLIPLoader": "clip_name",
    "VAELoader": "vae_name",
    "LoraLoader": "lora_name",
    "LoraLoaderModelOnly": "lora_name",
    "UpscaleModelLoader": "model_name",
}


class ComfyObjectInfoUnavailableError(RuntimeError):
    """`/object_info` 这一次没问到（ComfyUI 冷启动中 / 单次请求失败）——可重试。"""

    def __init__(self, cause):
        self.cause = cause
        super().__init__(f"ComfyUI object_info request failed: {cause}")


class ComfyModelNotVisibleError(RuntimeError):
    """ComfyUI 在超时内始终没把某些权重列进候选清单。"""

    def __init__(self, missing, last_error=None):
        self.missing = list(missing)
        self.last_error = last_error
        details = ", ".join(
            f"{class_type}.{field}={filename!r}"
            for class_type, field, filename in self.missing
        )
        message = (
            "ComfyUI did not list these freshly cached models in time: " + details
        )
        if last_error is not None:
            message += f" (last object_info error: {last_error})"
        super().__init__(message)


def collect_model_requirements(workflow):
    """workflow → 去重后的 `(class_type, field, filename)`，顺序稳定。"""
    if not isinstance(workflow, dict):
        return []
    requirements = []
    seen = set()
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        field = MODEL_FILE_FIELDS.get(node.get("class_type"))
        if field is None:
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        filename = inputs.get(field)
        if not isinstance(filename, str) or not filename:
            continue
        key = (node["class_type"], field, filename)
        if key in seen:
            continue
        seen.add(key)
        requirements.append(key)
    return requirements


def extract_combo_options(object_info, class_type, field):
    """从 `/object_info/<class_type>` 的响应里取出该字段的候选清单。

    ComfyUI 的 combo 规格历史上有两种形状：老的 `[[...选项...], {...配置...}]`，新的
    `[{"type": "COMBO", "options": [...]}]`。两种都认；认不出就抛——静默当成空清单会
    把「ComfyUI 改了响应格式」伪装成「模型没就绪」，等满超时才失败。
    """
    node = (object_info or {}).get(class_type)
    if not isinstance(node, dict):
        raise ValueError(f"object_info has no entry for node {class_type!r}")
    spec_groups = node.get("input")
    if not isinstance(spec_groups, dict):
        raise ValueError(f"object_info entry for {class_type!r} has no input spec")
    spec = None
    for group in ("required", "optional"):
        group_spec = spec_groups.get(group)
        if isinstance(group_spec, dict) and field in group_spec:
            spec = group_spec[field]
            break
    if spec is None:
        raise ValueError(f"{class_type!r} has no input field {field!r}")

    head = spec[0] if isinstance(spec, (list, tuple)) and spec else spec
    if isinstance(head, (list, tuple)):
        return [option for option in head if isinstance(option, str)]
    if isinstance(head, dict) and isinstance(head.get("options"), (list, tuple)):
        return [option for option in head["options"] if isinstance(option, str)]
    raise ValueError(
        f"Unrecognized combo spec for {class_type!r}.{field!r}: {spec!r}"
    )


def find_missing_models(requirements, fetch_object_info):
    """返回 ComfyUI 当前清单里**还没有**的那些 `(class_type, field, filename)`。

    每个 class_type 只问一次（同一次探测内清单不会变），顺序保留。
    """
    cache = {}
    missing = []
    for class_type, field, filename in requirements:
        if class_type not in cache:
            cache[class_type] = fetch_object_info(class_type)
        options = extract_combo_options(cache[class_type], class_type, field)
        if filename not in options:
            missing.append((class_type, field, filename))
    return missing


def wait_for_workflow_models(
    workflow,
    fetch_object_info,
    timeout_seconds,
    poll_interval_seconds,
    sleep,
    monotonic,
):
    """阻塞到 workflow 引用的每个权重都出现在 ComfyUI 的候选清单里。

    冷启动时 ComfyUI 可能还没起来（`fetch_object_info` 抛连接错误），那和「清单还没
    刷新」是同一种「再等等」，都在超时内重试；超时才抛 `ComfyModelNotVisibleError`，
    并带上最后一次错误，免得把网络问题伪装成模型缺失。
    """
    requirements = collect_model_requirements(workflow)
    if not requirements:
        return []

    def guarded_fetch(class_type):
        # 只有「问不到」才算可重试；响应能拿到但形状不认识（ComfyUI 改了协议）必须
        # 立刻抛出去，别耗满超时后伪装成「模型没就绪」。
        try:
            return fetch_object_info(class_type)
        except Exception as error:
            raise ComfyObjectInfoUnavailableError(error) from error

    deadline = monotonic() + timeout_seconds
    missing = requirements
    last_error = None
    while True:
        try:
            missing = find_missing_models(requirements, guarded_fetch)
            last_error = None
            if not missing:
                return requirements
        except ComfyObjectInfoUnavailableError as error:
            last_error = error.cause
        if monotonic() >= deadline:
            raise ComfyModelNotVisibleError(missing, last_error)
        sleep(poll_interval_seconds)
