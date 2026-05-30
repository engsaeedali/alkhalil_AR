# -*- coding: utf-8 -*-

import io
import json
import os
import re
from typing import Optional, Tuple

from docx import Document

# صيغ مدعومة لرفع المستندات
ALLOWED_EXTENSIONS = {
    ".docx",
    ".pdf",
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".rtf",
}

EXTENSION_LABELS = {
    ".docx": "Word",
    ".pdf": "PDF",
    ".txt": "نص",
    ".md": "Markdown",
    ".markdown": "Markdown",
    ".json": "JSON",
    ".rtf": "RTF",
}


class DocumentProcessor:
    ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS

    @staticmethod
    def get_extension(filename: str) -> str:
        return os.path.splitext(filename or "")[1].lower()

    @staticmethod
    def is_allowed(filename: str) -> bool:
        return DocumentProcessor.get_extension(filename) in ALLOWED_EXTENSIONS

    @staticmethod
    def allowed_formats_message() -> str:
        exts = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return f"الصيغ المدعومة: {exts}"

    @staticmethod
    def extract_text(file_bytes: bytes, filename: str) -> Tuple[str, str]:
        """
        استخراج النص من الملف حسب امتداده.
        يُرجع: (النص, نوع المصدر)
        """
        ext = DocumentProcessor.get_extension(filename)
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(DocumentProcessor.allowed_formats_message())

        extractors = {
            ".docx": DocumentProcessor.extract_text_from_docx,
            ".pdf": DocumentProcessor.extract_text_from_pdf,
            ".txt": DocumentProcessor.extract_text_from_plain,
            ".md": DocumentProcessor.extract_text_from_plain,
            ".markdown": DocumentProcessor.extract_text_from_plain,
            ".json": DocumentProcessor.extract_text_from_json,
            ".rtf": DocumentProcessor.extract_text_from_rtf,
        }
        text = extractors[ext](file_bytes)
        if not text or not text.strip():
            raise ValueError("المستند فارغ أو لا يحتوي على نص قابل للاستخراج.")
        return text.strip(), EXTENSION_LABELS.get(ext, ext)

    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        """قراءة DOCX — فقرات وجداول."""
        try:
            doc = Document(io.BytesIO(file_bytes))
            full_text = []

            for para in doc.paragraphs:
                if para.text.strip():
                    full_text.append(para.text.strip())

            for table in doc.tables:
                for row in table.rows:
                    row_text = []
                    for cell in row.cells:
                        val = cell.text.strip()
                        if val and (not row_text or row_text[-1] != val):
                            row_text.append(val)
                    if row_text:
                        full_text.append(" | ".join(row_text))

            extracted = "\n\n".join(full_text).strip()
            if not extracted:
                raise ValueError("المستند فارغ ولا يحتوي على نصوص في الفقرات أو الجداول.")
            return extracted
        except ValueError:
            raise
        except Exception as e:
            raise RuntimeError(f"فشل معالجة مستند DOCX: {str(e)}") from e

    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> str:
        """استخراج النص من PDF (نصي — وليس مسحاً ضوئياً)."""
        try:
            from pypdf import PdfReader
        except ImportError as e:
            raise RuntimeError(
                "مكتبة pypdf غير مثبتة على الخادم. شغّل: pip install pypdf"
            ) from e

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages = []
            for i, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text() or ""
                except Exception:
                    page_text = ""
                page_text = page_text.strip()
                if page_text:
                    pages.append(page_text)

            if not pages:
                raise ValueError(
                    "تعذر استخراج نص من PDF. قد يكون الملف ممسوحاً ضوئياً (صورة) "
                    "أو محمياً — استخدم Word أو نصاً قابلاً للتحديد."
                )

            return "\n\n".join(pages)
        except ValueError:
            raise
        except Exception as e:
            raise RuntimeError(f"فشل معالجة PDF: {str(e)}") from e

    @staticmethod
    def extract_text_from_plain(file_bytes: bytes) -> str:
        """TXT / Markdown — مع دعم ترميزات عربية شائعة."""
        for encoding in ("utf-8-sig", "utf-8", "cp1256", "windows-1256", "iso-8859-6", "latin-1"):
            try:
                return file_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        return file_bytes.decode("utf-8", errors="replace")

    @staticmethod
    def extract_text_from_json(file_bytes: bytes) -> str:
        """JSON — تنسيق Docx_to_JSON أو نص خام."""
        raw = DocumentProcessor.extract_text_from_plain(file_bytes)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return raw

        if isinstance(payload, dict):
            try:
                from processors.json_document_parser import parse_doc_json_payload, blocks_to_text
                blocks = parse_doc_json_payload(payload)
                return blocks_to_text(blocks)
            except Exception:
                pass
            if isinstance(payload.get("text"), str):
                return payload["text"]
            return json.dumps(payload, ensure_ascii=False, indent=2)
        if isinstance(payload, list):
            return json.dumps(payload, ensure_ascii=False, indent=2)
        return raw

    @staticmethod
    def extract_text_from_rtf(file_bytes: bytes) -> str:
        """RTF — عبر striprtf أو تنظيف بسيط."""
        try:
            from striprtf.striprtf import rtf_to_text
            raw = file_bytes.decode("cp1256", errors="replace")
            return rtf_to_text(raw)
        except ImportError:
            raw = file_bytes.decode("utf-8", errors="replace")
            text = re.sub(r"\\[a-z]+\d*\s?", "", raw)
            text = re.sub(r"[{}]", "", text)
            text = re.sub(r"\s+", " ", text)
            return text.strip()
