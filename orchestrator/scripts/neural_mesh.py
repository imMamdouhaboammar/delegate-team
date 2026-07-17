#!/usr/bin/env python3
"""neural_mesh.py — the Python half of the delegate-team neural mesh.

This module mirrors src/neural/mesh.ts. Both read the SAME single-source-of-
truth file (neural-mesh.json at the repo root), so editing that one file
rewires routing for the TypeScript dt CLI and the Python orchestrator at once.

It answers the questions the orchestrator used to answer with inline constants:
  - which delegate-skill neuron should a DELEGATE verdict hit?
  - what is the failover chain for a backend?
  - which neurons does a component connect to?
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

# orchestrator/scripts/neural_mesh.py -> repo root is two levels up.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, "..", ".."))
DEFAULT_MESH_PATH = os.path.join(_REPO_ROOT, "neural-mesh.json")


@dataclass
class Synapse:
    type: str
    from_: str
    to: str
    weight: float
    signal: Optional[str] = None


@dataclass
class Neuron:
    id: str
    label: str
    kind: str
    layer: int
    summary: str
    runtime: str
    entry: str


class NeuralMesh:
    def __init__(self, doc: dict, mesh_path: str = DEFAULT_MESH_PATH):
        self.doc = doc
        self.mesh_path = mesh_path
        self.neurons: List[Neuron] = [Neuron(**n) for n in doc.get("neurons", [])]
        self.synapses: List[Synapse] = [
            Synapse(
                type=s["type"],
                from_=s["from"],
                to=s["to"],
                weight=float(s.get("weight", 0.0)),
                signal=s.get("signal"),
            )
            for s in doc.get("synapses", [])
        ]
        self._index: Dict[str, Neuron] = {n.id: n for n in self.neurons}

    @classmethod
    def from_path(cls, mesh_path: str = DEFAULT_MESH_PATH) -> "NeuralMesh":
        if not os.path.isfile(mesh_path):
            raise FileNotFoundError(f"neural mesh not found at {mesh_path}")
        with open(mesh_path, "r", encoding="utf-8") as fh:
            return cls(json.load(fh), mesh_path=mesh_path)

    def get_neuron(self, neuron_id: str) -> Optional[Neuron]:
        return self._index.get(neuron_id)

    def outgoing(self, from_id: str, synapse_type: Optional[str] = None) -> List[Synapse]:
        return [
            s for s in self.synapses
            if s.from_ == from_id and (synapse_type is None or s.type == synapse_type)
        ]

    def incoming(self, to_id: str, synapse_type: Optional[str] = None) -> List[Synapse]:
        return [
            s for s in self.synapses
            if s.to == to_id and (synapse_type is None or s.type == synapse_type)
        ]

    def delegate_target_for(self, agent: str) -> Optional[str]:
        """The delegate-skill neuron an orchestrator DELEGATE verdict hits."""
        for s in self.outgoing("orchestrator", "ROUTES_TO"):
            if s.signal == f"verdict==DELEGATE && agent=={agent}":
                return s.to
        return None

    def fallback_chain(self, backend: str) -> List[str]:
        """Failover chain for a backend, highest weight first."""
        return [
            s.to for s in sorted(
                self.outgoing(backend, "FALLBACKS_TO"),
                key=lambda x: -x.weight,
            )
        ]

    def neighbors(self, neuron_id: str) -> List[str]:
        out = [s.to for s in self.outgoing(neuron_id)]
        inc = [s.from_ for s in self.incoming(neuron_id)]
        return list(dict.fromkeys(out + inc))


def load_mesh(mesh_path: str = DEFAULT_MESH_PATH) -> Optional[NeuralMesh]:
    """Best-effort loader: returns None if the mesh is missing/unreadable."""
    try:
        return NeuralMesh.from_path(mesh_path)
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None


def _main(argv: List[str]) -> int:
    """CLI: `neural_mesh.py [neurons|synapses|graph]`. Default: summary."""
    mesh = load_mesh()
    if mesh is None:
        print("neural mesh not found", file=__import__("sys").stderr)
        return 2
    mode = argv[1] if len(argv) > 1 else "summary"
    if mode == "neurons":
        for n in sorted(mesh.neurons, key=lambda x: x.layer):
            print(f"{n.id:<22} L{n.layer} {n.kind:<14} {n.label}")
    elif mode == "synapses":
        for s in mesh.synapses:
            print(f"{s.from_:<20} --[{s.type}]--> {s.to:<22} w={s.weight}")
    elif mode == "graph":
        print("digraph neural_mesh {")
        for n in mesh.neurons:
            print(f'  "{n.id}" [label="{n.label}"];')
        for s in mesh.synapses:
            print(f'  "{s.from_}" -> "{s.to}" [label="{s.type}"];')
        print("}")
    else:
        print(f"Neural mesh: {len(mesh.neurons)} neurons, {len(mesh.synapses)} synapses")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_main(sys.argv))
