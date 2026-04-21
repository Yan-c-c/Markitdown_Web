/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from "vue";
import DOMPurify from "dompurify";
import JSZip from "jszip";
import MarkdownIt from "markdown-it";
const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
});
const workMode = ref("single");
const sourceMode = ref("file");
const viewMode = ref("preview");
const selectedFile = ref(null);
const selectedBatchFiles = ref([]);
const activeBatchItemId = ref("");
const sourceUrl = ref("");
const extensionHint = ref("");
const usePlugins = ref(false);
const keepDataUris = ref(false);
const loading = ref(false);
const advancedOpen = ref(false);
const status = ref("Waiting for a new input.");
const statusColor = ref("neutral");
const result = ref(null);
const batchResult = ref(null);
const modeItems = [
    { label: "Single", value: "single" },
    { label: "Batch", value: "batch" },
];
const sourceItems = [
    { label: "File", value: "file" },
    { label: "URL", value: "url" },
];
const viewItems = [
    { label: "Preview", value: "preview" },
    { label: "Markdown", value: "markdown" },
];
const activeBatchItem = computed(() => {
    if (!batchResult.value?.items.length) {
        return null;
    }
    const preferred = batchResult.value.items.find((item) => item.id === activeBatchItemId.value);
    return preferred || batchResult.value.items[0] || null;
});
const currentResult = computed(() => {
    return workMode.value === "batch" ? activeBatchItem.value : result.value;
});
const canConvert = computed(() => {
    if (workMode.value === "batch") {
        return selectedBatchFiles.value.length > 0;
    }
    return sourceMode.value === "file"
        ? !!selectedFile.value
        : sourceUrl.value.trim().length > 0;
});
const canUseCurrentMarkdown = computed(() => {
    if (!currentResult.value) {
        return false;
    }
    if (isBatchItem(currentResult.value)) {
        return currentResult.value.success && currentResult.value.markdown.length > 0;
    }
    return currentResult.value.markdown.length > 0;
});
const canDownloadBatchArchive = computed(() => {
    return !!batchResult.value && batchResult.value.successCount > 0;
});
const currentTitle = computed(() => {
    if (workMode.value === "batch") {
        return currentResult.value?.title || currentResult.value?.sourceName || "Batch Output";
    }
    return currentResult.value?.title || currentResult.value?.sourceName || "Markdown Output";
});
const statusLabel = computed(() => {
    if (loading.value) {
        return "Working";
    }
    if (statusColor.value === "success") {
        return "Done";
    }
    if (statusColor.value === "error") {
        return "Issue";
    }
    return "Ready";
});
const metaItems = computed(() => {
    if (workMode.value === "batch") {
        return [
            {
                label: "Files",
                value: batchResult.value ? `${batchResult.value.totalCount} files` : `${selectedBatchFiles.value.length} files`,
            },
            {
                label: "Success",
                value: batchResult.value ? String(batchResult.value.successCount) : "0",
            },
            {
                label: "Failed",
                value: batchResult.value ? String(batchResult.value.failureCount) : "0",
            },
            {
                label: "Total Time",
                value: batchResult.value ? `${batchResult.value.durationMs} ms` : "Not run",
            },
        ];
    }
    return [
        {
            label: "Source",
            value: result.value?.sourceName || (sourceMode.value === "file" ? "No file selected" : "No URL entered"),
        },
        {
            label: "Characters",
            value: result.value ? result.value.charCount.toLocaleString("en-US") : "0",
        },
        {
            label: "Lines",
            value: result.value ? result.value.lineCount.toLocaleString("en-US") : "0",
        },
        {
            label: "Duration",
            value: result.value ? `${result.value.durationMs} ms` : "Not run",
        },
    ];
});
const renderedMarkdown = computed(() => {
    if (!currentResult.value) {
        return DOMPurify.sanitize(workMode.value === "batch"
            ? `<div class="empty-state"><p class="empty-title">No batch results yet</p><p class="empty-copy">Upload multiple files and run a batch conversion to review each result here.</p></div>`
            : `<div class="empty-state"><p class="empty-title">No result yet</p><p class="empty-copy">Choose a file or enter a URL on the left, then start the conversion.</p></div>`);
    }
    if (isBatchItem(currentResult.value) && !currentResult.value.success) {
        return DOMPurify.sanitize(`<div class="empty-state"><p class="empty-title">This file failed to convert</p><p class="empty-copy">${escapeHtml(currentResult.value.error || "Unknown error")}</p></div>`);
    }
    return DOMPurify.sanitize(md.render(currentResult.value.markdown));
});
function isBatchItem(value) {
    return !!value && "success" in value;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function formatFileSize(bytes) {
    if (!bytes) {
        return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    const digits = unitIndex === 0 ? 0 : size >= 10 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
function getFileTag(name) {
    const extension = name.split(".").pop()?.trim();
    if (!extension || extension === name) {
        return "FILE";
    }
    return extension.slice(0, 6).toUpperCase();
}
function setStatus(message, color = "neutral") {
    status.value = message;
    statusColor.value = color;
}
function clearSelectedFile() {
    selectedFile.value = null;
}
function removeBatchFile(index) {
    selectedBatchFiles.value = selectedBatchFiles.value.filter((_, fileIndex) => fileIndex !== index);
}
function clearBatchFiles() {
    selectedBatchFiles.value = [];
}
function resetAll() {
    workMode.value = "single";
    sourceMode.value = "file";
    viewMode.value = "preview";
    selectedFile.value = null;
    selectedBatchFiles.value = [];
    activeBatchItemId.value = "";
    sourceUrl.value = "";
    extensionHint.value = "";
    usePlugins.value = false;
    keepDataUris.value = false;
    result.value = null;
    batchResult.value = null;
    advancedOpen.value = false;
    setStatus("Waiting for a new input.");
}
function buildMarkdownName(source) {
    const sourceName = source.title || source.sourceName || "document";
    const normalized = sourceName.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80);
    return normalized.endsWith(".md") ? normalized : `${normalized || "document"}.md`;
}
function triggerDownload(blob, filename) {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
}
async function runConvert() {
    if (workMode.value === "batch") {
        await runBatchConvert();
        return;
    }
    await runSingleConvert();
}
async function runSingleConvert() {
    if (!canConvert.value) {
        setStatus(sourceMode.value === "file" ? "Please choose a file." : "Please enter a URL to convert.", "error");
        return;
    }
    loading.value = true;
    setStatus("Converting. Please wait…", "primary");
    const formData = new FormData();
    formData.append("source_mode", sourceMode.value);
    formData.append("extension_hint", extensionHint.value.trim());
    formData.append("use_plugins", String(usePlugins.value));
    formData.append("keep_data_uris", String(keepDataUris.value));
    if (sourceMode.value === "file" && selectedFile.value) {
        formData.append("file", selectedFile.value);
    }
    else {
        formData.append("url", sourceUrl.value.trim());
    }
    try {
        const response = await fetch("/api/convert", {
            method: "POST",
            body: formData,
        });
        const payload = (await response.json());
        if (!response.ok) {
            throw new Error("detail" in payload ? payload.detail || "Conversion failed." : "Conversion failed.");
        }
        result.value = payload;
        batchResult.value = null;
        activeBatchItemId.value = "";
        setStatus("Conversion complete.", "success");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Conversion failed.";
        setStatus(message, "error");
    }
    finally {
        loading.value = false;
    }
}
async function runBatchConvert() {
    if (!selectedBatchFiles.value.length) {
        setStatus("Upload at least one file.", "error");
        return;
    }
    loading.value = true;
    setStatus(`Converting ${selectedBatchFiles.value.length} files…`, "primary");
    const formData = new FormData();
    formData.append("extension_hint", extensionHint.value.trim());
    formData.append("use_plugins", String(usePlugins.value));
    formData.append("keep_data_uris", String(keepDataUris.value));
    for (const file of selectedBatchFiles.value) {
        formData.append("files", file);
    }
    try {
        const response = await fetch("/api/convert/batch", {
            method: "POST",
            body: formData,
        });
        const payload = (await response.json());
        if (!response.ok) {
            throw new Error("detail" in payload ? payload.detail || "Batch conversion failed." : "Batch conversion failed.");
        }
        const batchPayload = payload;
        batchResult.value = batchPayload;
        result.value = null;
        activeBatchItemId.value =
            batchPayload.items.find((item) => item.success)?.id ||
                batchPayload.items[0]?.id ||
                "";
        if (batchPayload.failureCount === 0) {
            setStatus(`Batch conversion complete. ${batchPayload.successCount} files succeeded.`, "success");
        }
        else if (batchPayload.successCount === 0) {
            setStatus(`Batch conversion failed. ${batchPayload.failureCount} files returned errors.`, "error");
        }
        else {
            setStatus(`Batch conversion complete: ${batchPayload.successCount} succeeded, ${batchPayload.failureCount} failed.`, "primary");
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Batch conversion failed.";
        setStatus(message, "error");
    }
    finally {
        loading.value = false;
    }
}
async function copyMarkdown() {
    if (!canUseCurrentMarkdown.value || !currentResult.value) {
        return;
    }
    try {
        await navigator.clipboard.writeText(currentResult.value.markdown);
        setStatus("Markdown copied to the clipboard.", "success");
    }
    catch {
        setStatus("Copy failed.", "error");
    }
}
function downloadMarkdown() {
    if (!canUseCurrentMarkdown.value || !currentResult.value) {
        return;
    }
    const blob = new Blob([currentResult.value.markdown], {
        type: "text/markdown;charset=utf-8",
    });
    triggerDownload(blob, buildMarkdownName(currentResult.value));
    setStatus("Markdown file prepared for download.", "success");
}
async function downloadBatchArchive() {
    if (!batchResult.value || batchResult.value.successCount === 0) {
        return;
    }
    const zip = new JSZip();
    for (const item of batchResult.value.items) {
        if (!item.success || !item.markdown) {
            continue;
        }
        zip.file(buildMarkdownName(item), item.markdown);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `markitdown-batch-${timestamp}.zip`);
    setStatus("Batch Markdown archive prepared for download.", "success");
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "minimal-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "app-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-line" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "brand-dot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "brand-name" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-actions" },
});
const __VLS_0 = {}.UTabs;
/** @type {[typeof __VLS_components.UTabs, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.workMode),
    items: (__VLS_ctx.modeItems),
    content: (false),
    size: "sm",
    ...{ class: "mode-switch" },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.workMode),
    items: (__VLS_ctx.modeItems),
    content: (false),
    size: "sm",
    ...{ class: "mode-switch" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: (['status-pill', `status-pill--${__VLS_ctx.statusColor}`]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "status-pill-dot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.statusLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "app-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "hero-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workbench" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "control-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-intro" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "pane-label" },
});
(__VLS_ctx.workMode === "batch" ? "Batch Conversion" : "Single Conversion");
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.workMode === "batch" ? "Drop multiple files at once." : "Choose a file or paste a URL.");
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.workMode === "batch"
    ? "Review each result individually or download everything in one zip."
    : "Keep the required inputs visible and move everything else into advanced options.");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
if (__VLS_ctx.workMode === 'single') {
    const __VLS_4 = {}.UTabs;
    /** @type {[typeof __VLS_components.UTabs, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        modelValue: (__VLS_ctx.sourceMode),
        items: (__VLS_ctx.sourceItems),
        content: (false),
        size: "sm",
        ...{ class: "w-full" },
    }));
    const __VLS_6 = __VLS_5({
        modelValue: (__VLS_ctx.sourceMode),
        items: (__VLS_ctx.sourceItems),
        content: (false),
        size: "sm",
        ...{ class: "w-full" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    if (__VLS_ctx.sourceMode === 'file') {
        const __VLS_8 = {}.UFileUpload;
        /** @type {[typeof __VLS_components.UFileUpload, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            modelValue: (__VLS_ctx.selectedFile),
            multiple: (false),
            preview: (false),
            icon: "i-lucide-file-up",
            label: (__VLS_ctx.selectedFile ? 'Click to replace the file' : 'Drop a file here or click to browse'),
            description: (__VLS_ctx.selectedFile ? 'One file is currently attached and can be replaced directly.' : 'PDF, DOCX, PPTX, XLSX, HTML, CSV, EPUB'),
            variant: "area",
            layout: "grid",
            ...{ class: "drop-zone min-h-44 w-full" },
        }));
        const __VLS_10 = __VLS_9({
            modelValue: (__VLS_ctx.selectedFile),
            multiple: (false),
            preview: (false),
            icon: "i-lucide-file-up",
            label: (__VLS_ctx.selectedFile ? 'Click to replace the file' : 'Drop a file here or click to browse'),
            description: (__VLS_ctx.selectedFile ? 'One file is currently attached and can be replaced directly.' : 'PDF, DOCX, PPTX, XLSX, HTML, CSV, EPUB'),
            variant: "area",
            layout: "grid",
            ...{ class: "drop-zone min-h-44 w-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
    if (__VLS_ctx.sourceMode === 'file') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "selection-panel" },
        });
        if (__VLS_ctx.selectedFile) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-list" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ class: "file-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-item-badge" },
            });
            (__VLS_ctx.getFileTag(__VLS_ctx.selectedFile.name));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-item-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-item-name" },
            });
            (__VLS_ctx.selectedFile.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-item-meta" },
            });
            (__VLS_ctx.formatFileSize(__VLS_ctx.selectedFile.size));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.clearSelectedFile) },
                ...{ class: "file-item-remove" },
                type: "button",
                'aria-label': "Remove the current file",
            });
            const __VLS_12 = {}.UIcon;
            /** @type {[typeof __VLS_components.UIcon, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
                name: "i-lucide-x",
            }));
            const __VLS_14 = __VLS_13({
                name: "i-lucide-x",
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "helper-copy" },
            });
        }
    }
    else {
        const __VLS_16 = {}.UFormField;
        /** @type {[typeof __VLS_components.UFormField, typeof __VLS_components.UFormField, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            label: "URL",
        }));
        const __VLS_18 = __VLS_17({
            label: "URL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        const __VLS_20 = {}.UInput;
        /** @type {[typeof __VLS_components.UInput, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            modelValue: (__VLS_ctx.sourceUrl),
            icon: "i-lucide-link",
            placeholder: "https://example.com/article",
            size: "lg",
        }));
        const __VLS_22 = __VLS_21({
            modelValue: (__VLS_ctx.sourceUrl),
            icon: "i-lucide-link",
            placeholder: "https://example.com/article",
            size: "lg",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        var __VLS_19;
    }
}
else {
    const __VLS_24 = {}.UFileUpload;
    /** @type {[typeof __VLS_components.UFileUpload, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        modelValue: (__VLS_ctx.selectedBatchFiles),
        multiple: (true),
        preview: (false),
        icon: "i-lucide-files",
        label: (__VLS_ctx.selectedBatchFiles.length ? 'Drop more files or click to add more' : 'Drop multiple files here or click to browse'),
        description: (__VLS_ctx.selectedBatchFiles.length ? `${__VLS_ctx.selectedBatchFiles.length} files are queued for conversion.` : 'Each file will be converted separately and keep its own result.'),
        variant: "area",
        layout: "grid",
        ...{ class: "drop-zone min-h-52 w-full" },
    }));
    const __VLS_26 = __VLS_25({
        modelValue: (__VLS_ctx.selectedBatchFiles),
        multiple: (true),
        preview: (false),
        icon: "i-lucide-files",
        label: (__VLS_ctx.selectedBatchFiles.length ? 'Drop more files or click to add more' : 'Drop multiple files here or click to browse'),
        description: (__VLS_ctx.selectedBatchFiles.length ? `${__VLS_ctx.selectedBatchFiles.length} files are queued for conversion.` : 'Each file will be converted separately and keep its own result.'),
        variant: "area",
        layout: "grid",
        ...{ class: "drop-zone min-h-52 w-full" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "selection-panel" },
    });
    if (__VLS_ctx.selectedBatchFiles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "selection-summary" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "helper-copy" },
        });
        (__VLS_ctx.selectedBatchFiles.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearBatchFiles) },
            ...{ class: "selection-clear" },
            type: "button",
        });
    }
    if (__VLS_ctx.selectedBatchFiles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "file-list file-list--batch" },
        });
        for (const [file, index] of __VLS_getVForSourceType((__VLS_ctx.selectedBatchFiles))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (`${file.name}-${file.size}-${file.lastModified}-${index}`),
                ...{ class: "file-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-item-badge" },
            });
            (__VLS_ctx.getFileTag(file.name));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-item-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-item-name" },
            });
            (file.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-item-meta" },
            });
            (__VLS_ctx.formatFileSize(file.size));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.workMode === 'single'))
                            return;
                        if (!(__VLS_ctx.selectedBatchFiles.length))
                            return;
                        __VLS_ctx.removeBatchFile(index);
                    } },
                ...{ class: "file-item-remove" },
                type: "button",
                'aria-label': (`Remove file ${file.name}`),
            });
            const __VLS_28 = {}.UIcon;
            /** @type {[typeof __VLS_components.UIcon, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                name: "i-lucide-x",
            }));
            const __VLS_30 = __VLS_29({
                name: "i-lucide-x",
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "helper-copy" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-section" },
});
const __VLS_32 = {}.UCollapsible;
/** @type {[typeof __VLS_components.UCollapsible, typeof __VLS_components.UCollapsible, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    open: (__VLS_ctx.advancedOpen),
    ...{ class: "advanced-box" },
}));
const __VLS_34 = __VLS_33({
    open: (__VLS_ctx.advancedOpen),
    ...{ class: "advanced-box" },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ open }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "advanced-trigger" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_36 = {}.UIcon;
    /** @type {[typeof __VLS_components.UIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        name: "i-lucide-chevron-down",
        ...{ class: "advanced-icon" },
        ...{ class: ({ 'rotate-180': open }) },
    }));
    const __VLS_38 = __VLS_37({
        name: "i-lucide-chevron-down",
        ...{ class: "advanced-icon" },
        ...{ class: ({ 'rotate-180': open }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
}
{
    const { content: __VLS_thisSlot } = __VLS_35.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "advanced-content" },
    });
    const __VLS_40 = {}.UFormField;
    /** @type {[typeof __VLS_components.UFormField, typeof __VLS_components.UFormField, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        label: "Extension Hint",
    }));
    const __VLS_42 = __VLS_41({
        label: "Extension Hint",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    const __VLS_44 = {}.UInput;
    /** @type {[typeof __VLS_components.UInput, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        modelValue: (__VLS_ctx.extensionHint),
        placeholder: ".pdf / .docx / .html",
    }));
    const __VLS_46 = __VLS_45({
        modelValue: (__VLS_ctx.extensionHint),
        placeholder: ".pdf / .docx / .html",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    var __VLS_43;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "switch-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "switch-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "switch-copy" },
    });
    const __VLS_48 = {}.USwitch;
    /** @type {[typeof __VLS_components.USwitch, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        modelValue: (__VLS_ctx.usePlugins),
    }));
    const __VLS_50 = __VLS_49({
        modelValue: (__VLS_ctx.usePlugins),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "switch-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "switch-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "switch-copy" },
    });
    const __VLS_52 = {}.USwitch;
    /** @type {[typeof __VLS_components.USwitch, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        modelValue: (__VLS_ctx.keepDataUris),
    }));
    const __VLS_54 = __VLS_53({
        modelValue: (__VLS_ctx.keepDataUris),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
}
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-actions" },
});
const __VLS_56 = {}.UButton;
/** @type {[typeof __VLS_components.UButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onClick': {} },
    label: (__VLS_ctx.workMode === 'batch' ? 'Convert All Files' : 'Convert to Markdown'),
    color: "primary",
    icon: "i-lucide-wand-sparkles",
    loading: (__VLS_ctx.loading),
    disabled: (!__VLS_ctx.canConvert),
}));
const __VLS_58 = __VLS_57({
    ...{ 'onClick': {} },
    label: (__VLS_ctx.workMode === 'batch' ? 'Convert All Files' : 'Convert to Markdown'),
    color: "primary",
    icon: "i-lucide-wand-sparkles",
    loading: (__VLS_ctx.loading),
    disabled: (!__VLS_ctx.canConvert),
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onClick: (__VLS_ctx.runConvert)
};
var __VLS_59;
const __VLS_64 = {}.UButton;
/** @type {[typeof __VLS_components.UButton, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onClick': {} },
    label: "Reset",
    color: "neutral",
    variant: "ghost",
}));
const __VLS_66 = __VLS_65({
    ...{ 'onClick': {} },
    label: "Reset",
    color: "neutral",
    variant: "ghost",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onClick: (__VLS_ctx.resetAll)
};
var __VLS_67;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: (['status-panel', `status-panel--${__VLS_ctx.statusColor}`]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.statusLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.status);
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "result-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "result-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "result-label" },
});
(__VLS_ctx.workMode === "batch" ? "Batch Results" : "Conversion Result");
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.currentTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "result-actions" },
});
if (__VLS_ctx.workMode === 'batch' && __VLS_ctx.batchResult?.items.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.activeBatchItemId),
        ...{ class: "batch-picker" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.batchResult.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item.id),
            value: (item.id),
        });
        (item.sourceName);
        (item.success ? "" : " · Failed");
    }
}
const __VLS_72 = {}.UTabs;
/** @type {[typeof __VLS_components.UTabs, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.viewMode),
    items: (__VLS_ctx.viewItems),
    content: (false),
    size: "sm",
    ...{ class: "result-tabs" },
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.viewMode),
    items: (__VLS_ctx.viewItems),
    content: (false),
    size: "sm",
    ...{ class: "result-tabs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
const __VLS_76 = {}.UButton;
/** @type {[typeof __VLS_components.UButton, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onClick': {} },
    label: "Copy",
    color: "neutral",
    variant: "ghost",
    disabled: (!__VLS_ctx.canUseCurrentMarkdown),
}));
const __VLS_78 = __VLS_77({
    ...{ 'onClick': {} },
    label: "Copy",
    color: "neutral",
    variant: "ghost",
    disabled: (!__VLS_ctx.canUseCurrentMarkdown),
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onClick: (__VLS_ctx.copyMarkdown)
};
var __VLS_79;
const __VLS_84 = {}.UButton;
/** @type {[typeof __VLS_components.UButton, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    ...{ 'onClick': {} },
    label: (__VLS_ctx.workMode === 'batch' ? 'Download Current' : 'Download'),
    color: "neutral",
    variant: "ghost",
    disabled: (!__VLS_ctx.canUseCurrentMarkdown),
}));
const __VLS_86 = __VLS_85({
    ...{ 'onClick': {} },
    label: (__VLS_ctx.workMode === 'batch' ? 'Download Current' : 'Download'),
    color: "neutral",
    variant: "ghost",
    disabled: (!__VLS_ctx.canUseCurrentMarkdown),
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
let __VLS_88;
let __VLS_89;
let __VLS_90;
const __VLS_91 = {
    onClick: (__VLS_ctx.downloadMarkdown)
};
var __VLS_87;
if (__VLS_ctx.workMode === 'batch') {
    const __VLS_92 = {}.UButton;
    /** @type {[typeof __VLS_components.UButton, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onClick': {} },
        label: "Download All",
        color: "neutral",
        variant: "ghost",
        disabled: (!__VLS_ctx.canDownloadBatchArchive),
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onClick': {} },
        label: "Download All",
        color: "neutral",
        variant: "ghost",
        disabled: (!__VLS_ctx.canDownloadBatchArchive),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onClick: (__VLS_ctx.downloadBatchArchive)
    };
    var __VLS_95;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "meta-strip" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.metaItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.label),
        ...{ class: "meta-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (item.value);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "output-surface" },
});
if (__VLS_ctx.viewMode === 'preview') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "markdown-body" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderedMarkdown) }, null, null);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "markdown-raw" },
    });
    (__VLS_ctx.canUseCurrentMarkdown && __VLS_ctx.currentResult ? __VLS_ctx.currentResult.markdown : "");
}
/** @type {__VLS_StyleScopedClasses['minimal-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-line']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-name']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['app-main']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['control-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-label']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-44']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['selection-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['file-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['helper-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-52']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['selection-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['selection-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['helper-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['selection-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['file-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-list--batch']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['helper-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-section']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-box']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-content']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-label']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-label']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['status-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['result-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['result-header']} */ ;
/** @type {__VLS_StyleScopedClasses['result-label']} */ ;
/** @type {__VLS_StyleScopedClasses['result-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['result-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['output-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-body']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-raw']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            workMode: workMode,
            sourceMode: sourceMode,
            viewMode: viewMode,
            selectedFile: selectedFile,
            selectedBatchFiles: selectedBatchFiles,
            activeBatchItemId: activeBatchItemId,
            sourceUrl: sourceUrl,
            extensionHint: extensionHint,
            usePlugins: usePlugins,
            keepDataUris: keepDataUris,
            loading: loading,
            advancedOpen: advancedOpen,
            status: status,
            statusColor: statusColor,
            batchResult: batchResult,
            modeItems: modeItems,
            sourceItems: sourceItems,
            viewItems: viewItems,
            currentResult: currentResult,
            canConvert: canConvert,
            canUseCurrentMarkdown: canUseCurrentMarkdown,
            canDownloadBatchArchive: canDownloadBatchArchive,
            currentTitle: currentTitle,
            statusLabel: statusLabel,
            metaItems: metaItems,
            renderedMarkdown: renderedMarkdown,
            formatFileSize: formatFileSize,
            getFileTag: getFileTag,
            clearSelectedFile: clearSelectedFile,
            removeBatchFile: removeBatchFile,
            clearBatchFiles: clearBatchFiles,
            resetAll: resetAll,
            runConvert: runConvert,
            copyMarkdown: copyMarkdown,
            downloadMarkdown: downloadMarkdown,
            downloadBatchArchive: downloadBatchArchive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
