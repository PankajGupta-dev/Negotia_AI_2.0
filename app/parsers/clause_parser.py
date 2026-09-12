import re
from typing import Any, Dict, List, Optional, Tuple, Union

# Regex patterns matching common legal document section/clause headers
HEADING_PATTERNS = [
    # Article / Section / § with number/symbol: e.g. "ARTICLE 11", "SECTION 4.1", "§ 11.2", "§11.2"
    re.compile(
        r"^\s*(?:ARTICLE|SECTION|CLAUSE|§)\s*([IVXLCDM\d\.\-]+)[\s.:\-\–—]*(.*)$",
        re.IGNORECASE,
    ),
    # Standard numbered section: e.g. "11.2 Limitation of Liability", "1. DEFINITIONS", "1.1.1 Scope"
    re.compile(r"^\s*(\d+(?:\.\d+)+|\d+\.)\s+([A-Za-z0-9\(\"'].*)$"),
    # Subsections: e.g. "(a) Liability Cap", "(b) Exclusions"
    re.compile(r"^\s*(\([a-z0-9IVXLCDM]+\))\s+([A-Za-z0-9\(\"'].*)$", re.IGNORECASE),
]


def _extract_heading_parts(line: str) -> Optional[Tuple[str, str, str]]:
    """
    Detect if a line contains a clause header pattern.
    Returns (section_number, title, remaining_body_text) if matched, otherwise None.
    """
    line_clean = line.strip()
    if not line_clean:
        return None

    for pattern in HEADING_PATTERNS:
        match = pattern.match(line_clean)
        if match:
            raw_sec = match.group(1).strip()
            rest = match.group(2).strip()

            title = rest
            body_text = ""

            # Attempt to split title from inline body text if separated by period or colon
            inline_split = re.split(r"([.:])\s+(?=[A-Z0-9])", rest, maxsplit=1)
            if len(inline_split) == 3:
                title = (inline_split[0] + inline_split[1]).strip()
                body_text = inline_split[2].strip()
            elif len(rest) > 80:
                title_parts = rest.split(". ", 1)
                if len(title_parts) == 2:
                    title = title_parts[0].strip()
                    body_text = title_parts[1].strip()

            # Normalize section number prefix
            sec_num = raw_sec
            upper_line = line_clean.upper()
            if upper_line.startswith("ARTICLE"):
                sec_num = f"ARTICLE {raw_sec}"
            elif upper_line.startswith("SECTION"):
                sec_num = f"SECTION {raw_sec}"
            elif line_clean.startswith("§"):
                sec_num = f"§{raw_sec}"

            return sec_num, title, body_text

    return None


def parse_clauses(doc_input: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministically segment normalized contract text into structured clause objects.

    Returns a list of clause dictionaries containing:
    - clause_id: unique slug identifier (e.g., 'clause_11_2')
    - section_number: extracted section number (e.g., '§11.2', '11.2', 'ARTICLE 4')
    - title: section title
    - text: full clause text content
    - source_location: dictionary with paragraph_index and page number metadata
    """
    paragraphs: List[Dict[str, Any]] = []

    if isinstance(doc_input, dict):
        raw_paras = doc_input.get("paragraphs", [])
        if raw_paras:
            paragraphs = [
                p if isinstance(p, dict) else {"index": idx, "text": str(p), "page": None}
                for idx, p in enumerate(raw_paras)
            ]
        elif "text" in doc_input:
            text_str = str(doc_input["text"])
            paragraphs = [
                {"index": idx, "text": p.strip(), "page": 1}
                for idx, p in enumerate(text_str.split("\n\n"))
                if p.strip()
            ]
    elif isinstance(doc_input, str):
        paragraphs = [
            {"index": idx, "text": p.strip(), "page": 1}
            for idx, p in enumerate(doc_input.split("\n\n"))
            if p.strip()
        ]
    else:
        raise ValueError("Invalid doc_input format. Expected str or document dictionary.")

    clauses: List[Dict[str, Any]] = []
    current_clause: Optional[Dict[str, Any]] = None

    for para_idx, para in enumerate(paragraphs):
        para_text = para.get("text", "").strip()
        page_num = para.get("page")

        if not para_text:
            continue

        lines = [l.strip() for l in para_text.split("\n") if l.strip()]

        for line in lines:
            heading_info = _extract_heading_parts(line)

            if heading_info:
                sec_num, title, body_text = heading_info

                # Flush previously accumulated clause
                if current_clause and current_clause["_text_parts"]:
                    current_clause["text"] = "\n\n".join(current_clause["_text_parts"]).strip()
                    del current_clause["_text_parts"]
                    if current_clause["text"]:
                        clauses.append(current_clause)

                clean_slug = re.sub(r"[^\w]", "_", sec_num).strip("_").lower()
                clause_id = f"clause_{clean_slug}" if clean_slug else f"clause_{len(clauses)+1}"

                current_clause = {
                    "clause_id": clause_id,
                    "section_number": sec_num,
                    "title": title or f"Section {sec_num}",
                    "text": "",
                    "source_location": {
                        "paragraph_index": para.get("index", para_idx),
                        "page": page_num,
                    },
                    "_text_parts": [line],
                }
            else:
                if current_clause:
                    current_clause["_text_parts"].append(line)
                else:
                    # Initial preamble content
                    current_clause = {
                        "clause_id": f"clause_preamble_{len(clauses)+1}",
                        "section_number": "Preamble",
                        "title": "Recitals & Preamble",
                        "text": "",
                        "source_location": {
                            "paragraph_index": para.get("index", para_idx),
                            "page": page_num,
                        },
                        "_text_parts": [line],
                    }

    # Flush final accumulated clause
    if current_clause and current_clause["_text_parts"]:
        current_clause["text"] = "\n\n".join(current_clause["_text_parts"]).strip()
        del current_clause["_text_parts"]
        if current_clause["text"]:
            clauses.append(current_clause)

    return clauses
