import pandas as pd
import json
import os
import sys

BASE_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if getattr(sys, 'frozen', False):
    BASE_PATH = os.path.join(os.path.dirname(sys.executable), '_internal')
else:
    BASE_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WHO_TERMS_PATH = os.path.join(BASE_PATH, "data", "who_terms.csv")
USER_TERMS_PATH = os.path.join(BASE_PATH, "data", "user_terms.json")


def load_glossary(direction: str = "zh2en", use_who: bool = True) -> dict:
    glossary = {}

    # 只有use_who为True时才加载WHO术语表
    if use_who and os.path.exists(WHO_TERMS_PATH):
        df = pd.read_csv(WHO_TERMS_PATH)
        for _, row in df.iterrows():
            zh = row.get("Chinese term")
            en = row.get("English term")
            if pd.notna(zh) and pd.notna(en):
                if direction == "zh2en":
                    glossary[str(zh).strip()] = str(en).strip()
                else:
                    glossary[str(en).strip()] = str(zh).strip()

    if os.path.exists(USER_TERMS_PATH):
        with open(USER_TERMS_PATH, "r", encoding="utf-8") as f:
            user_terms = json.load(f)
            for item in user_terms:
                src = item.get("source_term", "").strip()
                tgt = item.get("target_term", "").strip()
                if src and tgt:
                    glossary[src] = tgt

    return glossary

def match_glossary(text: str, glossary: dict) -> dict:
    hits_with_pos = []
    text_lower = text.lower()

    for source_term, target_term in glossary.items():
        if len(source_term) < 2:
            continue
        term_lower = source_term.lower()
        idx = text_lower.find(term_lower)
        if idx != -1:
            hits_with_pos.append((idx, len(source_term), source_term, target_term))

    # 先按位置升序，同位置按长度降序
    hits_with_pos.sort(key=lambda x: (x[0], -x[1]))

    # 过滤被更长术语覆盖的短术语
    result = []
    occupied = []  # 记录已占用的位置区间

    for pos, length, source_term, target_term in hits_with_pos:
        end = pos + length
        # 检查是否被已收录的更长术语覆盖
        covered = any(s <= pos and e >= end for s, e in occupied)
        if not covered:
            result.append((pos, source_term, target_term))
            occupied.append((pos, end))

    # 按位置排序输出
    hits = {}
    for _, source_term, target_term in sorted(result, key=lambda x: x[0]):
        hits[source_term] = target_term

    return hits


def add_user_term(source_term: str, target_term: str) -> bool:
    """
    添加用户自定义术语
    """
    user_terms = []

    if os.path.exists(USER_TERMS_PATH):
        with open(USER_TERMS_PATH, "r", encoding="utf-8") as f:
            user_terms = json.load(f)

    # 如果术语已存在则更新，否则新增
    for item in user_terms:
        if item["source_term"] == source_term:
            item["target_term"] = target_term
            break
    else:
        user_terms.append({
            "source_term": source_term,
            "target_term": target_term
        })

    os.makedirs(os.path.join(BASE_PATH, "data"), exist_ok=True)
    with open(USER_TERMS_PATH, "w", encoding="utf-8") as f:
        json.dump(user_terms, f, ensure_ascii=False, indent=2)

    return True


def delete_user_term(source_term: str) -> bool:
    """
    删除用户自定义术语
    """
    if not os.path.exists(USER_TERMS_PATH):
        return False

    with open(USER_TERMS_PATH, "r", encoding="utf-8") as f:
        user_terms = json.load(f)

    original_count = len(user_terms)
    user_terms = [item for item in user_terms if item["source_term"] != source_term]

    with open(USER_TERMS_PATH, "w", encoding="utf-8") as f:
        json.dump(user_terms, f, ensure_ascii=False, indent=2)

    return len(user_terms) < original_count