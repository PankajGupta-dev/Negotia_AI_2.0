from pathlib import Path
from typing import Any, Dict, List, Union


def parse_txt(file_path: Union[str, Path]) -> Dict[str, Any]:
    """Parse plain text files (.txt) into a normalized document structure."""
    path = Path(file_path)
    content = ""
    
    # Attempt reading with UTF-8, fallback to Latin-1
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = path.read_text(encoding="latin-1")

    # Normalize newlines
    normalized_content = content.replace("\r\n", "\n").replace("\r", "\n")
    
    # Split into non-empty paragraphs
    raw_paragraphs = [p.strip() for p in normalized_content.split("\n\n") if p.strip()]
    if not raw_paragraphs and normalized_content.strip():
        raw_paragraphs = [p.strip() for p in normalized_content.split("\n") if p.strip()]

    paragraphs: List[Dict[str, Any]] = [
        {"index": idx, "text": para_text, "page": 1}
        for idx, para_text in enumerate(raw_paragraphs)
    ]

    full_text = "\n\n".join(raw_paragraphs)

    return {
        "filename": path.name,
        "file_type": "txt",
        "text": full_text,
        "paragraphs": paragraphs,
        "metadata": {
            "page_count": 1,
            "paragraph_count": len(paragraphs),
            "char_count": len(full_text),
        },
    }
