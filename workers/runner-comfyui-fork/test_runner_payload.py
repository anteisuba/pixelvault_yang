import unittest

from runner_payload import UINT64_MAX, normalize_workflow_seeds


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


if __name__ == "__main__":
    unittest.main()
