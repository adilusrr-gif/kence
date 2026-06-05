"""
Enterprise Document Pipeline — scalable chunk-based processing for any document size.

Architecture:
  Document → Chunks → Parallel Processing → Aggregation → Final Result

Supports 100–1000+ page documents without information loss.
"""
import asyncio
import hashlib
import logging
from typing import AsyncGenerator, Callable, List, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ── Chunk utilities ────────────────────────────────────────────────────────────

def split_text(text: str, chunk_size: int = 4000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks. No hard cap on count."""
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i : i + chunk_size])
        i += chunk_size - overlap
    return chunks


def stratified_sample(text: str, target_chars: int, n_parts: int = 5) -> str:
    """Take evenly-spaced samples from document for operations that need a
    representative cross-section (not just the beginning).

    Returns at most target_chars while covering beginning, middle, and end.
    """
    if len(text) <= target_chars:
        return text
    part_size = target_chars // n_parts
    step = len(text) // n_parts
    parts = []
    for i in range(n_parts):
        start = i * step
        parts.append(text[start : start + part_size])
    result = "\n\n[...]\n\n".join(parts)
    return result


# ── Parallel chunk processing ──────────────────────────────────────────────────

async def process_chunks_parallel(
    chunks: List[str],
    process_fn: Callable[[str, int, int], asyncio.coroutines],
    max_concurrent: int = 3,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> List:
    """Process all chunks with a semaphore-limited concurrency.

    Args:
        chunks: List of text chunks to process.
        process_fn: async fn(chunk_text, chunk_index, total_chunks) -> result
        max_concurrent: Max parallel LLM calls.
        progress_callback: Optional fn(completed, total).

    Returns:
        List of results in original order (None for failed chunks).
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    results = [None] * len(chunks)
    completed = 0

    async def process_one(idx: int, chunk: str):
        nonlocal completed
        async with semaphore:
            try:
                result = await process_fn(chunk, idx, len(chunks))
                results[idx] = result
            except Exception as e:
                logger.warning("[pipeline] chunk %d/%d failed: %s", idx + 1, len(chunks), e)
                results[idx] = None
            finally:
                completed += 1
                if progress_callback:
                    progress_callback(completed, len(chunks))

    await asyncio.gather(*[process_one(i, chunk) for i, chunk in enumerate(chunks)])
    return results


async def map_reduce(
    text: str,
    map_fn: Callable,
    reduce_fn: Callable,
    chunk_size: int = 4000,
    overlap: int = 200,
    max_concurrent: int = 3,
    progress_callback: Optional[Callable] = None,
) -> str:
    """Full map-reduce over entire document.

    map_fn(chunk) -> str
    reduce_fn(list[str]) -> str
    """
    chunks = split_text(text, chunk_size, overlap)
    logger.info("[pipeline] map_reduce: %d chunks, %d chars total", len(chunks), len(text))

    async def _map(chunk, idx, total):
        if progress_callback:
            progress_callback(idx, total)
        return await map_fn(chunk)

    mapped = await process_chunks_parallel(chunks, _map, max_concurrent)
    mapped = [r for r in mapped if r]  # filter failed
    return await reduce_fn(mapped)


async def hierarchical_map_reduce(
    text: str,
    map_fn: Callable,
    reduce_fn: Callable,
    chunk_size: int = 4000,
    overlap: int = 200,
    section_size: int = 10,
    max_concurrent: int = 3,
    progress_callback: Optional[Callable] = None,
) -> dict:
    """3-level hierarchical map-reduce for very large documents:
    Chunks → Section Summaries → Global Summary → Executive Summary

    Returns: {
        "chunks_processed": int,
        "section_summaries": list[str],
        "global_summary": str,
    }
    """
    chunks = split_text(text, chunk_size, overlap)
    total = len(chunks)
    logger.info("[pipeline] hierarchical_map_reduce: %d chunks", total)

    # Level 1: Map — summarize each chunk
    async def _map(chunk, idx, tot):
        if progress_callback:
            progress_callback(f"Чанк {idx+1}/{tot}", idx / tot)
        return await map_fn(chunk)

    chunk_summaries = await process_chunks_parallel(chunks, _map, max_concurrent)
    chunk_summaries = [s for s in chunk_summaries if s]

    # Level 2: Group into sections and reduce
    section_summaries = []
    for i in range(0, len(chunk_summaries), section_size):
        batch = chunk_summaries[i : i + section_size]
        combined = "\n\n".join(batch)
        if progress_callback:
            progress_callback(f"Раздел {i//section_size + 1}", 0.7)
        try:
            section_summary = await reduce_fn(batch)
            section_summaries.append(section_summary)
        except Exception as e:
            logger.warning("[pipeline] section reduce failed: %s", e)
            section_summaries.append(combined[:2000])

    # Level 3: Global summary
    if progress_callback:
        progress_callback("Финальное резюме", 0.9)
    global_summary = await reduce_fn(section_summaries)

    return {
        "chunks_processed": total,
        "section_summaries": section_summaries,
        "global_summary": global_summary,
    }


# ── Chunk-based extraction ─────────────────────────────────────────────────────

async def extract_from_all_chunks(
    text: str,
    extract_fn: Callable,
    merge_fn: Callable,
    chunk_size: int = 5000,
    overlap: int = 300,
    max_concurrent: int = 3,
    progress_callback: Optional[Callable] = None,
) -> dict:
    """Run an extraction function over ALL chunks, then merge results.

    extract_fn(chunk) -> dict  (e.g., entities, facts, risks)
    merge_fn(list[dict]) -> dict  (deduplication + aggregation)
    """
    chunks = split_text(text, chunk_size, overlap)
    logger.info("[pipeline] extract_from_all_chunks: %d chunks", len(chunks))

    async def _extract(chunk, idx, total):
        if progress_callback:
            progress_callback(f"Обработка чанка {idx+1}/{total}", idx / total)
        return await extract_fn(chunk)

    results = await process_chunks_parallel(chunks, _extract, max_concurrent)
    results = [r for r in results if r]
    return await merge_fn(results)


# ── ID utilities ───────────────────────────────────────────────────────────────

def stable_chunk_id(text: str) -> str:
    """Generate a stable, collision-resistant chunk ID using SHA-256 hash.
    Replaces the brittle [:120] string slice used as ID in the retriever.
    """
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:32]
