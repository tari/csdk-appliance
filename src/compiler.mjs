import v86 from 'v86/build/libv86.mjs'
import v86WasmUrl from 'v86/build/v86.wasm?url'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

// These *must* be marked as assets for vite because we want a URL.
import biosImageUrl from './machine/seabios.bin'
import kernelImageUrl from './machine/bzImage.bin'
import rootfsImageUrl from './machine/rootfs.bin'

async function fetchWithProgress(url, progress_cb) {
    // TODO: consider being explicit about "really cache this"
    const response = await fetch(url)

    const length = Number.parseInt(response.headers.get('Content-Length'))
    const body = new Uint8Array(length)
    let i = 0
    // Read body bytes with progress
    const reader = response.body.getReader()
    while (true) {
        const {value: chunk, done} = await reader.read()
        if (done) {
            break
        }
        progress_cb(i + chunk.length, length)
        for (let n = 0; n < chunk.length; n++) {
            body[i++] = chunk[n]
        }
    }

    return body
}

async function fetchInParallel(urls, progress_cb) {
    const reportProgress = () => {
        let totalSize = null
        let totalHave = 0
        for (const [have, size] of status) {
            totalHave += have
            if (totalSize === null || size === undefined) {
                totalSize = size
            } else if (totalSize !== undefined) {
                totalSize += size
            }
        }
        progress_cb(totalHave, totalSize)
    }

    const status = []
    let promises = []
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i]
        status[i] = [0, undefined]
        promises[i] = fetchWithProgress(url, (have, size) => {
            status[i] = [have, size]
            reportProgress()
        })
    }

    const results = await Promise.all(promises)
    const out = {}
    for (let i = 0; i < results.length; i++) {
        out[urls[i]] = results[i]
    }
    return results
}

class CECompiler {
    emulator;
    /** A promise that resolves when the build VM is loaded and ready to boot. */
    booting;
    /** A promise that resolves when the build server reports it's ready. */
    ready;
    #terminal;
    #buildsInProgress;

    static async create(terminal_container, startup_progress_callback) {
        // v86 isn't guaranteed to fetch resources in parallel and by experiment
        // it's much faster to run a build after loading the entire rootfs rather
        // than demand-loading pieces (async: true). So load the images ourselves
        // and use the opportunity to provide fine-grained progress reporting.
        const resources = [biosImageUrl, kernelImageUrl, rootfsImageUrl]
        const [biosImage, kernelImage, rootfsImage] = await fetchInParallel(resources, startup_progress_callback)

        return new CECompiler({bios: biosImage, bzimage: kernelImage, hda: rootfsImage}, terminal_container);
    }

    constructor(blobs, terminal_container) {
        this.#buildsInProgress = 0;

        // TODO fetch images ourselves
        // buffer_from_object() accepts a typed array, just don't set url on the file (hda: <typed array>)
        const emulator = this.emulator = new v86({
            wasm_path: v86WasmUrl,
            ...blobs,
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
            // Need to hook up I/O before starting
            autostart: false,
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

        // Wait for the VMM to be ready, then boot the VM
        this.booting = new Promise((resolve, reject) => {
            const onLoaded = () => {
                console.log("VMM loaded; booting VM");
                this.emulator.remove_listener("emulator-loaded", onLoaded);
                this.emulator.run();

                resolve();
            };
            this.emulator.add_listener("emulator-loaded", onLoaded);
        });

        // Listen for the build server to report readiness
        this.ready = this.booting.then((ignored) => {
            const data = [];
            const readyPacket = [0x83, 0, 0, 0, 0];
            return new Promise((resolve, reject) => {
                const handleByte = (byte) => {
                    data.push(byte);
                    if (data.length === readyPacket.length) {
                        if (data.every((x, i) => x === readyPacket[i])) {
                            console.log("VM is ready; stopping emulation until needed")
                            this.emulator.stop();
                            resolve(null);
                        } else {
                            reject("Unexpected data received from uart1: " + data);
                        } 
                        this.emulator.remove_listener("serial1-output-byte", handleByte);
                    }
                };
                this.emulator.add_listener("serial1-output-byte", handleByte);
            });
        });
    }

    #mkdirs(path) {
        path = path.replace(/\/+$/g, '')
        if (!path) {
            // root of filesystem
            return 0;
        }
        const info = this.emulator.fs9p.SearchPath(path);
        if (info.id !== -1) {
            return info.id;
        }
        const parent = this.#mkdirs(dirpath(path));
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
     *  * progressCallback: a function called zero or more times with a string containing
     *                      ongoing output from the build process.
     *
     * Returns: a Uint8Array of compiled program contents.
     */
    async build(directory, makeOpts, progressCallback) {
        const BUILD_DIR = '/build';

        for (let filepath in directory) {
            const fileData = directory[filepath];
            filepath = filepath.replaceAll('//', '/');
            const filename = basename(filepath);
            if (filename === null) {
                continue;
            }

            const dirId = this.#mkdirs(BUILD_DIR + '/' + dirpath(filepath));
            await this.emulator.fs9p.CreateBinaryFile(filename, dirId, fileData);
        }

        await this.ready;
        // Resume the VM if it was paused
        this.#buildsInProgress += 1;
        this.emulator.run();

        let outputListener;
        const buildResult = new Promise((resolve, reject) => {
            let rxBytes = [];
            let pktLen = null;
            outputListener = (byte) => {
                rxBytes.push(byte);

                if (rxBytes.length == 5) {
                    pktLen = (rxBytes[1] << 24) | (rxBytes[2] << 16) | (rxBytes[3] << 8) | rxBytes[4];
                }
                if (pktLen !== null && rxBytes.length == (pktLen + 5)) {
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
                            progressCallback(text);
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

        // Pause the VM again if it's not needed
        this.#buildsInProgress -= 1;
        if (this.#buildsInProgress === 0) {
            this.emulator.stop();
        }

        // TODO return something
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

export default CECompiler;