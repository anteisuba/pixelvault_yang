import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from comfy_models import collect_model_requirements
from qwen_workflow import MODEL_FILES, build_workflow, download_models
from runner_payload import normalize_workflow_seeds


class QwenWorkflowTest(unittest.TestCase):
    def test_text_generation_uses_qwen_conditioning_and_requested_dimensions(self):
        graph = build_workflow("一个写着千问的杯子", width=1536, height=1024)
        self.assertEqual(graph["encode"]["class_type"], "TextEncodeQwenImage21")
        self.assertEqual(graph["encode"]["inputs"]["prompt"], "一个写着千问的杯子")
        self.assertEqual(graph["latent"]["inputs"], {"width": 1536, "height": 1024, "batch_size": 1})
        self.assertEqual(graph["sampler"]["inputs"]["cfg"], 1)
        self.assertNotIn("cache", graph)
        self.assertEqual({item[2] for item in collect_model_requirements(graph)},
                         {item[0].split("/")[-1] for item in MODEL_FILES})

    def test_edit_references_feed_both_vision_and_vae_and_keep_target_geometry(self):
        graph = build_workflow("Put the shirt from <image2> on <image1>",
                               references=["person.png", "shirt.png"])
        encode = graph["encode"]["inputs"]
        self.assertEqual(encode["vae"], ["vae", 0])
        self.assertEqual(encode["images.image_1"], ["reference-1", 0])
        self.assertEqual(encode["images.image_2"], ["reference-2", 0])
        self.assertEqual(graph["reference-1"]["inputs"]["image"], "person.png")
        self.assertEqual(graph["sampler"]["inputs"]["latent_image"], ["encode", 2])
        self.assertEqual(graph["sampler"]["inputs"]["denoise"], 1)
        self.assertNotIn("latent", graph)

    def test_seed_survives_existing_handler_without_javascript_precision_loss(self):
        maximum = 18_446_744_073_709_551_615
        graph = build_workflow("cup", seed=maximum)
        self.assertEqual(graph["sampler"]["inputs"]["seed"], str(maximum))
        normalize_workflow_seeds({"input": {"workflow": graph}})
        self.assertEqual(graph["sampler"]["inputs"]["seed"], maximum)

    def test_rejects_invalid_and_excessive_inputs(self):
        for kwargs in [dict(width=1000), dict(height=4096), dict(steps=0),
                       dict(seed=-1), dict(cfg=float("nan")),
                       dict(references=["../secret.png"]),
                       dict(references=["ref.png"] * 11)]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                build_workflow("cup", **kwargs)

    def test_all_graph_links_point_to_existing_nodes(self):
        for references in [[], ["person.png"], [f"ref{i}.png" for i in range(10)]]:
            graph = build_workflow("cup", references=references)
            for node in graph.values():
                for value in node["inputs"].values():
                    if isinstance(value, list):
                        self.assertIn(value[0], graph)

    def test_download_checks_integrity_and_preserves_license(self):
        content = b"test weights"
        manifest = (("vae/test.safetensors", len(content), hashlib.sha256(content).hexdigest()),)
        with tempfile.TemporaryDirectory() as directory, \
                patch("qwen_workflow.MODEL_FILES", manifest), \
                patch("qwen_workflow.urlopen", side_effect=[io.BytesIO(content), io.BytesIO(b"research license")]):
            download_models(directory)
            self.assertEqual((Path(directory) / manifest[0][0]).read_bytes(), content)
            self.assertEqual((Path(directory) / "Qwen-Image-2.1-LICENSE.txt").read_bytes(), b"research license")

    def test_corrupt_download_never_replaces_existing_model(self):
        manifest = (("vae/test.safetensors", 4, "0" * 64),)
        with tempfile.TemporaryDirectory() as directory, \
                patch("qwen_workflow.MODEL_FILES", manifest), \
                patch("qwen_workflow.urlopen", return_value=io.BytesIO(b"bad!")):
            target = Path(directory) / manifest[0][0]
            target.parent.mkdir()
            target.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "integrity"):
                download_models(directory)
            self.assertEqual(target.read_bytes(), b"original")
            self.assertFalse(target.with_suffix(".partial").exists())


if __name__ == "__main__":
    unittest.main()
