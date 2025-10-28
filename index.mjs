import V86 from './libv86.mjs'

let emulator = new V86({
    wasm_path: './v86.wasm',
    bios: { url: './seabios.bin' },
    vga_bios: { url: './vgabios.bin' },
    bzimage: { url: './build/images/bzImage' },
    cmdline: "console=ttyS0,9600 console=tty0 ignore_loglevel, root=/dev/sda",
    hda: {
        url: "./build/images/rootfs.squashfs",
    },
    cdrom: {
        url: "./build/images/rootfs.iso9660",
    },
    memory_size: 128 << 20,
    vga_memory_size: 8 << 20,
    screen_container: document.getElementById('screen_container'),
    autostart: true,
});

const serialOutput = document.getElementById('serial-console');
emulator.add_listener("serial0-output-byte", function(byte) {
    var char = String.fromCharCode(byte);
    if (char === '\r') {
        return;
    }
    serialOutput.value += char;
});
