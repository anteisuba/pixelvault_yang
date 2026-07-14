"""Pure validation/normalization helpers for RunPod ComfyUI job payloads."""

UINT64_MAX = 18_446_744_073_709_551_615


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
