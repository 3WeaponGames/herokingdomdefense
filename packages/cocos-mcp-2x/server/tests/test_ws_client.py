"""Silent bridge lifecycle tests. All transports are inert; no sockets open."""

import asyncio
from http import HTTPStatus
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from transport.ws_client import BridgeError, BridgeUnavailable, CocosBridge


class Client:
    def __init__(self):
        self.messages = []
        self.queue = asyncio.Queue()
        self.send_gate = None
        self.close_gate = None
        self.send_error = None
        self.hello_gate = None
        self.closes = []

    async def send(self, value):
        frame = json.loads(value)
        self.messages.append(frame)
        if frame.get("type") == "hello":
            if self.hello_gate is not None:
                await self.hello_gate.wait()
        else:
            if self.send_gate is not None:
                await self.send_gate.wait()
            if self.send_error is not None:
                raise self.send_error

    async def close(self, **kwargs):
        self.closes.append(kwargs)
        if self.close_gate is not None:
            await self.close_gate.wait()

    def __aiter__(self):
        return self

    async def __anext__(self):
        value = await self.queue.get()
        if value is None:
            raise StopAsyncIteration
        return value

    def reply(self, data=None, success=True):
        request = next(frame for frame in reversed(self.messages) if "command" in frame)
        self.queue.put_nowait(json.dumps({"id": request["id"], "success": success, "data": data, "error": "rejected"}))


class BridgeLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bridge = CocosBridge("127.0.0.1", 0, "/test-bridge")
        self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.assertFalse(self.bridge._pending)

    def task(self, awaitable):
        task = asyncio.create_task(awaitable)
        self.tasks.append(task)
        return task

    async def connect(self, client):
        reader = self.task(self.bridge._on_connection(client))
        await asyncio.sleep(0)
        return reader

    async def request(self, command="test", timeout=1):
        task = self.task(self.bridge._call_impl(command, {}, timeout))
        await asyncio.sleep(0)
        return task

    async def test_old_reader_finally_cannot_fail_replacement_requests(self):
        old, new = Client(), Client()
        old_reader = await self.connect(old)
        await self.connect(new)
        request = await self.request()
        old.queue.put_nowait(None)
        await old_reader
        self.assertIs(self.bridge._client, new)
        self.assertEqual(len(self.bridge._pending), 1)
        self.assertFalse(request.done())
        new.reply({"owner": "new"})
        self.assertEqual(await request, {"owner": "new"})

    async def test_replacement_retires_old_requests_and_cannot_accept_an_old_client_reply(self):
        old, new = Client(), Client()
        old_reader = await self.connect(old)
        old_request = await self.request("old")
        await self.connect(new)
        with self.assertRaisesRegex(BridgeUnavailable, "superseded"):
            await old_request
        request = await self.request("new")
        rid = new.messages[-1]["id"]
        old.queue.put_nowait(json.dumps({"id": rid, "success": True, "data": "wrong owner"}))
        await old_reader
        self.assertFalse(request.done())
        new.reply("right owner")
        self.assertEqual(await request, "right owner")

    async def test_newest_connection_wins_when_old_close_is_suspended(self):
        first, second, third = Client(), Client(), Client()
        first_reader = await self.connect(first)
        first.close_gate = asyncio.Event()
        second_reader = await self.connect(second)
        self.assertIs(self.bridge._client, second)
        second_request = await self.request("second")
        await self.connect(third)
        with self.assertRaises(BridgeUnavailable):
            await second_request
        first.close_gate.set()
        await second_reader
        self.assertIs(self.bridge._client, third)
        first.queue.put_nowait(None)
        await first_reader
        request = await self.request("third")
        third.reply("newest")
        self.assertEqual(await request, "newest")

    async def test_superseded_hello_continuation_cannot_reclaim_current_client(self):
        old, new = Client(), Client()
        old.hello_gate = asyncio.Event()
        old_reader = await self.connect(old)
        await self.connect(new)
        old.hello_gate.set()
        await old_reader
        self.assertIs(self.bridge._client, new)
        request = await self.request()
        new.reply("current")
        self.assertEqual(await request, "current")

    async def test_request_cancellation_retires_id_while_sending_or_waiting(self):
        for sending in (False, True):
            with self.subTest(sending=sending):
                client = Client()
                if sending:
                    client.send_gate = asyncio.Event()
                await self.connect(client)
                request = await self.request()
                self.assertEqual(len(self.bridge._pending), 1)
                request.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await request
                self.assertFalse(self.bridge._pending)

    async def test_send_exception_timeout_and_rejected_reply_leave_no_pending_entry(self):
        client = Client()
        await self.connect(client)
        client.send_error = RuntimeError("send failed")
        with self.assertRaisesRegex(RuntimeError, "send failed"):
            await self.bridge._call_impl("bad-send", {}, 1)
        self.assertFalse(self.bridge._pending)
        client.send_error = None
        with self.assertRaisesRegex(BridgeUnavailable, "timeout"):
            await self.bridge._call_impl("timeout", {}, .001)
        self.assertFalse(self.bridge._pending)
        request = await self.request("rejected")
        client.reply(success=False)
        with self.assertRaisesRegex(BridgeError, "rejected"):
            await request

    async def test_replacement_during_send_retires_only_old_request_without_unhandled_future(self):
        old, new = Client(), Client()
        old.send_gate = asyncio.Event()
        await self.connect(old)
        request = await self.request("old-send")
        await self.connect(new)
        old.send_gate.set()
        with self.assertRaisesRegex(BridgeUnavailable, "superseded"):
            await request
        self.assertFalse(self.bridge._pending)
        current = await self.request("current")
        new.reply("ok")
        self.assertEqual(await current, "ok")

    async def test_current_disconnect_fails_its_requests_and_retires_the_client(self):
        client = Client()
        reader = await self.connect(client)
        first = await self.request("first")
        second = await self.request("second")
        client.queue.put_nowait(None)
        await reader
        for request in (first, second):
            with self.assertRaisesRegex(BridgeUnavailable, "connection lost"):
                await request
        self.assertIsNone(self.bridge._client)
        self.assertFalse(self.bridge._pending)

    async def test_shutdown_rejects_a_new_connection_without_claiming_it(self):
        self.bridge._closing = True
        client = Client()
        await self.bridge._on_connection(client)
        self.assertIsNone(self.bridge._client)
        self.assertEqual(len(client.closes), 1)
        self.assertEqual(client.messages, [])

    async def test_legacy_handshake_accepts_configured_path_and_returns_http_tuple_for_other_path(self):
        self.assertIsNone(await self.bridge._process_request("/test-bridge", {}))
        self.assertEqual(await self.bridge._process_request("/other", {}), (HTTPStatus.NOT_FOUND, [], b"not found\n"))

    async def test_modern_handshake_uses_explicit_request_and_connection_response(self):
        marker = object()
        calls = []
        connection = SimpleNamespace(request=SimpleNamespace(path="/old"), respond=lambda status, text: calls.append((status, text)) or marker)
        self.assertIsNone(await self.bridge._process_request(connection, SimpleNamespace(path="/test-bridge")))
        self.assertIs(await self.bridge._process_request(connection, SimpleNamespace(path="/other")), marker)
        self.assertEqual(calls, [(HTTPStatus.NOT_FOUND, "not found\n")])

    async def test_installed_websockets_handshake_response_is_valid_without_opening_socket(self):
        try:
            from websockets.asyncio.server import ServerConnection
            from websockets.http11 import Response
            from websockets.server import ServerProtocol
        except ImportError:
            from websockets.datastructures import Headers
            from websockets.legacy.server import WebSocketServerProtocol
            protocol = SimpleNamespace(_process_request=self.bridge._process_request)
            response = await WebSocketServerProtocol.process_request(protocol, "/other", Headers())
            self.assertEqual(response, (HTTPStatus.NOT_FOUND, [], b"not found\n"))
            self.assertIsNone(await WebSocketServerProtocol.process_request(protocol, "/test-bridge", Headers()))
            return
        connection = SimpleNamespace(protocol=ServerProtocol(), request=SimpleNamespace(path="/other"))
        connection.respond = lambda status, text: ServerConnection.respond(connection, status, text)
        response = await self.bridge._process_request(connection, connection.request)
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.body, b"not found\n")
        self.assertIn(b"404 Not Found", response.serialize())


if __name__ == "__main__":
    unittest.main()
