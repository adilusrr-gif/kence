from docling.document_converter import DocumentConverter
from pathlib import Path
from typing import Dict, List, Tuple
import difflib
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaEmbeddings
from app.core.config import get_settings
from app.services.ai_settings_service import get_prompt
import json

settings = get_settings()

class DocumentComparator:
    def __init__(self):
        self.converter = DocumentConverter()
        self.embeddings = OllamaEmbeddings(
            model=settings.EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""]
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
                differences_doc2.append(chunk.page_content[:200])

        return {
            "comparison_type": "semantic",
            "doc1_name": Path(doc1_path).name,
            "doc2_name": Path(doc2_path).name,
            "similarities": similarities[:10],  # Топ-10 схожих частей
            "unique_to_doc1": differences_doc1[:10],
            "unique_to_doc2": differences_doc2[:10],
            "summary": {
                "similar_sections": len(similarities),
                "unique_doc1_sections": len(differences_doc1),
                "unique_doc2_sections": len(differences_doc2)
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

        # LLM-промпт для извлечения спецификаций
        from langchain_ollama import OllamaLLM
        llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.1
        )

        extract_prompt = get_prompt("comparison_technical_prompt")

        # Извлекаем спецификации из обоих документов
        spec1_raw = llm.invoke(extract_prompt.format(text=text1[:8000]))
        spec2_raw = llm.invoke(extract_prompt.format(text=text2[:8000]))

        # Парсим JSON
        import re
        def extract_json(text):
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except:
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
            return abs(n1 - n2) < 0.01  # Допуск 1%
        except:
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


comparator = DocumentComparator()
