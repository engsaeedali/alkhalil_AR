from docx import Document
import io

class DocumentProcessor:
    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        """
        Reads a DOCX file from bytes and extracts full text.
        """
        try:
            doc = Document(io.BytesIO(file_bytes))
            full_text = []
            for para in doc.paragraphs:
                if para.text.strip():
                    full_text.append(para.text.strip())
            return "\n\n".join(full_text)
        except Exception as e:
            return f"Error processing document: {str(e)}"
