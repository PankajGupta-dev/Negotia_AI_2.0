from pathlib import Path
from typing import Any, Dict, List, Union
from pypdf import PdfReader


def parse_pdf(file_path: Union[str, Path]) -> Dict[str, Any]:
    """Parse PDF documents (.pdf) into a normalized document structure."""
    path = Path(file_path)
    reader = PdfReader(path)

    paragraphs: List[Dict[str, Any]] = []
    all_texts: List[str] = []
    para_index = 0

    page_count = len(reader.pages)

    for page_num, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        normalized_page_text = page_text.replace("\r\n", "\n").replace("\r", "\n")
        
        page_paras = [p.strip() for p in normalized_page_text.split("\n\n") if p.strip()]
        if not page_paras and normalized_page_text.strip():
            page_paras = [p.strip() for p in normalized_page_text.split("\n") if p.strip()]

        for p_text in page_paras:
            paragraphs.append({
                "index": para_index,
                "text": p_text,
                "page": page_num,
            })
            all_texts.append(p_text)
            para_index += 1

    full_text = "\n\n".join(all_texts)

    return {
        "filename": path.name,
        "file_type": "pdf",
        "text": full_text,
        "paragraphs": paragraphs,
        "metadata": {
            "page_count": page_count,
            "paragraph_count": len(paragraphs),
            "char_count": len(full_text),
        },
    }
