"""WebSocket transport between the MCP server and the Cocos extension.

The direction is now reversed compared to v0.1:

    v0.1: Cocos extension was the WS *server*; Python dialed in as a client.
    v0.2: Python is the WS *server*; the Cocos extension dials in from its
          panel "Connect" button.

This makes the editor side a one-file/one-button setup — no listening port
to free up, no auto-start dance. Trade-off: the Python MCP server has to
host its WS server on a fixed port (default 6020) which is the URL the user
types into the Cocos panel.

Implementation note
-------------------
FastMCP owns the main asyncio loop (it runs `mcp.run(transport='stdio')`).
We don't want to fight it for control, so we run the websockets server on
a daemon thread with its own loop. `bridge.call()` (invoked from FastMCP's
loop) forwards onto that loop via `asyncio.run_coroutine_threadsafe`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import uuid
from http import HTTPStatus
from typing import Any, Optional

import websockets

from core.config import config

logger = logging.getLogger("cocos-mcp.bridge")


class BridgeError(Exception):
    """The extension responded with a structured error."""


class BridgeUnavailable(Exception):
    """No extension is connected, or the socket dropped mid-call."""


class CocosBridge:
    """WS server that waits for the Cocos extension to dial in.

    Only one extension client is supported at a time; a new connection
    replaces the old one. The protocol is the same JSON envelope used in
    v0.1 — only the connection direction changed.
    """

    def __init__(self, host: str, port: int, path: Optional[str] = None) -> None:
        self._host = host
        self._port = port
        self._path = path or config.bridge_path
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_ready = threading.Event()
        self._loop_error: Optional[BaseException] = None
        self._server: Optional[websockets.Server] = None
        self._client = None  # the connected websocket (lives on self._loop)
        self._closing = False
        self._close_lock = threading.Lock()
        self._close_future = None
        self._pending: dict[str, tuple[Any, asyncio.Future]] = {}

    # ------------------------------------------------------------------ #
    # Lifecycle (called from FastMCP's main thread)
    # ------------------------------------------------------------------ #

    @property
    def url(self) -> str:
        return f"ws://{self._host}:{self._port}{self._path}"

    def start_in_thread(self, ready_timeout: float = 5.0) -> None:
        """Spawn the daemon thread that hosts the WS server. Blocks briefly
        until the server is listening (or the start attempt failed)."""
        t = threading.Thread(
            target=self._thread_main,
            name="cocos-bridge",
            daemon=True,
        )
        t.start()
        if not self._loop_ready.wait(timeout=ready_timeout):
            raise RuntimeError(
                f"cocos bridge thread did not become ready within {ready_timeout}s"
            )
        if self._loop_error is not None:
            raise self._loop_error

    def _thread_main(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        try:
            self._server = loop.run_until_complete(self._serve())
            logger.info("cocos bridge listening on %s", self.url)
        except Exception as exc:  # pragma: no cover - reported via _loop_error
            self._loop_error = exc
            logger.exception("failed to start cocos bridge")
            self._loop_ready.set()
            return
        self._loop_ready.set()
        try:
            loop.run_forever()
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            loop.close()

    async def _serve(self):
        # websockets>=13 changed the handler signature; both shapes pass `ws`
        # as the first positional, so this works on both.
        return await websockets.serve(
            self._on_connection,
            self._host,
            self._port,
            max_size=16 * 1024 * 1024,
            process_request=self._process_request,
        )

    async def _process_request(self, *args, **kwargs):
        # Legacy asyncio accepts (path, headers) and an HTTP tuple; the modern
        # API accepts (connection, request) and requires its Response object.
        path = None
        connection = None
        if args:
            first = args[0]
            if isinstance(first, str):
                path = first
            else:
                connection = first
                req = args[1] if len(args) > 1 else getattr(first, "request", None)
                if req is not None:
                    path = getattr(req, "path", None)
        if path is not None and path != self._path:
            if connection is not None and callable(getattr(connection, "respond", None)):
                return connection.respond(HTTPStatus.NOT_FOUND, "not found\n")
            return (HTTPStatus.NOT_FOUND, [], b"not found\n")
        return None

    # ------------------------------------------------------------------ #
    # Connection handling (runs on self._loop)
    # ------------------------------------------------------------------ #

    async def _on_connection(self, ws, *_unused):
        if self._closing:
            await ws.close(code=1001, reason="server shutting down")
            return
        old = self._client
        # Claim the connection before awaiting old.close(): a third connection
        # arriving during that await must remain the newest owner.
        self._client = ws
        if old is not None:
            self._fail_pending(old, "bridge connection superseded")
        try:
            if old is not None:
                try:
                    await old.close(code=1001, reason="superseded")
                except Exception:
                    pass
            if self._client is not ws:
                return
            logger.info("cocos extension connected")
            try:
                await ws.send(json.dumps({
                    "type": "hello",
                    "server": "cocos-mcp-py",
                    "version": 2,
                }))
            except Exception:
                pass
            if self._client is not ws:
                return
            async for raw in ws:
                if self._client is not ws:
                    break
                try:
                    frame = json.loads(raw)
                except Exception:
                    logger.debug("non-JSON frame from extension: %r", raw[:200])
                    continue
                if not isinstance(frame, dict):
                    continue
                if frame.get("type") == "hello":
                    continue
                rid = frame.get("id")
                if not rid:
                    continue
                pending = self._pending.get(rid)
                if pending is not None and pending[0] is ws:
                    self._pending.pop(rid)
                    if not pending[1].done():
                        pending[1].set_result(frame)
        except websockets.ConnectionClosed:
            pass
        except Exception:
            logger.exception("cocos bridge reader crashed")
        finally:
            logger.info("cocos extension disconnected")
            if self._client is ws:
                self._client = None
            self._fail_pending(ws, "bridge connection lost")

    def _fail_pending(self, ws, message: str) -> None:
        for rid, (owner, future) in list(self._pending.items()):
            if owner is ws:
                self._pending.pop(rid)
                if not future.done():
                    future.set_exception(BridgeUnavailable(message))

    # ------------------------------------------------------------------ #
    # Public API (invoked from FastMCP's loop, NOT self._loop)
    # ------------------------------------------------------------------ #

    async def call(self, command: str, params: Optional[dict] = None,
                   timeout: Optional[float] = None) -> Any:
        if self._closing:
            raise BridgeUnavailable("bridge server shutting down")
        if self._loop is None:
            raise BridgeUnavailable("cocos bridge thread not started")
        coro = self._call_impl(command, params, timeout)
        cf = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return await asyncio.wrap_future(cf)

    async def _call_impl(self, command: str, params: Optional[dict],
                         timeout: Optional[float]) -> Any:
        if self._closing:
            raise BridgeUnavailable("bridge server shutting down")
        ws = self._client
        if ws is None:
            raise BridgeUnavailable(
                f"Cocos extension is not connected. Open the Cocos MCP panel "
                f"in Cocos Creator and click Connect (URL: {self.url})."
            )
        rid = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        pending = (ws, fut)
        self._pending[rid] = pending
        frame = {"id": rid, "command": command, "params": params or {}}
        try:
            try:
                await ws.send(json.dumps(frame))
            except websockets.ConnectionClosed as exc:
                raise BridgeUnavailable(f"send failed: {exc}") from exc
            if self._client is not ws:
                raise BridgeUnavailable("bridge connection superseded while sending")
            try:
                reply = await asyncio.wait_for(fut, timeout=timeout or config.request_timeout)
            except asyncio.TimeoutError as exc:
                raise BridgeUnavailable(
                    f"timeout waiting for reply to '{command}' after "
                    f"{timeout or config.request_timeout}s"
                ) from exc
        finally:
            if self._pending.get(rid) is pending:
                self._pending.pop(rid)
            if not fut.done():
                fut.cancel()
            elif not fut.cancelled():
                # Replacement may fail the future while send() is still
                # suspended. Consume that failure even if send itself raises.
                fut.exception()
        if not isinstance(reply, dict):
            raise BridgeError(f"non-object reply from extension: {reply!r}")
        if reply.get("success"):
            return reply.get("data")
        message = reply.get("error") or "unknown error"
        raise BridgeError(f"{command}: {message}")

    async def close(self) -> None:
        # The shutdown request has one owner even if several callers close at
        # once. Awaiting it must not block FastMCP's event loop or let one
        # cancelled caller cancel cleanup for the others.
        loop = self._loop
        with self._close_lock:
            self._closing = True
            if self._close_future is None:
                if loop is None or loop.is_closed() or not loop.is_running():
                    return
                self._close_future = asyncio.run_coroutine_threadsafe(self._shutdown(), loop)
                # Stopping inside _shutdown prevents run_coroutine_threadsafe
                # from delivering its result. Stop only after delivery instead.
                def stop_after_completion(_future):
                    if not loop.is_closed():
                        loop.call_soon_threadsafe(loop.stop)
                self._close_future.add_done_callback(stop_after_completion)
            future = self._close_future
        try:
            await asyncio.wait_for(asyncio.shield(asyncio.wrap_future(future)), timeout=5)
        except asyncio.TimeoutError:
            logger.warning("bridge shutdown is still pending")
        except Exception:
            logger.exception("bridge shutdown failed")

    async def _shutdown(self) -> None:
        ws = self._client
        self._client = None
        if ws is not None:
            self._fail_pending(ws, "bridge server shutting down")
            try:
                await ws.close()
            except Exception:
                pass
        if self._server is not None:
            self._server.close()
            try:
                await self._server.wait_closed()
            except Exception:
                pass
            self._server = None


_global_bridge: Optional[CocosBridge] = None


def set_global_bridge(b: CocosBridge) -> None:
    global _global_bridge
    _global_bridge = b


def get_bridge() -> CocosBridge:
    if _global_bridge is None:
        raise BridgeUnavailable(
            "cocos bridge has not been initialized — main.py forgot to "
            "call set_global_bridge()."
        )
    return _global_bridge
