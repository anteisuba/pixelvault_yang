import unittest

from runner_payload import (
    UINT64_MAX,
    build_input_image_specs,
    normalize_workflow_seeds,
    safe_basename,
)


class NormalizeWorkflowSeedsTest(unittest.TestCase):
    def make_job(self, seed):
        return {
            "input": {
                "workflow": {
                    "sampler": {
                        "class_type": "KSampler",
                        "inputs": {"seed": seed},
                    }
                }
            }
        }

    def test_preserves_large_seed_exactly(self):
        job = self.make_job("5536891017203")
        normalize_workflow_seeds(job)
        self.assertEqual(job["input"]["workflow"]["sampler"]["inputs"]["seed"], 5536891017203)

    def test_accepts_uint64_max(self):
        job = self.make_job(str(UINT64_MAX))
        normalize_workflow_seeds(job)
        self.assertEqual(job["input"]["workflow"]["sampler"]["inputs"]["seed"], UINT64_MAX)

    def test_rejects_out_of_range_seed(self):
        with self.assertRaises(ValueError):
            normalize_workflow_seeds(self.make_job(str(UINT64_MAX + 1)))


class BuildInputImageSpecsTest(unittest.TestCase):
    def spec(self, **overrides):
        base = {
            "name": "reference.png",
            "url": "https://cdn.example.com/ref.png",
            "source": "r2",
        }
        base.update(overrides)
        return [base]

    def test_returns_name_url_pairs(self):
        self.assertEqual(
            build_input_image_specs(self.spec()),
            [("reference.png", "https://cdn.example.com/ref.png")],
        )

    def test_empty_input_is_not_an_error(self):
        for empty in (None, [], {}):
            self.assertEqual(build_input_image_specs(empty), [])

    def test_rejects_non_r2_source(self):
        for source in ("civitai", "huggingface", "http", None):
            with self.assertRaises(ValueError):
                build_input_image_specs(self.spec(source=source))

    def test_rejects_path_traversal_in_name(self):
        for name in ("../reference.png", "nested/reference.png", "..", ""):
            with self.assertRaises(ValueError):
                build_input_image_specs(self.spec(name=name))

    def test_rejects_missing_url(self):
        with self.assertRaises(ValueError):
            build_input_image_specs(self.spec(url=""))

    def test_rejects_non_https_url(self):
        # http:// would let a malformed payload reach internal metadata endpoints.
        for url in (
            "http://cdn.example.com/ref.png",
            "http://169.254.169.254/latest/meta-data/",
            "file:///etc/passwd",
        ):
            with self.assertRaises(ValueError):
                build_input_image_specs(self.spec(url=url))

    def test_rejects_malformed_container(self):
        with self.assertRaises(ValueError):
            build_input_image_specs("reference.png")
        with self.assertRaises(ValueError):
            build_input_image_specs(["reference.png"])


class SafeBasenameTest(unittest.TestCase):
    def test_accepts_plain_basename(self):
        self.assertEqual(safe_basename("reference.png"), "reference.png")

    def test_rejects_separators_and_parent_refs(self):
        for name in ("a/b.png", "a\\b.png", "../b.png", "", None):
            with self.assertRaises(ValueError):
                safe_basename(name)


if __name__ == "__main__":
    unittest.main()
