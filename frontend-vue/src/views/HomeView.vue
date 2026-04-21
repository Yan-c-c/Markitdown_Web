<script setup lang="ts">
import { computed, ref } from "vue";
import DOMPurify from "dompurify";
import JSZip from "jszip";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

type WorkMode = "single" | "batch";
type SourceMode = "file" | "url";
type ViewMode = "preview" | "markdown";
type StatusColor = "neutral" | "primary" | "success" | "error";

interface ConvertResponse {
  title: string | null;
  markdown: string;
  charCount: number;
  lineCount: number;
  durationMs: number;
  sourceKind: string;
  sourceName: string;
  fileSize: number | null;
}

interface BatchConvertItem extends ConvertResponse {
  id: string;
  success: boolean;
  error: string | null;
}

interface BatchConvertResponse {
  items: BatchConvertItem[];
  totalCount: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
}

type DisplayResult = ConvertResponse | BatchConvertItem;

const workMode = ref<WorkMode>("single");
const sourceMode = ref<SourceMode>("file");
const viewMode = ref<ViewMode>("preview");
const selectedFile = ref<File | null>(null);
const selectedBatchFiles = ref<File[]>([]);
const activeBatchItemId = ref("");
const sourceUrl = ref("");
const extensionHint = ref("");
const usePlugins = ref(false);
const keepDataUris = ref(false);
const loading = ref(false);
const advancedOpen = ref(false);
const status = ref("Waiting for a new input.");
const statusColor = ref<StatusColor>("neutral");
const result = ref<ConvertResponse | null>(null);
const batchResult = ref<BatchConvertResponse | null>(null);

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

const activeBatchItem = computed<BatchConvertItem | null>(() => {
  if (!batchResult.value?.items.length) {
    return null;
  }

  const preferred = batchResult.value.items.find((item) => item.id === activeBatchItemId.value);
  return preferred || batchResult.value.items[0] || null;
});

const currentResult = computed<DisplayResult | null>(() => {
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
    return DOMPurify.sanitize(
      workMode.value === "batch"
        ? `<div class="empty-state"><p class="empty-title">No batch results yet</p><p class="empty-copy">Upload multiple files and run a batch conversion to review each result here.</p></div>`
        : `<div class="empty-state"><p class="empty-title">No result yet</p><p class="empty-copy">Choose a file or enter a URL on the left, then start the conversion.</p></div>`,
    );
  }

  if (isBatchItem(currentResult.value) && !currentResult.value.success) {
    return DOMPurify.sanitize(
      `<div class="empty-state"><p class="empty-title">This file failed to convert</p><p class="empty-copy">${escapeHtml(currentResult.value.error || "Unknown error")}</p></div>`,
    );
  }

  return DOMPurify.sanitize(md.render(currentResult.value.markdown));
});

function isBatchItem(value: DisplayResult | null): value is BatchConvertItem {
  return !!value && "success" in value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatFileSize(bytes: number) {
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

function getFileTag(name: string) {
  const extension = name.split(".").pop()?.trim();
  if (!extension || extension === name) {
    return "FILE";
  }

  return extension.slice(0, 6).toUpperCase();
}

function setStatus(message: string, color: StatusColor = "neutral") {
  status.value = message;
  statusColor.value = color;
}

function clearSelectedFile() {
  selectedFile.value = null;
}

function removeBatchFile(index: number) {
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

function buildMarkdownName(source: Pick<ConvertResponse, "title" | "sourceName">) {
  const sourceName = source.title || source.sourceName || "document";
  const normalized = sourceName.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80);
  return normalized.endsWith(".md") ? normalized : `${normalized || "document"}.md`;
}

function triggerDownload(blob: Blob, filename: string) {
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
  } else {
    formData.append("url", sourceUrl.value.trim());
  }

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as ConvertResponse | { detail?: string };

    if (!response.ok) {
      throw new Error("detail" in payload ? payload.detail || "Conversion failed." : "Conversion failed.");
    }

    result.value = payload as ConvertResponse;
    batchResult.value = null;
    activeBatchItemId.value = "";
    setStatus("Conversion complete.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversion failed.";
    setStatus(message, "error");
  } finally {
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
    const payload = (await response.json()) as BatchConvertResponse | { detail?: string };

    if (!response.ok) {
      throw new Error("detail" in payload ? payload.detail || "Batch conversion failed." : "Batch conversion failed.");
    }

    const batchPayload = payload as BatchConvertResponse;
    batchResult.value = batchPayload;
    result.value = null;
    activeBatchItemId.value =
      batchPayload.items.find((item) => item.success)?.id ||
      batchPayload.items[0]?.id ||
      "";

    if (batchPayload.failureCount === 0) {
      setStatus(`Batch conversion complete. ${batchPayload.successCount} files succeeded.`, "success");
    } else if (batchPayload.successCount === 0) {
      setStatus(`Batch conversion failed. ${batchPayload.failureCount} files returned errors.`, "error");
    } else {
      setStatus(
        `Batch conversion complete: ${batchPayload.successCount} succeeded, ${batchPayload.failureCount} failed.`,
        "primary",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch conversion failed.";
    setStatus(message, "error");
  } finally {
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
  } catch {
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
</script>

<template>
  <div class="minimal-shell">
    <header class="app-header">
      <div class="brand-line">
        <div class="brand-mark">
          <div class="brand-dot" />
        </div>
        <div>
          <p class="brand-name">MarkItDown</p>
        </div>
      </div>

      <div class="header-actions">
        <UTabs
          v-model="workMode"
          :items="modeItems"
          :content="false"
          size="sm"
          class="mode-switch"
        />
        <div :class="['status-pill', `status-pill--${statusColor}`]">
          <span class="status-pill-dot" />
          <span>{{ statusLabel }}</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <section class="hero-copy"></section>

      <section class="workbench">
        <aside class="control-pane">
          <div class="pane-intro">
            <p class="pane-label">{{ workMode === "batch" ? "Batch Conversion" : "Single Conversion" }}</p>
            <h2>
              {{ workMode === "batch" ? "Drop multiple files at once." : "Choose a file or paste a URL." }}
            </h2>
            <p>
              {{
                workMode === "batch"
                  ? "Review each result individually or download everything in one zip."
                  : "Keep the required inputs visible and move everything else into advanced options."
              }}
            </p>
          </div>

          <div class="pane-section">
            <div class="section-head">
              <h3>Input</h3>
            </div>

            <template v-if="workMode === 'single'">
              <UTabs
                v-model="sourceMode"
                :items="sourceItems"
                :content="false"
                size="sm"
                class="w-full"
              />

              <UFileUpload
                v-if="sourceMode === 'file'"
                v-model="selectedFile"
                :multiple="false"
                :preview="false"
                icon="i-lucide-file-up"
                :label="selectedFile ? 'Click to replace the file' : 'Drop a file here or click to browse'"
                :description="selectedFile ? 'One file is currently attached and can be replaced directly.' : 'PDF, DOCX, PPTX, XLSX, HTML, CSV, EPUB'"
                variant="area"
                layout="grid"
                class="drop-zone min-h-44 w-full"
              />

              <div
                v-if="sourceMode === 'file'"
                class="selection-panel"
              >
                <div v-if="selectedFile" class="file-list">
                  <article class="file-item">
                    <div class="file-item-badge">
                      {{ getFileTag(selectedFile.name) }}
                    </div>
                    <div class="file-item-copy">
                      <p class="file-item-name">{{ selectedFile.name }}</p>
                      <p class="file-item-meta">1 file selected · {{ formatFileSize(selectedFile.size) }}</p>
                    </div>
                    <button
                      class="file-item-remove"
                      type="button"
                      aria-label="Remove the current file"
                      @click="clearSelectedFile"
                    >
                      <UIcon name="i-lucide-x" />
                    </button>
                  </article>
                </div>

                <p v-else class="helper-copy">Choose one file to start the conversion.</p>
              </div>

              <UFormField v-else label="URL">
                <UInput
                  v-model="sourceUrl"
                  icon="i-lucide-link"
                  placeholder="https://example.com/article"
                  size="lg"
                />
              </UFormField>
            </template>

            <template v-else>
              <UFileUpload
                v-model="selectedBatchFiles"
                :multiple="true"
                :preview="false"
                icon="i-lucide-files"
                :label="selectedBatchFiles.length ? 'Drop more files or click to add more' : 'Drop multiple files here or click to browse'"
                :description="selectedBatchFiles.length ? `${selectedBatchFiles.length} files are queued for conversion.` : 'Each file will be converted separately and keep its own result.'"
                variant="area"
                layout="grid"
                class="drop-zone min-h-52 w-full"
              />

              <div class="selection-panel">
                <div
                  v-if="selectedBatchFiles.length"
                  class="selection-summary"
                >
                  <p class="helper-copy">{{ selectedBatchFiles.length }} files selected. Add more or remove them individually.</p>
                  <button
                    class="selection-clear"
                    type="button"
                    @click="clearBatchFiles"
                  >
                    Clear
                  </button>
                </div>

                <div
                  v-if="selectedBatchFiles.length"
                  class="file-list file-list--batch"
                >
                  <article
                    v-for="(file, index) in selectedBatchFiles"
                    :key="`${file.name}-${file.size}-${file.lastModified}-${index}`"
                    class="file-item"
                  >
                    <div class="file-item-badge">
                      {{ getFileTag(file.name) }}
                    </div>
                    <div class="file-item-copy">
                      <p class="file-item-name">{{ file.name }}</p>
                      <p class="file-item-meta">{{ formatFileSize(file.size) }}</p>
                    </div>
                    <button
                      class="file-item-remove"
                      type="button"
                      :aria-label="`Remove file ${file.name}`"
                      @click="removeBatchFile(index)"
                    >
                      <UIcon name="i-lucide-x" />
                    </button>
                  </article>
                </div>

                <p v-else class="helper-copy">Drop multiple files at once, or add them in separate passes.</p>
              </div>
            </template>
          </div>

          <div class="pane-section">
            <UCollapsible v-model:open="advancedOpen" class="advanced-box">
              <template #default="{ open }">
                <button class="advanced-trigger" type="button">
                  <span>Advanced Options</span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="advanced-icon"
                    :class="{ 'rotate-180': open }"
                  />
                </button>
              </template>

              <template #content>
                <div class="advanced-content">
                  <UFormField label="Extension Hint">
                    <UInput
                      v-model="extensionHint"
                      placeholder=".pdf / .docx / .html"
                    />
                  </UFormField>

                  <div class="switch-row">
                    <div>
                      <p class="switch-label">Enable Plugins</p>
                      <p class="switch-copy">Use locally installed conversion plugins.</p>
                    </div>
                    <USwitch v-model="usePlugins" />
                  </div>

                  <div class="switch-row">
                    <div>
                      <p class="switch-label">Keep Data URIs</p>
                      <p class="switch-copy">Enable this only when inline assets need to be preserved.</p>
                    </div>
                    <USwitch v-model="keepDataUris" />
                  </div>
                </div>
              </template>
            </UCollapsible>
          </div>

          <div class="pane-actions">
            <UButton
              :label="workMode === 'batch' ? 'Convert All Files' : 'Convert to Markdown'"
              color="primary"
              icon="i-lucide-wand-sparkles"
              :loading="loading"
              :disabled="!canConvert"
              @click="runConvert"
            />
            <UButton
              label="Reset"
              color="neutral"
              variant="ghost"
              @click="resetAll"
            />
          </div>

          <div :class="['status-panel', `status-panel--${statusColor}`]">
            <div class="status-panel-head">
              <span>Status</span>
              <strong>{{ statusLabel }}</strong>
            </div>
            <p>{{ status }}</p>
          </div>
        </aside>

        <section class="result-pane">
          <div class="result-header">
            <div>
              <p class="result-label">{{ workMode === "batch" ? "Batch Results" : "Conversion Result" }}</p>
              <h2>{{ currentTitle }}</h2>
            </div>

            <div class="result-actions">
              <select
                v-if="workMode === 'batch' && batchResult?.items.length"
                v-model="activeBatchItemId"
                class="batch-picker"
              >
                <option
                  v-for="item in batchResult.items"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.sourceName }}{{ item.success ? "" : " · Failed" }}
                </option>
              </select>

              <UTabs
                v-model="viewMode"
                :items="viewItems"
                :content="false"
                size="sm"
                class="result-tabs"
              />
              <UButton
                label="Copy"
                color="neutral"
                variant="ghost"
                :disabled="!canUseCurrentMarkdown"
                @click="copyMarkdown"
              />
              <UButton
                :label="workMode === 'batch' ? 'Download Current' : 'Download'"
                color="neutral"
                variant="ghost"
                :disabled="!canUseCurrentMarkdown"
                @click="downloadMarkdown"
              />
              <UButton
                v-if="workMode === 'batch'"
                label="Download All"
                color="neutral"
                variant="ghost"
                :disabled="!canDownloadBatchArchive"
                @click="downloadBatchArchive"
              />
            </div>
          </div>

          <div class="meta-strip">
            <div v-for="item in metaItems" :key="item.label" class="meta-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>

          <div class="output-surface">
            <div v-if="viewMode === 'preview'" class="markdown-body" v-html="renderedMarkdown" />
            <pre v-else class="markdown-raw">{{ canUseCurrentMarkdown && currentResult ? currentResult.markdown : "" }}</pre>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
