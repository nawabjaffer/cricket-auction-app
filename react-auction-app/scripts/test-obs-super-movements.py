import importlib.util
import queue
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path

sys.modules["obspython"] = types.ModuleType("obspython")
SCRIPT = Path(__file__).resolve().parents[1] / "public" / "assets" / "obs-super-movements.py"
spec = importlib.util.spec_from_file_location("obs_super_movements", SCRIPT)
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)


class SuperMovementsTests(unittest.TestCase):
    def setUp(self):
        script.results = queue.Queue()

    def test_copy_is_exact_and_uses_sibling_folder(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "Cricket Replays" / "replay.mkv"
            source.parent.mkdir()
            payload = bytes(range(256)) * 4096
            source.write_bytes(payload)
            script.copy_clip(str(source), str(uuid.uuid4()))
            result = script.results.get_nowait()
            self.assertEqual(result["status"], "saved")
            destination = Path(result["savedPath"])
            self.assertEqual(destination.parent, Path(root).resolve() / "Super Movements")
            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(source.read_bytes(), payload)
            self.assertEqual(list(destination.parent.glob("*.partial")), [])

    def test_reports_missing_file(self):
        script.copy_clip("/missing/replay.mkv", str(uuid.uuid4()))
        self.assertEqual(script.results.get_nowait()["status"], "error")

    def test_rejects_request_id_path_traversal(self):
        script.copy_clip("/missing/replay.mkv", "../../outside")
        self.assertEqual(script.results.get_nowait()["status"], "error")


if __name__ == "__main__":
    unittest.main()