import v86 from 'v86/build/libv86.mjs'
import v86WasmUrl from 'v86/build/v86.wasm?url'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

// These *must* be marked as assets for vite because we want a URL.
import biosImageUrl from './machine/seabios.bin'
import kernelImageUrl from './machine/bzImage.bin'
import rootfsImageUrl from './machine/rootfs.bin'

class CECompiler {
    emulator;
    #terminal;

    constructor(terminal_container) {
        const emulator = this.emulator = new v86({
            wasm_path: v86WasmUrl,
            bios: { url: biosImageUrl },
            bzimage: { url: kernelImageUrl },
            // async: true for the root disk gives faster VM boot, but costs a lot of
            // latency when starting our (large) clang/llvm-link binaries in order to
            // load them. It's better for compilation time to front-load the entire
            // disk image in a single request rather than hundreds of small ones.
            hda: { url: rootfsImageUrl },
            // 9pfs, initially empty
            filesystem: {},
            // Another serial port where we communicate with a shell (stty raw!)
            // https://github.com/copy/v86/issues/530
            uart1: true,
            cmdline: "console=tty0 console=ttyS0,115200 root=/dev/sda",
            memory_size: 128 << 20,
            // VGA isn't being used, can have small memory
            vga_memory_size: 1 << 20,
            // Using serial terminal, don't need other I/O
            disable_keyboard: true,
            disable_mouse: true,
            disable_speaker: true,
            autostart: true,
        });

        this.#terminal = null;
        if (terminal_container) {
            const terminal = this.#terminal = new Terminal();
            terminal.open(terminal_container);
            terminal.onData((data) => {
                emulator.serial0_send(data);
            });

            this.emulator.add_listener("serial0-output-byte", (byte) => {
                terminal.write(Uint8Array.of(byte));
            });
        }
    }

    #mkdirs(path) {
        path = path.replace(/\/+$/g, '')
        console.log("#mkdirs(%s)", path);
        if (!path) {
            console.log("is root");
            // root of filesystem
            return 0;
        }
        const info = this.emulator.fs9p.SearchPath(path);
        if (info.id !== -1) {
            console.log("already exists with id %d", info.id);
            return info.id;
        }
        const parent = this.#mkdirs(dirpath(path));
        console.log("CreateDirectory(%s, %d)", basename(path), parent);
        return this.emulator.fs9p.CreateDirectory(basename(path), parent);
    }

    sendPacket(type, payload) {
        const send = (byte) => this.emulator.bus.send("serial1-input", byte);
        
        send(type);
        const len = payload.length;
        send((len >> 24) & 0xff);
        send((len >> 16) & 0xff);
        send((len >> 8) & 0xff);
        send(len & 0xff);

        for (const byte of payload) {
            send(byte);
        }
    }

    /**
     * Run `make` in a directory containing the provided files.
     *
     * Args:
     *  * directory: an object mapping file paths to their contents (as Uint8Array).
     *  * makeOpts: extra options passed to make, interpreted by the shell.
     *
     * Returns: a Uint8Array of compiled program contents.
     */
    async build(directory, makeOpts) {
        const BUILD_DIR = '/build';

        for (let filepath in directory) {
            const fileData = directory[filepath];
            filepath = filepath.replaceAll('//', '/');
            const filename = basename(filepath);
            console.log("build: file %s", filepath);
            if (filename === null) {
                continue;
            }

            const dirId = this.#mkdirs(BUILD_DIR + '/' + dirpath(filepath));
            console.log("build: created dir %d", dirId);
            console.log("CreateBinaryFile(%s, %d, %s)", filename, dirId, fileData);
            await this.emulator.fs9p.CreateBinaryFile(filename, dirId, fileData);
        }

        let outputListener;
        const buildResult = new Promise((resolve, reject) => {
            let rxBytes = [];
            let pktLen = null;
            outputListener = (byte) => {
                console.log("Raw serial byte rx: %d", byte);
                rxBytes.push(byte);

                if (rxBytes.length == 5) {
                    pktLen = (rxBytes[1] << 24) | (rxBytes[2] << 16) | (rxBytes[3] << 8) | rxBytes[4];
                } else if (pktLen !== null && rxBytes.length == (pktLen + 5)) {
                    // Got a full packet
                    const kind = rxBytes[0];
                    const payload = rxBytes.slice(5);
                    rxBytes = [];
                    pktLen = null;

                    switch (kind) {
                        case 0:     // ERROR
                            console.log("Received ERROR: %s", payload);
                            break;
                        case 0x80:  // STARTED
                            console.log("Received STARTED");
                            break;
                        case 0x81:  // RUNNING
                            const text = new TextDecoder().decode(new Uint8Array(payload));
                            console.log("Received RUNNING: %s", text);
                            break;
                        case 0x82:  // COMPLETE
                            const status = (payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3];
                            console.log("Received COMPLETE with status %d", status);
                            resolve(status);
                            break;
                        default:
                            console.log("Received packet with unknown type: %d", type);
                            break;
                    }
                }
            };
            this.emulator.add_listener("serial1-output-byte", outputListener);
        });

        this.sendPacket(1, []);
        await buildResult;
        this.emulator.remove_listener("serial1-output-byte", outputListener);

        // make -C /9pfs/build $(MAKEOPTS)
        // bin/*.8xp?

        // Line-based command/response:
        // commands:
        //  > BUILD id make_opts (id is a directory name)
        //  < STARTED id
        //  < OUTPUT id text
        //  < COMPLETE id status_code
        //  > CANCEL id

        //this.emulator.fs9p.RecursiveDelete(BUILD_DIR);
    }
}

function basename(path) {
    if (!path) {
        return null;
    }
    let idx = path.lastIndexOf('/');
    if (idx === -1) {
        return path;
    }
    const out = path.slice(idx + 1);
    if (out) {
        return out;
    } else {
        return null;
    }
}

function dirpath(path) {
    let idx = path.lastIndexOf('/');
    if (idx === -1) {
        return '';
    }
    while (path[idx - 1] === '/') {
        idx -= 1;
    }
    return path.slice(0, idx);
}

window.CECompiler = new CECompiler(document.getElementById('terminal'));
console.log('CECompiler instantiation complete')
