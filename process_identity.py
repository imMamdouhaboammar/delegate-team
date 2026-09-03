"""Compatibility import for source loaders that execute MMAS modules from the repo root.

The runtime entrypoint resolves ``mmas/process_identity.py`` from its script directory.
Some repository tests intentionally load ``mmas/spawn-team.py`` directly with
``importlib.util.spec_from_file_location``; in that mode Python does not add the
script directory to ``sys.path``. This shim preserves the same implementation
without duplicating identity logic.
"""

from mmas.process_identity import verify_pid_started_at

__all__ = ["verify_pid_started_at"]
