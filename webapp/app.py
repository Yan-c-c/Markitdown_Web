from __future__ import annotations

import io
import mimetypes
import time
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

warnings.filterwarnings(
    "ignore",
    message=r"Couldn't find ffmpeg or avconv - defaulting to ffmpeg, but may not work",
    category=RuntimeWarning,
)

from markitdown import (  # noqa: E402
    FileConversionException,
    MarkItDown,
    MarkItDownException,
    MissingDependencyException,
    StreamInfo,
    UnsupportedFormatException,
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend-vue" / "dist"
MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
MAX_BATCH_TOTAL_BYTES = 200 * 1024 * 1024
MAX_BATCH_FILE_COUNT = 50


def create_app() -> FastAPI:
    app = FastAPI(
        title="MarkItDown Web",
        description="A lightweight web UI for converting files and URLs to Markdown.",
    )
    frontend_assets_dir = FRONTEND_DIST_DIR / "assets"
    app.mount(
        "/assets",
        StaticFiles(directory=frontend_assets_dir, check_dir=False),
        name="assets",
    )

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(resolve_index_file())

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/convert")
    async def convert(
        source_mode: str = Form("file"),
        file: UploadFile | None = File(default=None),
        url: str | None = Form(default=None),
        extension_hint: str | None = Form(default=None),
        use_plugins: bool = Form(default=False),
        keep_data_uris: bool = Form(default=False),
    ) -> dict[str, object]:
        started_at = time.perf_counter()
        normalized_mode = source_mode.strip().lower()
        converter = get_markitdown(bool(use_plugins))

        try:
            if normalized_mode == "url":
                result, source_name, source_kind, file_size = convert_url_input(
                    converter,
                    url=url,
                    extension_hint=extension_hint,
                    keep_data_uris=keep_data_uris,
                )
            elif normalized_mode == "file":
                result, source_name, source_kind, file_size = await convert_uploaded_file(
                    converter,
                    upload=file,
                    extension_hint=extension_hint,
                    keep_data_uris=keep_data_uris,
                )
            else:
                raise HTTPException(status_code=400, detail="Invalid conversion mode.")
        except Exception as exc:
            raise to_http_exception(exc) from exc

        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        return build_success_payload(
            result=result,
            source_kind=source_kind,
            source_name=source_name,
            file_size=file_size,
            duration_ms=elapsed_ms,
        )

    @app.post("/api/convert/batch")
    async def convert_batch(
        files: list[UploadFile] = File(),
        extension_hint: str | None = Form(default=None),
        use_plugins: bool = Form(default=False),
        keep_data_uris: bool = Form(default=False),
    ) -> dict[str, object]:
        if not files:
            raise HTTPException(status_code=400, detail="Upload at least one file.")
        if len(files) > MAX_BATCH_FILE_COUNT:
            raise HTTPException(
                status_code=400,
                detail=f"You can process up to {MAX_BATCH_FILE_COUNT} files per batch.",
            )

        converter = get_markitdown(bool(use_plugins))
        started_at = time.perf_counter()
        total_bytes = 0
        items: list[dict[str, Any]] = []

        for index, upload in enumerate(files):
            item_started_at = time.perf_counter()
            source_name = upload.filename or f"document-{index + 1}"

            try:
                payload = await read_upload_payload(upload)
                total_bytes += len(payload)

                if total_bytes > MAX_BATCH_TOTAL_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="The total batch upload size exceeds 200 MB. Split the files and try again.",
                    )

                result, file_size = convert_uploaded_payload(
                    converter,
                    payload=payload,
                    filename=source_name,
                    content_type=upload.content_type,
                    extension_hint=extension_hint,
                    keep_data_uris=keep_data_uris,
                )
                item_duration_ms = round((time.perf_counter() - item_started_at) * 1000)
                success_payload = build_success_payload(
                    result=result,
                    source_kind="file",
                    source_name=source_name,
                    file_size=file_size,
                    duration_ms=item_duration_ms,
                )
                items.append(
                    {
                        "id": f"batch-{index}",
                        "success": True,
                        "error": None,
                        **success_payload,
                    }
                )
            except Exception as exc:
                http_exc = to_http_exception(exc)
                item_duration_ms = round((time.perf_counter() - item_started_at) * 1000)
                items.append(
                    {
                        "id": f"batch-{index}",
                        "success": False,
                        "error": str(http_exc.detail),
                        "title": None,
                        "markdown": "",
                        "charCount": 0,
                        "lineCount": 0,
                        "durationMs": item_duration_ms,
                        "sourceKind": "file",
                        "sourceName": source_name,
                        "fileSize": None,
                    }
                )

        success_count = sum(1 for item in items if item["success"])
        failure_count = len(items) - success_count
        total_duration_ms = round((time.perf_counter() - started_at) * 1000)

        return {
            "items": items,
            "totalCount": len(items),
            "successCount": success_count,
            "failureCount": failure_count,
            "durationMs": total_duration_ms,
        }

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if not full_path or full_path.startswith(("api/", "assets/")):
            raise HTTPException(status_code=404, detail="Not found")

        candidate = FRONTEND_DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(resolve_index_file())

    return app


def normalize_extension(extension_hint: str | None) -> str | None:
    if extension_hint is None:
        return None

    normalized = extension_hint.strip().lower()
    if not normalized:
        return None
    if not normalized.startswith("."):
        normalized = f".{normalized}"
    return normalized


def build_stream_info(
    *,
    filename: str | None,
    content_type: str | None,
    extension_hint: str | None,
) -> StreamInfo:
    normalized_extension = normalize_extension(extension_hint)
    inferred_extension = normalized_extension or (
        Path(filename).suffix.lower() if filename else None
    )

    inferred_mimetype = content_type
    if inferred_mimetype in (None, "", "application/octet-stream"):
        guessed_name = filename or f"document{inferred_extension or ''}"
        inferred_mimetype = mimetypes.guess_type(guessed_name)[0]

    return StreamInfo(
        filename=filename,
        extension=inferred_extension,
        mimetype=inferred_mimetype,
    )


async def read_upload_payload(upload: UploadFile | None) -> bytes:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail="Please choose a file.")

    return await upload.read(MAX_UPLOAD_SIZE_BYTES + 1)


async def convert_uploaded_file(
    converter: MarkItDown,
    *,
    upload: UploadFile | None,
    extension_hint: str | None,
    keep_data_uris: bool,
) -> tuple[Any, str, str, int]:
    payload = await read_upload_payload(upload)
    source_name = upload.filename if upload is not None and upload.filename else "document"
    content_type = upload.content_type if upload is not None else None
    result, file_size = convert_uploaded_payload(
        converter,
        payload=payload,
        filename=source_name,
        content_type=content_type,
        extension_hint=extension_hint,
        keep_data_uris=keep_data_uris,
    )
    return result, source_name, "file", file_size


def convert_uploaded_payload(
    converter: MarkItDown,
    *,
    payload: bytes,
    filename: str,
    content_type: str | None,
    extension_hint: str | None,
    keep_data_uris: bool,
) -> tuple[Any, int]:
    file_size = len(payload)

    if file_size <= 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if file_size > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The uploaded file is too large. The current web limit is 50 MB.",
        )

    stream_info = build_stream_info(
        filename=filename,
        content_type=content_type,
        extension_hint=extension_hint,
    )
    buffer = io.BytesIO(payload)
    result = converter.convert_stream(
        buffer,
        stream_info=stream_info,
        keep_data_uris=keep_data_uris,
    )
    return result, file_size


def convert_url_input(
    converter: MarkItDown,
    *,
    url: str | None,
    extension_hint: str | None,
    keep_data_uris: bool,
) -> tuple[Any, str, str, None]:
    target_url = (url or "").strip()
    if not target_url:
        raise HTTPException(status_code=400, detail="Please enter a URL to convert.")

    stream_info = build_stream_info(
        filename=None,
        content_type=None,
        extension_hint=extension_hint,
    )
    result = converter.convert(
        target_url,
        stream_info=stream_info,
        keep_data_uris=keep_data_uris,
    )
    return result, target_url, "url", None


def build_success_payload(
    *,
    result: Any,
    source_kind: str,
    source_name: str,
    file_size: int | None,
    duration_ms: int,
) -> dict[str, object]:
    markdown = result.markdown
    return {
        "title": result.title,
        "markdown": markdown,
        "charCount": len(markdown),
        "lineCount": 0 if not markdown else markdown.count("\n") + 1,
        "durationMs": duration_ms,
        "sourceKind": source_kind,
        "sourceName": source_name,
        "fileSize": file_size,
    }


def to_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, UnsupportedFormatException):
        return HTTPException(
            status_code=415,
            detail=f"This content type is not supported yet, or it requires an additional format hint.{exception_suffix(exc)}",
        )
    if isinstance(exc, MissingDependencyException):
        return HTTPException(
            status_code=500,
            detail=f"A required conversion dependency is missing.{exception_suffix(exc)}",
        )
    if isinstance(exc, FileConversionException):
        return HTTPException(
            status_code=422,
            detail=f"The file was read successfully, but the conversion failed.{exception_suffix(exc)}",
        )
    if isinstance(exc, MarkItDownException):
        return HTTPException(
            status_code=422,
            detail=f"MarkItDown could not complete this conversion.{exception_suffix(exc)}",
        )
    return HTTPException(
        status_code=500,
        detail=f"An unexpected error occurred during conversion.{exception_suffix(exc)}",
    )


def exception_suffix(exc: Exception) -> str:
    message = str(exc).strip()
    return "" if not message else f" Details: {message}"


def resolve_index_file() -> Path:
    frontend_index = FRONTEND_DIST_DIR / "index.html"
    if not frontend_index.exists():
        raise RuntimeError(
            f"Frontend build not found: {frontend_index}. Run `npm run build` in frontend-vue."
        )

    return frontend_index


@lru_cache(maxsize=2)
def get_markitdown(enable_plugins: bool) -> MarkItDown:
    return MarkItDown(enable_plugins=enable_plugins)


app = create_app()
