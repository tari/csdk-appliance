<script setup>
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import VMCompiler from './compiler.mjs'

defineEmits(['start-build'])

const terminal = useTemplateRef('serial-terminal')
const loadedBytes = ref(0)
const totalBytesToLoad = ref(undefined)
const loaded = ref(false)
const ready = ref(false)
const compiler = ref()

onMounted(async () => {
    compiler.value = await VMCompiler.create(terminal.value, (have, size) => {
        loadedBytes.value = have
        totalBytesToLoad.value = size
    })
    loaded.value = true
})

watch(compiler, async (newCompiler, oldCompiler) => {
    ready.value = false
    await newCompiler.ready
    ready.value = true
})

</script>

<template>
    <div v-if="!ready">
        Compiler is loading...
        <br>
        <progress :value="totalBytesToLoad === undefined || loadedBytes == totalBytesToLoad ? null : loadedBytes / totalBytesToLoad"></progress>
        <br>
        <template v-if="!loaded">
            <template v-if="totalBytesToLoad !== undefined">{{ loadedBytes }} of {{ totalBytesToLoad }}</template>
            <template v-else>{{ loadedBytes }}</template>
            bytes loaded
        </template>
        <template v-else>Booting VM</template>
    </div>
    <div v-else>
        <button @click="$emit('start-build')">Build</button>
    </div>
    <div v-show="loaded">
        <v-tabs v-model="tab">
            <v-tab value="terminal" text="Serial terminal"></v-tab>
            <v-tab value="output" text="Build output"></v-tab>
        </v-tabs>
        <v-tabs-window v-model="tab">
            <v-tabs-window-item value="terminal">

            </v-tabs-window-item>
            <v-tabs-window-item value="output">
                build output goes here
            </v-tabs-window-item>
        </v-tabs-window>
    </div>
    <!--
    <details v-show="loaded">
        <summary>Serial terminal</summary>
        <div ref="serial-terminal"></div>
    </details>
-->
</template>