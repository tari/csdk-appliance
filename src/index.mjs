import v86 from 'v86/build/libv86.mjs'
import v86WasmUrl from 'v86/build/v86.wasm?url'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

// These *must* be marked as assets for vite because we want a URL.
import biosImageUrl from './machine/seabios.bin'
import kernelImageUrl from './machine/bzImage.bin'
import rootfsImageUrl from './machine/rootfs.bin'

class CECompiler {
    #emulator;
    #terminal;

    constructor(terminal_container) {
        const emulator = this.#emulator = new v86({
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

            this.#emulator.add_listener("serial0-output-byte", (byte) => {
                terminal.write(Uint8Array.of(byte));
            });
        }
    }

    #mkdirs(path) {
        if (!path) {
            // root of filesystem
            return -1;
        }
        this.#emulator.fs9p
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
    build(directory, makeOpts) {
        const BUILD_DIR = 'build';
        const buildDirId = this.#mkdirs(BUILD_DIR);

        for (let filepath in directory) {
            const fileData = directory[filepath];
            filepath = filepath.replaceAll(/\/+/, '/');
            const filename = basename(filepath);
            if (filename === null) {
                continue;
            }

            const dirId = this.#mkdirs(BUILD_DIR + '/' + dirpath(filepath));
            this.#emulator.fs9p.CreateBinaryFile(filename, dirId, fileData);
        }

        // make -C /9pfs/build $(MAKEOPTS)
        // bin/*.8xp?

        // Line-based command/response:
        // commands:
        //  > BUILD id make_opts (id is a directory name)
        //  < STARTED id
        //  < OUTPUT id text
        //  < COMPLETE id status_code
        //  > CANCEL id

        this.#emulator.fs9p.RecursiveDelete(BUILD_DIR);
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
        return null;
    }
    while (path[idx - 1] === '/') {
        idx -= 1;
    }
    return path.slice(0, idx);
}

window.CECompiler = new CECompiler(document.getElementById('terminal'));
console.log('CECompiler instantiation complete')
