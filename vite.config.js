import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
    assetsInclude: [
        '**/*.bin',
    ],
    plugins: [
        vue(),
        vuetify(),
    ],
    server: {
        watch: {
            ignored: [
                "buildroot/**",
                "build/**",
            ]
        }
    }
});
