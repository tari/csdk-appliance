import contextlib
import datetime as dt
import io
from pathlib import Path
import socket
import tempfile
import time
import threading
import unittest
from unittest import mock

import buildserver

MAKEFILE = """
.PHONY: hello

hello:
\t@echo "Hello, world!"
\t@echo "Hello from stderr" >&2

hang:
\t@echo "Too eepy to build.."
\t@sleep 1m
\t@echo "Huh? Where was I?"
"""


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (self.tmpdir / "Makefile").write_text(MAKEFILE)

    def testRunBuild(self):
        server = mock.create_autospec(buildserver.BuildServer)

        build = buildserver.Build.start(server, self.tmpdir, ["hello"])
        build.join()

        self.assertIsNotNone(build.process.poll(), "Subprocess should have exited")
        build.thread.join(timeout=10)

        server.write_packet.assert_has_calls(
            [
                mock.call(buildserver.PacketKind.RUNNING, b"Hello, world!\n"),
                mock.call(buildserver.PacketKind.RUNNING, b"Hello from stderr\n"),
            ]
        )
        server.build_completed.assert_called_once_with(build)

    def testCancelBuild(self):
        server = mock.create_autospec(buildserver.BuildServer)

        build = buildserver.Build.start(server, self.tmpdir, ["hang"])
        timeout = dt.datetime.now() + dt.timedelta(seconds=10)
        while dt.datetime.now() < timeout:
            if server.write_packet.mock_calls and server.write_packet.mock_calls[
                -1
            ] == mock.call(buildserver.PacketKind.RUNNING, b"Too eepy to build..\n"):
                break
            time.sleep(0.1)
        else:
            raise AssertionError(
                f"Didn't see initial message from builder: calls are {server.write_packet.mock_calls}"
            )

        build.stop()
        build.join()
        build.thread.join(timeout=10)
        server.build_completed.assert_called_once_with(build)


class ServerIOTest(unittest.TestCase):
    def testReadPacket(self):
        server = buildserver.BuildServer(
            io.BytesIO(bytes([1, 0, 0, 0, 2, 0x55, 0xAA])), None
        )
        self.assertEqual(
            server.read_packet(),
            buildserver.Packet(kind=1, payload=bytes([0x55, 0xAA])),
        )

    def testWritePacket(self):
        out = io.BytesIO()
        server = buildserver.BuildServer(out, None)
        server.write_packet(buildserver.PacketKind.RUNNING, b"test")

        self.assertEqual(out.getvalue(), bytes([0x81, 0, 0, 0, 4]) + b"test")


class ServerTest(unittest.TestCase):
    def setUp(self):
        client, server = socket.socketpair(type=socket.SOCK_STREAM)

        def socketfile(sock):
            f = sock.makefile("rwb")
            # file-like object is only remaining handle
            sock.close()
            # Close that object on test cleanup
            self.enterContext(f)
            return f

        self.server = buildserver.BuildServer(socketfile(server), mock.Mock(name='build_dir'))
        self.client = socketfile(client)

    def send(self, *data: bytes):
        for block in data:
            self.client.write(block)
        self.client.flush()

    @contextlib.contextmanager
    def runInThread(self, target=None):
        if target is None:
            target = self.server.do_rx

        thread = threading.Thread(target=target)
        thread.start()
        try:
            yield thread
        finally:
            thread.join(timeout=10)
            self.assertFalse(
                thread.is_alive(), "Thread did not terminate within 10 seconds"
            )

    def testLogsError(self):
        with self.assertLogs("buildserver") as logs, self.runInThread():
            self.send(bytes((0, 0, 0, 0, 3)), b"sup")

        [record] = logs.records
        self.assertEqual(record.message, "Received error packet from other end: b'sup'")

    def testStartCompile(self):
        self.assertIsNone(self.server.build)

        with mock.patch.object(
            buildserver, "Build", autospec=True
        ) as mock_build, self.runInThread():
            args = "Hello, world! 'quoted string'".encode("utf-8")
            self.send(b"\x01", len(args).to_bytes(4, "big"), args)

        mock_build.start.assert_called_once_with(
            self.server, self.server.build_dir, ["Hello,", "world!", "quoted string"]
        )
        self.assertIs(self.server.build, mock_build.start.return_value)
    
    def testCancelCompile(self):
        build = mock.create_autospec(buildserver.Build)
        self.server.build = build
        with self.runInThread():
            self.send(bytes((2, 0, 0, 0, 0)))
        
        build.stop.assert_called_once_with()
        self.assertIsNone(self.server.build)


if __name__ == "__main__":
    unittest.main()
