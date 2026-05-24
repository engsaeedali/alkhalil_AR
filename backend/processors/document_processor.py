from docx import Document
import io

class DocumentProcessor:
    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        """
        Reads a DOCX file from bytes and extracts full text from paragraphs and tables.
        Raises an exception if the process fails or if no text is found.
        """
        try:
            doc = Document(io.BytesIO(file_bytes))
            full_text = []
            
            # Extract from paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    full_text.append(para.text.strip())
            
            # Extract from tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = []
                    for cell in row.cells:
                        val = cell.text.strip()
                        if val:
                            # Avoid adjacent duplicates (common in merged cells)
                            if not row_text or row_text[-1] != val:
                                row_text.append(val)
                    if row_text:
                        full_text.append(" | ".join(row_text))
            
            extracted = "\n\n".join(full_text).strip()
            if not extracted:
                raise ValueError("المستند فارغ ولا يحتوي على نصوص في الفقرات أو الجداول.")
            return extracted
        except Exception as e:
            raise RuntimeError(f"فشل معالجة مستند DOCX: {str(e)}")
