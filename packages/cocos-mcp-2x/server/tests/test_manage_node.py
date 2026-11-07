"""Typed tool contract with inert FastMCP/bridge; no SDK, IPC or editor."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SOURCE))
fake_mcp = ModuleType("fastmcp")
fake_mcp.Context = type("Context", (), {})
fake_registry = ModuleType("services.registry")
fake_registry.cocos_mcp_tool = lambda **kwargs: lambda function: function
fake_common = ModuleType("services.tools._common")
fake_common.call_bridge = None
spec = importlib.util.spec_from_file_location("isolated_manage_node", SOURCE / "services/tools/manage_node.py")
tool = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"fastmcp": fake_mcp, "services.registry": fake_registry, "services.tools._common": fake_common}):
    spec.loader.exec_module(tool)


class ManageNodeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []

        async def call_bridge(command, params):
            self.calls.append((command, params))
            return {"success": True, "data": "unchanged envelope"}
        self.patch = patch.object(tool, "call_bridge", call_bridge)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    async def test_set_property_forwards_null_false_zero_empty_strings_and_objects(self):
        for value in (None, False, 0, "", {}, {"x": 0}):
            with self.subTest(value=value):
                reply = await tool.manage_node(None, "set_property", uuid="node", property="cc.Sprite.spriteFrame", value=value)
                self.assertEqual(self.calls[-1], ("manage_node", {"action": "set_property", "uuid": "node", "property": "cc.Sprite.spriteFrame", "value": value}))
                self.assertEqual(reply, {"success": True, "data": "unchanged envelope"})

    async def test_other_actions_retain_their_existing_omitted_optional_fields(self):
        for action in ("get", "create", "delete", "add_component", "selection"):
            await tool.manage_node(None, action)
            self.assertEqual(self.calls[-1], ("manage_node", {"action": action}))
        await tool.manage_node(None, "tree", uuid="root", max_depth=3)
        self.assertEqual(self.calls[-1], ("manage_node", {"action": "tree", "uuid": "root", "maxDepth": 3}))
        await tool.manage_node(None, "create", parent_uuid="root", name="", position={"x": 0})
        self.assertEqual(self.calls[-1][1], {"action": "create", "parentUuid": "root", "name": "", "position": {"x": 0}})


if __name__ == "__main__":
    unittest.main()
