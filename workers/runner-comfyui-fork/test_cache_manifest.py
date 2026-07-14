import json
import os
import tempfile
import unittest

from cache_manifest import append_download_event, write_volume_manifest


class CacheManifestTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.volume = self.temp.name
        self.loras = os.path.join(self.volume, "models", "loras")
        os.makedirs(self.loras)
        self.manifest = os.path.join(
            self.volume, "pixelvault-cache-manifest.json"
        )
        self.history = os.path.join(
            self.volume, "pixelvault-download-history.jsonl"
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_manifest_lists_files_and_extracts_civitai_version_id(self):
        lora = os.path.join(self.loras, "civitai-3118200.safetensors")
        with open(lora, "wb") as handle:
            handle.write(b"lora")
        with open(
            os.path.join(self.volume, "download.log"), "w", encoding="utf-8"
        ) as handle:
            handle.write("legacy")

        payload = write_volume_manifest(
            self.manifest,
            self.volume,
            {"managed_files": 1},
            self.history,
        )

        self.assertEqual(payload["fileCount"], 2)
        by_path = {item["path"]: item for item in payload["files"]}
        record = by_path["models/loras/civitai-3118200.safetensors"]
        self.assertEqual(record["civitaiVersionId"], 3118200)
        self.assertEqual(record["kind"], "loras")
        with open(self.manifest, encoding="utf-8") as handle:
            self.assertEqual(json.load(handle)["fileCount"], 2)

    def test_download_history_is_append_only_and_secret_free(self):
        append_download_event(
            self.history,
            action="downloaded",
            kind="lora",
            source="r2",
            filename="civitai-1.safetensors",
            target_path="models/loras/civitai-1.safetensors",
            size_bytes=12,
        )
        append_download_event(
            self.history,
            action="evicted",
            kind="cache",
            source="runner",
            filename="civitai-1.safetensors",
            target_path="models/loras/civitai-1.safetensors",
        )

        with open(self.history, encoding="utf-8") as handle:
            events = [json.loads(line) for line in handle]
        self.assertEqual(
            [event["action"] for event in events], ["downloaded", "evicted"]
        )
        self.assertNotIn("url", events[0])


if __name__ == "__main__":
    unittest.main()
