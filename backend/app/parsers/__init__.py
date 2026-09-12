from pathlib import Path
from typing import Any, Dict, List, Union

from app.parsers.clause_parser import parse_clauses
from app.parsers.docx_parser import parse_docx
from app.parsers.pdf_parser import parse_pdf
from app.parsers.text_parser import parse_txt


def extract_document(file_path: Union[str, Path]) -> Dict[str, Any]:
    """Common entry point to extract normalized text and metadata from PDF, DOCX, or TXT documents."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()

    if ext == ".pdf":
        return parse_pdf(path)
    elif ext in (".docx", ".doc"):
        return parse_docx(path)
    elif ext in (".txt", ".md", ".json", ".log"):
        return parse_txt(path)
    else:
        try:
            return parse_txt(path)
        except Exception as err:
            raise ValueError(f"Unsupported document format '{ext}': {err}")


__all__ = [
    "extract_document",
    "parse_clauses",
    "parse_pdf",
    "parse_docx",
    "parse_txt",
]
