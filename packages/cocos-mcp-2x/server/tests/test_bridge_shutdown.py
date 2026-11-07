"""Actual bridge-owned event-loop threads, with inert server/client transports."""

import asyncio
import json
from pathlib import Path
import sys
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from transport.ws_client import BridgeUnavailable, CocosBridge


class InertServer:
    def __init__(self):
        self.closes = 0
        self.waits = 0

    def close(self):
        self.closes += 1

    async def wait_closed(self):
        self.waits += 1
        await asyncio.sleep(0)


class InertClient:
    def __init__(self, delay=0, hold_close=False):
        self.delay = delay
        self.closes = []
        self.sent = threading.Event()
        self.closing = threading.Event()
        self.release = threading.Event()
        if not hold_close:
            self.release.set()

    async def send(self, value):
        json.loads(value)
        self.sent.set()

    async def close(self, **kwargs):
        self.closes.append(kwargs)
        self.closing.set()
        while not self.release.is_set():
            await asyncio.sleep(.001)
        await asyncio.sleep(self.delay)


class ThreadBridge(CocosBridge):
    async def _serve(self):
        self.worker = threading.current_thread()
        self.inert_server = InertServer()
        return self.inert_server


class BridgeShutdownTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bridge = ThreadBridge("127.0.0.1", 0, "/no-sockets")
        self.clients = []
        self.bridge.start_in_thread(ready_timeout=1)

    async def asyncTearDown(self):
        for client in self.clients:
            client.release.set()
        if self.bridge.worker.is_alive():
            await self.bridge.close()
            await asyncio.to_thread(self.bridge.worker.join, 1)
        self.assertFalse(self.bridge.worker.is_alive())
        self.assertTrue(self.bridge._loop.is_closed())
        self.assertFalse(self.bridge._pending)

    async def owned(self, coroutine):
        return await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(coroutine, self.bridge._loop))

    async def install_client(self, client):
        self.clients.append(client)
        async def install():
            self.bridge._client = client
        await self.owned(install())

    async def test_shutdown_result_arrives_before_owned_loop_stops_and_repeated_close_is_immediate(self):
        start = time.monotonic()
        await self.bridge.close()
        self.assertLess(time.monotonic() - start, 2, "shutdown waited for the old five-second delivery timeout")
        await asyncio.to_thread(self.bridge.worker.join, 1)
        self.assertFalse(self.bridge.worker.is_alive())
        await self.bridge.close()
        await self.bridge.close()
        self.assertEqual(self.bridge.inert_server.closes, 1)
        self.assertEqual(self.bridge.inert_server.waits, 1)

    async def test_concurrent_close_does_not_block_caller_loop_and_one_cancelled_waiter_cannot_cancel_cleanup(self):
        client = InertClient(hold_close=True)
        self.addCleanup(client.release.set)
        await self.install_client(client)
        first = asyncio.create_task(self.bridge.close())
        second = asyncio.create_task(self.bridge.close())
        self.assertTrue(await asyncio.to_thread(client.closing.wait, 1))
        self.assertFalse(second.done(), "the external loop did not run until socket cleanup finished")
        self.assertTrue(client.closing.is_set())
        first.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await first
        with self.assertRaisesRegex(BridgeUnavailable, "shutting down"):
            await self.bridge.call("not-sent")
        rejected = InertClient()
        await self.owned(self.bridge._on_connection(rejected))
        self.assertEqual(rejected.closes[0]["code"], 1001)
        self.assertIsNone(self.bridge._client)
        client.release.set()
        await second
        self.assertEqual(len(client.closes), 1)
        self.assertEqual(self.bridge.inert_server.closes, 1)

    async def test_inflight_public_request_fails_and_releases_ownership_before_shutdown(self):
        client = InertClient(delay=.01)
        await self.install_client(client)
        request = asyncio.create_task(self.bridge.call("pending", timeout=20))
        self.assertTrue(await asyncio.to_thread(client.sent.wait, 1))
        closing = asyncio.create_task(self.bridge.close())
        with self.assertRaisesRegex(BridgeUnavailable, "shutting down"):
            await request
        await closing
        self.assertFalse(self.bridge._pending)

    async def test_close_before_start_is_idempotent_and_denies_future_requests(self):
        other = CocosBridge("127.0.0.1", 0, "/never-started")
        await other.close()
        await other.close()
        with self.assertRaisesRegex(BridgeUnavailable, "shutting down"):
            await other.call("not-sent")
        client = InertClient()
        await other._on_connection(client)
        self.assertEqual(client.closes[0]["code"], 1001)
        self.assertIsNone(other._client)


if __name__ == "__main__":
    unittest.main()
