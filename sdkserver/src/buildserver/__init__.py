#!/usr/bin/env python
import argparse
from collections.abc import Sequence
import dataclasses
from dataclasses import dataclass
from enum import IntEnum
import io
import logging
from pathlib import Path
import shlex
import shutil
import struct
import subprocess
import threading


logger = logging.getLogger(__name__)


@dataclass
class Build:
    fs_dir: Path
    server: "BuildServer"
    process: subprocess.Popen
    thread: threading.Thread | None = None

    _MAKE = shutil.which("make")

    def _thread_main(self):
        while line := self.process.stdout.readline():
            self.server.write_packet(PacketKind.RUNNING, line.encode("utf-8"))

        self.process.wait()
        logger.info("Build completed; notifying server")
        self.server.build_completed(self)

    @classmethod
    def start(cls, server, fs_dir, args: Sequence[str]) -> "Build":
        process = subprocess.Popen(
            [cls._MAKE, "-C", fs_dir] + list(args),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        build = Build(fs_dir, server, process)
        build.thread = threading.Thread(target=build._thread_main, daemon=True)
        build.thread.start()
        return build

    def stop(self):
        self.process.terminate()

    def join(self) -> int:
        self.process.wait()
        return self.process.returncode


class PacketKind(IntEnum):
    ERROR = 0
    COMPILE = 1
    CANCEL = 2
    STARTED = 0x80
    RUNNING = 0x81
    COMPLETE = 0x82


PacketHeader = struct.Struct("!BI")


@dataclass
class Packet:
    kind: PacketKind
    payload: bytes


def read_exactly(reader: io.RawIOBase, n: int) -> bytes:
    buffer = bytearray(n)
    view = memoryview(buffer)
    i = 0
    while i < len(buffer):
        n = reader.readinto(view[i:])
        if n == 0:
            raise Exception("Input stream closed unexpectedly")
        i += n

    return bytes(buffer)


def write_all(writer: io.RawIOBase, data: bytes):
    while data:
        n = writer.write(data)
        data = data[n:]
    writer.flush()


@dataclass(eq=False)
class BuildServer:
    comms: io.RawIOBase
    build_dir: Path
    tx_lock: threading.RLock = dataclasses.field(
        init=False, repr=False, default_factory=threading.RLock
    )
    build: Build | None = None
    exit_requested: bool = False

    def read_packet(self) -> Packet:
        data = read_exactly(self.comms, PacketHeader.size)
        (kind, size) = PacketHeader.unpack(data)
        if size > 0:
            payload = read_exactly(self.comms, size)
        else:
            payload = bytes()

        return Packet(kind, payload)

    def write_packet(self, kind: PacketKind, payload: bytes | None):
        if payload is None:
            payload = bytes()
        header = PacketHeader.pack(kind, len(payload))

        with self.tx_lock:
            write_all(self.comms, header)
            if payload:
                write_all(self.comms, payload)

    def run(self):
        while not self.exit_requested:
            self.do_rx()

    def do_rx(self):
        packet = self.read_packet()
        logger.info("Received packet %s of %d bytes", packet.kind, len(packet.payload))

        match packet.kind:
            case PacketKind.ERROR:
                logger.error("Received error packet from other end: %s", packet.payload)

            case PacketKind.COMPILE:
                if self.build is not None:
                    self.write_packet(PacketKind.ERROR, b"Build already in progress")
                    return

                args = shlex.split(packet.payload.decode("utf-8", errors="replace"))
                logger.info("Starting build in %s with args %s", self.build_dir, args)
                self.build = Build.start(
                    self,
                    self.build_dir,
                    args
                )

            case PacketKind.CANCEL:
                if self.build is None:
                    self.write_packet(PacketKind.ERROR, b"No build in progress")
                    return

                logger.info("Cancelling running build")
                self.build.stop()
                self.build = None

            case other:
                logger.error("Unrecognized packet kind %s", packet.kind)
                self.write_packet(
                    PacketKind.ERROR,
                    f"Unrecognized packet type: {other}".encode("utf-8"),
                )

    def build_completed(self, build: Build):
        assert build is self.build, "Unknown build flagged its completion"

        status = build.join()
        self.write_packet(PacketKind.COMPLETE, status.to_bytes(length=4, signed=True))
        self.build = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('socket_path')
    parser.add_argument('build_dir')
    parser.add_argument('-l', '--logfile')
    args = parser.parse_args()

    if args.logfile is not None:
        logging.basicConfig(filename=args.logfile)

    with open(args.socket_path, 'r+b') as comms:
        server = BuildServer(comms, args.build_dir)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        thread.join()


if __name__ == '__main__':
    main()
