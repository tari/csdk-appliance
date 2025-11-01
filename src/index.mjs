import v86 from 'v86/build/libv86.mjs'
import v86WasmUrl from 'v86/build/v86.wasm?url'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

// These *must* be marked as assets for vite because we want a URL.
import biosImageUrl from './machine/seabios.bin'
import kernelImageUrl from './machine/bzImage.bin'
import rootfsImageUrl from './machine/rootfs.bin'

let emulator = new v86({
    wasm_path: v86WasmUrl,
    bios: { url: biosImageUrl },
    bzimage: { url: kernelImageUrl },
    // async: true for the root disk gives faster VM boot, but costs a lot of
    // latency when starting our (large) clang/llvm-link binaries in order to
    // load them. It's better for compilation time to front-load the entire
    // disk image in a single request rather than hundreds of small ones.
    hda: { url: rootfsImageUrl },
    cmdline: "console=tty0 console=ttyS0,115200 root=/dev/sda",
    memory_size: 128 << 20,
    //serial_container_xtermjs: document.getElementById('terminal'),
    // VGA isn't being used, can have small memory
    vga_memory_size: 1 << 20,
    // Using serial terminal, don't need other I/O
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
    net_device: {
        type: 'virtio',
        relay_url: 'inbrowser',
    },
    preserve_mac_from_state_image: true,
    autostart: true,
});

const terminal = new Terminal();
terminal.open(document.getElementById('terminal'));
terminal.onData((data) => {
    emulator.serial0_send(data);
});

emulator.add_listener("serial0-output-byte", (byte) => {
    terminal.write(Uint8Array.of(byte));
});
