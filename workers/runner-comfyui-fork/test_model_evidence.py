import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from PIL import Image, PngImagePlugin


class ModelEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'model.safetensors'
        self.path.write_bytes(b'actual-model-bytes')
        self.mutate_on_load = False
        self.fail_on_load = False
        self.lora_calls = 0
        owner = self

        class Checkpoint:
            def load_checkpoint(self, name):
                if owner.fail_on_load:
                    raise RuntimeError('loader failed')
                if owner.mutate_on_load:
                    owner.path.write_bytes(b'changed-during-loading')
                return ('model', 'clip', 'vae')

        class Lora:
            @classmethod
            def INPUT_TYPES(cls):
                return {'required': {}}

            def load_lora(self, model, clip, name, strength_model, strength_clip):
                owner.lora_calls += 1
                owner.assertIsNone(self.loaded_lora)
                if owner.mutate_on_load:
                    owner.path.write_bytes(b'changed-lora')
                return ('patched-model', 'patched-clip')

        class Save:
            @classmethod
            def INPUT_TYPES(cls):
                return {'required': {}}

            def save_images(self, images, filename_prefix, prompt, extra_pnginfo):
                owner.saved_info = extra_pnginfo
                pnginfo = PngImagePlugin.PngInfo()
                for key, value in extra_pnginfo.items():
                    pnginfo.add_text(key, json.dumps(value))
                stream = io.BytesIO()
                Image.new('RGB', (1, 1)).save(stream, format='PNG', pnginfo=pnginfo)
                return stream.getvalue()

        self.args = types.SimpleNamespace(disable_metadata=False)
        modules = {
            'nodes': types.SimpleNamespace(CheckpointLoaderSimple=Checkpoint, LoraLoader=Lora, SaveImage=Save),
            'folder_paths': types.SimpleNamespace(get_full_path_or_raise=lambda folder, name: str(self.path)),
            'comfy': types.ModuleType('comfy'),
            'comfy.cli_args': types.SimpleNamespace(args=self.args),
        }
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location('test_evidence_module', Path(__file__).with_name('model_evidence.py'))
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    def test_checkpoint_records_real_file_digest_after_successful_load(self):
        result = self.module.PixelVaultCheckpointLoader().load_verified('model.safetensors')
        self.assertEqual(result[:3], ('model', 'clip', 'vae'))
        self.assertEqual(json.loads(result[3]), [{
            'kind': 'checkpoint', 'filename': 'model.safetensors',
            'sha256': hashlib.sha256(self.path.read_bytes()).hexdigest(),
            'sizeBytes': self.path.stat().st_size,
        }])

    def test_failed_loader_does_not_return_evidence(self):
        self.fail_on_load = True
        with self.assertRaisesRegex(RuntimeError, 'loader failed'):
            self.module.PixelVaultCheckpointLoader().load_verified('model.safetensors')

    def test_checkpoint_mutated_during_load_is_rejected(self):
        self.mutate_on_load = True
        with self.assertRaisesRegex(RuntimeError, 'changed during loading'):
            self.module.PixelVaultCheckpointLoader().load_verified('model.safetensors')

    def test_changed_file_invalidates_cached_digest(self):
        first = self.module.PixelVaultCheckpointLoader.IS_CHANGED('model.safetensors')
        self.path.write_bytes(b'replacement-model')
        second = self.module.PixelVaultCheckpointLoader.IS_CHANGED('model.safetensors')
        self.assertNotEqual(first, second)
        self.assertEqual(second, hashlib.sha256(b'replacement-model').hexdigest())

    def test_lora_records_loaded_strengths_and_preserves_upstream_audit(self):
        upstream = [{'kind': 'checkpoint', 'filename': 'base.safetensors'}]
        loader = self.module.PixelVaultLoraLoader()
        loader.loaded_lora = 'stale tensors'
        result = loader.load_verified('m', 'c', 'model.safetensors', 0.8, 0.6, json.dumps(upstream))
        records = json.loads(result[2])
        self.assertEqual(records[0], upstream[0])
        self.assertEqual(records[1]['sha256'], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual((records[1]['strengthModel'], records[1]['strengthClip']), (0.8, 0.6))
        self.assertEqual(self.lora_calls, 1)

    def test_zero_strength_lora_never_claims_a_load(self):
        self.path.unlink()
        result = self.module.PixelVaultLoraLoader().load_verified('m', 'c', 'missing.safetensors', 0, 0, '[]')
        self.assertEqual(result, ('m', 'c', '[]'))
        self.assertEqual(self.lora_calls, 0)

    def test_lora_mutated_during_load_is_rejected(self):
        self.mutate_on_load = True
        with self.assertRaisesRegex(RuntimeError, 'changed during loading'):
            self.module.PixelVaultLoraLoader().load_verified('m', 'c', 'model.safetensors', 1, 1, '[]')

    def test_save_embeds_loader_audit_in_actual_png(self):
        audit = self.module.PixelVaultCheckpointLoader().load_verified('model.safetensors')[3]
        raw = self.module.PixelVaultSaveImage().save_verified(None, audit, extra_pnginfo={'existing': 'keep'})
        with Image.open(io.BytesIO(raw)) as png:
            self.assertEqual(json.loads(png.info['pixelvaultExecution']), {'version': 1, 'evidence': 'loader-output', 'models': json.loads(audit)})
            self.assertEqual(json.loads(png.info['existing']), 'keep')

    def test_disabled_metadata_fails_instead_of_generating_unverifiable_image(self):
        self.args.disable_metadata = True
        with self.assertRaisesRegex(RuntimeError, 'requires PNG metadata'):
            self.module.PixelVaultSaveImage().save_verified(None, '[]')


if __name__ == '__main__':
    unittest.main()
