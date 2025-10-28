import v86 from 'v86/build/libv86.mjs'
import v86WasmUrl from 'v86/build/v86.wasm?url'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

let emulator = new v86({
    wasm_path: v86WasmUrl,
    // Ideally these assets would be hashed but not processed,
    // but vite really wants to try to process the kernel image
    // and runs out of memory.
    bios: { url: import.meta.env.BASE_URL + 'bios/seabios.bin' },
    // Kernel image has everything built into its embedded initrd
    // (no disk images required, all in RAM)
    bzimage: { url: import.meta.env.BASE_URL + 'kernel/bzImage' },
    cmdline: "console=tty0 console=ttyS0,115200",
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
