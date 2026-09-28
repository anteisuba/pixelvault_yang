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

    def test_quota_drives_eviction_when_the_filesystem_reports_plenty_free(self):
        # 2026-09-27：卷配额满了，文件系统却报有大把剩余——按配额算才会清。
        oldest = self.write(self.checkpoints, "civitai-ckpt-1.safetensors", 40, 1)
        newer = self.write(self.loras, "civitai-2.safetensors", 30, 2)
        destination = os.path.join(self.checkpoints, "civitai-ckpt-3.safetensors")
        evicted = ensure_cache_capacity(
            destination,
            incoming_bytes=50,
            lora_dir=self.loras,
            checkpoint_dir=self.checkpoints,
            reserve_bytes=10,
            disk_usage_fn=lambda _: Usage(total=10**12, used=0, free=10**12),
            quota_bytes=1000,
            volume_root=self.temp.name,
            used_bytes_fn=lambda _: 980,
        )
        # 剩 1000 − 980 = 20，需要 50 + 10：清掉最老的 40 就够，newer 留着。
        self.assertEqual(evicted, [oldest])
        self.assertTrue(os.path.exists(newer))

    def test_quota_is_ignored_without_a_volume_root(self):
        evicted = ensure_cache_capacity(
            os.path.join(self.loras, "civitai-9.safetensors"),
            incoming_bytes=50,
            lora_dir=self.loras,
            checkpoint_dir=self.checkpoints,
            reserve_bytes=10,
            disk_usage_fn=lambda _: Usage(total=1000, used=0, free=1000),
            quota_bytes=10,
        )
        self.assertEqual(evicted, [])


if __name__ == "__main__":
    unittest.main()
