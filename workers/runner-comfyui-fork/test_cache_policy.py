import os
import tempfile
import unittest
from collections import namedtuple

from cache_policy import ensure_cache_capacity, list_managed_files


Usage = namedtuple("Usage", "total used free")


class CachePolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.loras = os.path.join(self.temp.name, "loras")
        self.checkpoints = os.path.join(self.temp.name, "checkpoints")
        self.diffusion = os.path.join(self.temp.name, "unet")
        os.makedirs(self.loras)
        os.makedirs(self.checkpoints)
        os.makedirs(self.diffusion)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, directory, name, size, mtime):
        path = os.path.join(directory, name)
        with open(path, "wb") as handle:
            handle.write(b"x" * size)
        os.utime(path, (mtime, mtime))
        return path

    def test_lists_only_pixelvault_managed_dynamic_files(self):
        managed_lora = self.write(self.loras, "civitai-1.safetensors", 10, 1)
        managed_hf = self.write(self.loras, "hf-abc-style.safetensors", 10, 2)
        managed_ckpt = self.write(
            self.checkpoints, "civitai-ckpt-2.safetensors", 10, 3
        )
        managed_anima_ckpt = self.write(
            self.diffusion, "civitai-ckpt-3.safetensors", 10, 4
        )
        self.write(self.loras, "owner-file.safetensors", 10, 4)
        self.assertEqual(
            set(
                list_managed_files(
                    self.loras, self.checkpoints, self.diffusion
                )
            ),
            {managed_lora, managed_hf, managed_ckpt, managed_anima_ckpt},
        )

    def test_evicts_oldest_managed_file_and_preserves_protected_file(self):
        oldest = self.write(self.loras, "civitai-1.safetensors", 40, 1)
        protected = self.write(self.loras, "civitai-2.safetensors", 60, 2)
        destination = os.path.join(self.loras, "civitai-3.safetensors")
        evicted = ensure_cache_capacity(
            destination,
            incoming_bytes=50,
            lora_dir=self.loras,
            checkpoint_dir=self.checkpoints,
            protected_paths={protected},
            reserve_bytes=20,
            disk_usage_fn=lambda _: Usage(total=1000, used=950, free=50),
        )
        self.assertEqual(evicted, [oldest])
        self.assertFalse(os.path.exists(oldest))
        self.assertTrue(os.path.exists(protected))


if __name__ == "__main__":
    unittest.main()
