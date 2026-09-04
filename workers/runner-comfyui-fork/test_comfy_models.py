import unittest

from comfy_models import (
    ComfyModelNotVisibleError,
    collect_model_requirements,
    extract_combo_options,
    find_missing_models,
    wait_for_workflow_models,
)

FRESH_LORA = "civitai-2797481.safetensors"
CACHED_LORA = "civitai-2826647.safetensors"
CHECKPOINT = "wai-illustrious.safetensors"


def lora_workflow(*lora_filenames, checkpoint=CHECKPOINT):
    workflow = {
        "checkpoint": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint},
        },
        "sampler": {"class_type": "KSampler", "inputs": {"seed": 1}},
    }
    for index, filename in enumerate(lora_filenames, start=1):
        workflow[f"lora-{index}"] = {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": filename,
                "strength_model": 1,
                "strength_clip": 1,
            },
        }
    return workflow


def object_info(class_type, field, options):
    return {class_type: {"input": {"required": {field: [list(options), {}]}}}}


class CollectModelRequirementsTest(unittest.TestCase):
    def test_collects_every_model_loader_field(self):
        workflow = {
            "unet": {"class_type": "UNETLoader", "inputs": {"unet_name": "a.st"}},
            "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": "b.st"}},
            "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "c.st"}},
            "lora": {
                "class_type": "LoraLoaderModelOnly",
                "inputs": {"lora_name": "d.st"},
            },
            "up": {
                "class_type": "UpscaleModelLoader",
                "inputs": {"model_name": "e.pth"},
            },
        }
        self.assertEqual(
            collect_model_requirements(workflow),
            [
                ("UNETLoader", "unet_name", "a.st"),
                ("CLIPLoader", "clip_name", "b.st"),
                ("VAELoader", "vae_name", "c.st"),
                ("LoraLoaderModelOnly", "lora_name", "d.st"),
                ("UpscaleModelLoader", "model_name", "e.pth"),
            ],
        )

    def test_ignores_non_model_nodes_and_deduplicates(self):
        workflow = lora_workflow(FRESH_LORA, FRESH_LORA)
        self.assertEqual(
            collect_model_requirements(workflow),
            [
                ("CheckpointLoaderSimple", "ckpt_name", CHECKPOINT),
                ("LoraLoader", "lora_name", FRESH_LORA),
            ],
        )

    def test_empty_for_workflow_without_model_nodes(self):
        self.assertEqual(collect_model_requirements({"s": {"class_type": "KSampler"}}), [])


class ExtractComboOptionsTest(unittest.TestCase):
    def test_reads_legacy_list_spec(self):
        info = object_info("LoraLoader", "lora_name", [FRESH_LORA, CACHED_LORA])
        self.assertEqual(
            extract_combo_options(info, "LoraLoader", "lora_name"),
            [FRESH_LORA, CACHED_LORA],
        )

    def test_reads_typed_combo_spec(self):
        info = {
            "LoraLoader": {
                "input": {
                    "required": {
                        "lora_name": [{"type": "COMBO", "options": [FRESH_LORA]}]
                    }
                }
            }
        }
        self.assertEqual(
            extract_combo_options(info, "LoraLoader", "lora_name"), [FRESH_LORA]
        )

    def test_raises_on_unrecognized_shape(self):
        info = {"LoraLoader": {"input": {"required": {"lora_name": "STRING"}}}}
        with self.assertRaises(ValueError):
            extract_combo_options(info, "LoraLoader", "lora_name")


class FindMissingModelsTest(unittest.TestCase):
    def test_asks_each_node_class_once(self):
        calls = []

        def fetch(class_type):
            calls.append(class_type)
            return object_info("LoraLoader", "lora_name", [CACHED_LORA])

        missing = find_missing_models(
            [
                ("LoraLoader", "lora_name", CACHED_LORA),
                ("LoraLoader", "lora_name", FRESH_LORA),
            ],
            fetch,
        )
        self.assertEqual(calls, ["LoraLoader"])
        self.assertEqual(missing, [("LoraLoader", "lora_name", FRESH_LORA)])


class WaitForWorkflowModelsTest(unittest.TestCase):
    def setUp(self):
        self.now = 0.0
        self.slept = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds

    def test_first_use_lora_succeeds_within_one_submission(self):
        """生产故障的回归：新下的 LoRA 起初不在 ComfyUI 清单里，闸门等到它出现。"""
        listings = [
            [CHECKPOINT, CACHED_LORA],  # 刚下完，ComfyUI 清单还是旧的
            [CHECKPOINT, CACHED_LORA],
            [CHECKPOINT, CACHED_LORA, FRESH_LORA],  # 缓存失效后可见
        ]

        def fetch(class_type):
            options = listings[min(len(self.slept), len(listings) - 1)]
            field = "ckpt_name" if class_type == "CheckpointLoaderSimple" else "lora_name"
            return object_info(class_type, field, options)

        requirements = wait_for_workflow_models(
            lora_workflow(CACHED_LORA, FRESH_LORA),
            fetch,
            timeout_seconds=180,
            poll_interval_seconds=1,
            sleep=self.sleep,
            monotonic=self.monotonic,
        )

        self.assertIn(("LoraLoader", "lora_name", FRESH_LORA), requirements)
        self.assertEqual(self.slept, [1, 1])

    def test_returns_immediately_when_everything_is_listed(self):
        def fetch(class_type):
            field = "ckpt_name" if class_type == "CheckpointLoaderSimple" else "lora_name"
            return object_info(class_type, field, [CHECKPOINT, FRESH_LORA])

        wait_for_workflow_models(
            lora_workflow(FRESH_LORA),
            fetch,
            timeout_seconds=180,
            poll_interval_seconds=1,
            sleep=self.sleep,
            monotonic=self.monotonic,
        )
        self.assertEqual(self.slept, [])

    def test_no_request_when_workflow_has_no_model_nodes(self):
        def fetch(class_type):
            raise AssertionError("should not query ComfyUI")

        self.assertEqual(
            wait_for_workflow_models(
                {"s": {"class_type": "KSampler", "inputs": {"seed": 1}}},
                fetch,
                timeout_seconds=180,
                poll_interval_seconds=1,
                sleep=self.sleep,
                monotonic=self.monotonic,
            ),
            [],
        )

    def test_retries_while_comfyui_is_still_starting(self):
        attempts = {"count": 0}

        def fetch(class_type):
            attempts["count"] += 1
            if attempts["count"] <= 2:
                raise ConnectionError("connection refused")
            field = "ckpt_name" if class_type == "CheckpointLoaderSimple" else "lora_name"
            return object_info(class_type, field, [CHECKPOINT, FRESH_LORA])

        wait_for_workflow_models(
            lora_workflow(FRESH_LORA),
            fetch,
            timeout_seconds=180,
            poll_interval_seconds=1,
            sleep=self.sleep,
            monotonic=self.monotonic,
        )
        self.assertEqual(self.slept, [1, 1])

    def test_raises_with_filenames_when_model_never_appears(self):
        def fetch(class_type):
            field = "ckpt_name" if class_type == "CheckpointLoaderSimple" else "lora_name"
            return object_info(class_type, field, [CHECKPOINT])

        with self.assertRaises(ComfyModelNotVisibleError) as caught:
            wait_for_workflow_models(
                lora_workflow(FRESH_LORA),
                fetch,
                timeout_seconds=5,
                poll_interval_seconds=1,
                sleep=self.sleep,
                monotonic=self.monotonic,
            )
        self.assertEqual(
            caught.exception.missing, [("LoraLoader", "lora_name", FRESH_LORA)]
        )
        self.assertIn(FRESH_LORA, str(caught.exception))

    def test_protocol_change_fails_fast_instead_of_burning_the_timeout(self):
        def fetch(class_type):
            return {class_type: {"input": {"required": {"lora_name": "STRING"}}}}

        with self.assertRaises(ValueError):
            wait_for_workflow_models(
                lora_workflow(FRESH_LORA, checkpoint=None),
                fetch,
                timeout_seconds=180,
                poll_interval_seconds=1,
                sleep=self.sleep,
                monotonic=self.monotonic,
            )
        self.assertEqual(self.slept, [])


if __name__ == "__main__":
    unittest.main()
