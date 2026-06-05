from docling.document_converter import DocumentConverter
from pathlib import Path
from typing import Dict, List, Tuple
import difflib
import json
import logging
import re
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from app.core.config import get_settings
from app.services.embeddings_service import embeddings_service
from app.services.llm import llm_service
from app.services.ai_settings_service import get_prompt

logger = logging.getLogger(__name__)

settings = get_settings()

class DocumentComparator:
    def __init__(self):
        self.converter = DocumentConverter()
        self.embeddings = embeddings_service.embeddings
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", ". ", "! ", "? ", " ", ""]
        )

    def extract_document(self, file_path: str) -> str:
        """Извлекает текст из документа через Docling"""
        result = self.converter.convert(file_path)
        return result.document.export_to_markdown()

    def compare_semantic(self, doc1_path: str, doc2_path: str) -> Dict:
        """
        Сравнение по смыслу:
        - Извлекает ключевые темы из обоих документов
        - Сравнивает схожесть содержания
        - Находит общие и различные темы
        """
        text1 = self.extract_document(doc1_path)
        text2 = self.extract_document(doc2_path)

        # Создаём векторные представления для семантического сравнения
        chunks1 = self.text_splitter.split_documents(
            [LCDocument(page_content=text1, metadata={"source": "doc1"})]
        )
        chunks2 = self.text_splitter.split_documents(
            [LCDocument(page_content=text2, metadata={"source": "doc2"})]
        )

        # Объединяем для поиска схожих/различных частей
        all_chunks = chunks1 + chunks2
        temp_store = Chroma.from_documents(
            documents=all_chunks,
            embedding=self.embeddings,
            persist_directory=None  # In-memory
        )

        # Анализируем схожесть
        similarities = []
        differences_doc1 = []
        differences_doc2 = []

        for chunk in chunks1:
            similar = temp_store.similarity_search_with_score(chunk.page_content, k=3)
            # Фильтруем результаты из doc2
            doc2_similar = [s for s in similar if s[0].metadata.get("source") == "doc2"]

            if doc2_similar:
                best_match = min(doc2_similar, key=lambda x: x[1])
                if best_match[1] < 0.3:  # Порог схожести
                    similarities.append({
                        "doc1_text": chunk.page_content[:200],
                        "doc2_text": best_match[0].page_content[:200],
                        "similarity_score": round(1 - best_match[1], 3)
                    })
                else:
                    differences_doc1.append(chunk.page_content[:200])
            else:
                differences_doc1.append(chunk.page_content[:200])

        # Находим уникальное во втором документе
        for chunk in chunks2:
            similar = temp_store.similarity_search_with_score(chunk.page_content, k=3)
            doc1_similar = [s for s in similar if s[0].metadata.get("source") == "doc1"]

            if not doc1_similar or min(doc1_similar, key=lambda x: x[1])[1] > 0.3:
                differences_doc2.append(chunk.page_content[:400])

        # LLM verdict using stratified sample (covers full documents)
        verdict = ""
        try:
            from app.services.pipeline import stratified_sample
            sample1 = stratified_sample(text1, target_chars=8000, n_parts=5)
            sample2 = stratified_sample(text2, target_chars=8000, n_parts=5)
            verdict_prompt = (
                f"Сравни два документа и дай КРАТКИЙ АНАЛИТИЧЕСКИЙ ВЕРДИКТ (3-5 предложений).\n"
                f"Укажи: в чём главное сходство, чем принципиально отличаются, какой вывод.\n\n"
                f"Документ 1 ({Path(doc1_path).name}):\n{sample1}\n\n"
                f"Документ 2 ({Path(doc2_path).name}):\n{sample2}\n\nВердикт:"
            )
            verdict = llm_service.simple_chat(verdict_prompt)
        except Exception as e:
            logger.warning("Semantic verdict LLM failed: %s", e)

        # Overall similarity score (average of top similarities)
        avg_similarity = round(
            sum(s["similarity_score"] for s in similarities) / len(similarities), 3
        ) if similarities else 0.0

        return {
            "comparison_type": "semantic",
            "doc1_name": Path(doc1_path).name,
            "doc2_name": Path(doc2_path).name,
            "similarities": similarities[:20],
            "unique_to_doc1": differences_doc1[:20],
            "unique_to_doc2": differences_doc2[:20],
            "verdict": verdict,
            "overall_similarity": avg_similarity,
            "summary": {
                "similar_sections": len(similarities),
                "unique_doc1_sections": len(differences_doc1),
                "unique_doc2_sections": len(differences_doc2),
                "overall_similarity_pct": round(avg_similarity * 100, 1),
            }
        }

    def compare_technical_specs(self, doc1_path: str, doc2_path: str) -> Dict:
        """
        Сравнение технических спецификаций:
        - Извлекает характеристики товаров (параметр: значение)
        - Сравнивает по каждому параметру
        - Выделяет различия в спецификациях
        """
        text1 = self.extract_document(doc1_path)
        text2 = self.extract_document(doc2_path)

        extract_prompt = get_prompt("comparison_technical_prompt")

        # Извлекаем спецификации из обоих документов
        from app.services.pipeline import stratified_sample
        spec1_raw = llm_service.simple_chat(extract_prompt.format(text=stratified_sample(text1, 20000, 8)))
        spec2_raw = llm_service.simple_chat(extract_prompt.format(text=stratified_sample(text2, 20000, 8)))

        def extract_json(text):
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError as e:
                    logger.warning("Failed to parse spec JSON: %s | raw: %.200s", e, text)
                    return None
            return None

        spec1 = extract_json(spec1_raw) or {"specifications": [], "key_features": []}
        spec2 = extract_json(spec2_raw) or {"specifications": [], "key_features": []}

        # Сравниваем спецификации
        comparison = self._compare_specifications(spec1, spec2)

        return {
            "comparison_type": "technical_specs",
            "doc1_name": Path(doc1_path).name,
            "doc2_name": Path(doc2_path).name,
            "doc1_specs": spec1,
            "doc2_specs": spec2,
            "comparison": comparison,
            "match_percentage": comparison.get("match_percentage", 0)
        }

    def _compare_specifications(self, spec1: Dict, spec2: Dict) -> Dict:
        """Сравнивает две спецификации по параметрам"""
        specs1 = {s["parameter"].lower().strip(): s for s in spec1.get("specifications", [])}
        specs2 = {s["parameter"].lower().strip(): s for s in spec2.get("specifications", [])}

        all_params = set(specs1.keys()) | set(specs2.keys())

        matched = []
        mismatched = []
        only_in_doc1 = []
        only_in_doc2 = []

        for param in all_params:
            if param in specs1 and param in specs2:
                val1 = specs1[param]["value"]
                val2 = specs2[param]["value"]

                if self._values_match(val1, val2):
                    matched.append({
                        "parameter": param,
                        "value": val1,
                        "unit": specs1[param].get("unit", "")
                    })
                else:
                    mismatched.append({
                        "parameter": param,
                        "doc1_value": val1,
                        "doc2_value": val2,
                        "unit": specs1[param].get("unit", specs2[param].get("unit", ""))
                    })
            elif param in specs1:
                only_in_doc1.append(specs1[param])
            else:
                only_in_doc2.append(specs2[param])

        total = len(all_params)
        match_count = len(matched)
        match_percentage = round((match_count / total * 100), 1) if total > 0 else 0

        return {
            "match_percentage": match_percentage,
            "total_parameters": total,
            "matched": matched,
            "mismatched": mismatched,
            "only_in_doc1": only_in_doc1,
            "only_in_doc2": only_in_doc2
        }

    def _values_match(self, val1, val2) -> bool:
        """Проверяет совпадение значений (с учётом числовых)"""
        s1 = str(val1).lower().strip()
        s2 = str(val2).lower().strip()

        if s1 == s2:
            return True

        # Пробуем сравнить как числа
        try:
            n1 = float(s1.replace(",", "."))
            n2 = float(s2.replace(",", "."))
            return abs(n1 - n2) < 0.01
        except (ValueError, TypeError):
            pass

        return False

    def _char_diff(self, old: str, new: str) -> list:
        matcher = difflib.SequenceMatcher(None, old, new, autojunk=False)
        ops = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                ops.append({"type": "equal",  "text": old[i1:i2]})
            elif tag == 'delete':
                ops.append({"type": "delete", "text": old[i1:i2]})
            elif tag == 'insert':
                ops.append({"type": "insert", "text": new[j1:j2]})
            elif tag == 'replace':
                ops.append({"type": "delete", "text": old[i1:i2]})
                ops.append({"type": "insert", "text": new[j1:j2]})
        return ops

    def compare_exact(self, doc1_path: str, doc2_path: str) -> Dict:
        """Точное посимвольное сравнение: каждый символ должен совпадать"""
        text1 = self.extract_document(doc1_path)
        text2 = self.extract_document(doc2_path)

        is_identical = text1 == text2

        lines1 = text1.splitlines()
        lines2 = text2.splitlines()

        matcher = difflib.SequenceMatcher(None, lines1, lines2, autojunk=False)
        diff_lines = []
        diff_count = 0

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                for line in lines1[i1:i2]:
                    diff_lines.append({"type": "equal", "text": line})

            elif tag == 'delete':
                for line in lines1[i1:i2]:
                    diff_lines.append({"type": "delete", "text": line})
                    diff_count += 1

            elif tag == 'insert':
                for line in lines2[j1:j2]:
                    diff_lines.append({"type": "insert", "text": line})
                    diff_count += 1

            elif tag == 'replace':
                old_lines = lines1[i1:i2]
                new_lines = lines2[j1:j2]

                if len(old_lines) == 1 and len(new_lines) == 1:
                    diff_lines.append({
                        "type": "replace",
                        "old": old_lines[0],
                        "new": new_lines[0],
                        "char_ops": self._char_diff(old_lines[0], new_lines[0]),
                    })
                else:
                    for line in old_lines:
                        diff_lines.append({"type": "delete", "text": line})
                    for line in new_lines:
                        diff_lines.append({"type": "insert", "text": line})
                diff_count += 1

        return {
            "is_identical": is_identical,
            "doc1_name": Path(doc1_path).name,
            "doc2_name": Path(doc2_path).name,
            "doc1_chars": len(text1),
            "doc2_chars": len(text2),
            "diff_count": diff_count,
            "diff_lines": diff_lines,
        }


    def compare_thematic(self, doc1_path: str, doc2_path: str) -> Dict:
        """Тематическое сравнение: извлекает главные темы, аргументы и позиции каждого документа,
        затем сравнивает их по смыслу. Uses stratified_sample for full-doc coverage."""
        from app.services.pipeline import stratified_sample
        text1 = self.extract_document(doc1_path)
        text2 = self.extract_document(doc2_path)
        name1, name2 = Path(doc1_path).name, Path(doc2_path).name

        def extract_themes(text: str, doc_name: str) -> dict:
            prompt = (
                f"Проанализируй документ и верни JSON:\n"
                f'{{"main_theme": "Главная тема", '
                f'"key_arguments": ["Аргумент 1", "Аргумент 2"], '
                f'"stance": "Позиция/тезис документа (1-2 предложения)", '
                f'"tone": "нейтральный|аналитический|убедительный|информационный|критический", '
                f'"key_concepts": ["Ключевое понятие 1", "Ключевое понятие 2"]}}\n\n'
                f"Документ ({doc_name}):\n{stratified_sample(text, 12000, 6) if len(text) > 12000 else text}\n\nJSON:"
            )
            raw = llm_service.simple_chat(prompt)
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except Exception:
                    pass
            return {"main_theme": "Не определено", "key_arguments": [], "stance": "", "tone": "", "key_concepts": []}

        themes1 = extract_themes(text1, name1)
        themes2 = extract_themes(text2, name2)

        # Find overlapping and diverging concepts
        concepts1 = set(c.lower() for c in themes1.get("key_concepts", []))
        concepts2 = set(c.lower() for c in themes2.get("key_concepts", []))
        shared_concepts = list(concepts1 & concepts2)
        unique_concepts1 = list(concepts1 - concepts2)
        unique_concepts2 = list(concepts2 - concepts1)

        # LLM thematic synthesis
        synthesis = ""
        try:
            synth_prompt = (
                f"Сравни тематику двух документов и сделай вывод (4-6 предложений).\n"
                f"Что объединяет? В чём расходятся взгляды/подходы? Какой общий контекст?\n\n"
                f"Документ 1 ({name1}): тема — {themes1.get('main_theme')}, позиция — {themes1.get('stance')}\n"
                f"Документ 2 ({name2}): тема — {themes2.get('main_theme')}, позиция — {themes2.get('stance')}\n\n"
                f"Тематический анализ:"
            )
            synthesis = llm_service.simple_chat(synth_prompt)
        except Exception as e:
            logger.warning("Thematic synthesis LLM failed: %s", e)

        return {
            "comparison_type": "thematic",
            "doc1_name": name1,
            "doc2_name": name2,
            "doc1_themes": themes1,
            "doc2_themes": themes2,
            "shared_concepts": shared_concepts,
            "unique_to_doc1": unique_concepts1,
            "unique_to_doc2": unique_concepts2,
            "synthesis": synthesis,
            "summary": {
                "shared_concepts_count": len(shared_concepts),
                "unique_doc1_count": len(unique_concepts1),
                "unique_doc2_count": len(unique_concepts2),
            }
        }


comparator = DocumentComparator()
