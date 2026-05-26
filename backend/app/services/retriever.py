"""
Hybrid retriever — BM25 (keyword) + ChromaDB (semantic) fused via RRF.

RRF score: sum of 1/(k + rank) across both result lists.
k=60 is the standard constant from the original RRF paper.
"""
import logging
import numpy as np
from typing import List, Optional

from langchain_core.documents import Document as LCDocument
from langchain_community.vectorstores import Chroma

from app.core.config import get_settings
from app.services.embeddings_service import embeddings_service

logger = logging.getLogger(__name__)
settings = get_settings()

RRF_K = 60


def _rrf_fuse(
    ranked_lists: List[List[str]],
    id_to_doc: dict,
    k: int,
) -> List[LCDocument]:
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)

    top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:k]
    result = []
    for doc_id, _ in top:
        if doc_id in id_to_doc:
            result.append(id_to_doc[doc_id])
    return result


class HybridRetriever:
    """
    Retrieves chunks using BM25 + semantic search and fuses them with RRF.
    Falls back to pure semantic when the Chroma collection is empty or BM25
    cannot be built (e.g. rank_bm25 not installed).
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.vector_store = Chroma(
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
            embedding_function=embeddings_service.embeddings,
        )

    def _all_chunks(self) -> List[LCDocument]:
        try:
            data = self.vector_store._collection.get(
                include=["documents", "metadatas"]
            )
            docs = data.get("documents") or []
            metas = data.get("metadatas") or [{}] * len(docs)
            return [
                LCDocument(page_content=text, metadata=meta or {})
                for text, meta in zip(docs, metas)
                if text
            ]
        except Exception as e:
            logger.warning("[retriever] _all_chunks failed: %s", e)
            return []

    def retrieve(self, query: str, k: int = 8, mode: str = "precise") -> List[LCDocument]:
        fetch_k = k * 2

        # ── Semantic search ────────────────────────────────────────────────
        if mode == "consultation":
            semantic_docs = self.vector_store.max_marginal_relevance_search(
                query, k=fetch_k, fetch_k=fetch_k * 2, lambda_mult=0.6
            )
        else:
            semantic_docs = self.vector_store.similarity_search(query, k=fetch_k)

        if not semantic_docs:
            return []

        # ── BM25 search ────────────────────────────────────────────────────
        all_chunks = self._all_chunks()
        bm25_docs: List[LCDocument] = []

        if len(all_chunks) >= 3:
            try:
                from rank_bm25 import BM25Okapi
                tokenized = [c.page_content.lower().split() for c in all_chunks]
                bm25 = BM25Okapi(tokenized)
                scores = bm25.get_scores(query.lower().split())
                top_idx = np.argsort(scores)[::-1][:fetch_k]
                bm25_docs = [all_chunks[i] for i in top_idx]
            except ImportError:
                logger.debug("[retriever] rank_bm25 not installed; skipping BM25")
            except Exception as e:
                logger.warning("[retriever] BM25 failed: %s", e)

        if not bm25_docs:
            # No BM25 — return semantic results only
            return semantic_docs[:k]

        # ── RRF fusion ─────────────────────────────────────────────────────
        def _id(doc: LCDocument) -> str:
            return doc.page_content[:120]

        id_to_doc = {_id(d): d for d in semantic_docs + bm25_docs}
        semantic_ids = [_id(d) for d in semantic_docs]
        bm25_ids = [_id(d) for d in bm25_docs]

        return _rrf_fuse([semantic_ids, bm25_ids], id_to_doc, k)

    def as_langchain_retriever(self, k: int = 8, mode: str = "precise"):
        """Wraps retrieve() in a langchain-compatible callable."""
        from langchain_core.retrievers import BaseRetriever
        from langchain_core.callbacks import CallbackManagerForRetrieverRun

        outer = self

        class _Adapter(BaseRetriever):
            def _get_relevant_documents(
                self, query: str, *, run_manager: CallbackManagerForRetrieverRun
            ) -> List[LCDocument]:
                return outer.retrieve(query, k=k, mode=mode)

        return _Adapter()
