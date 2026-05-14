from modules.glossary import load_glossary, match_glossary
from modules.prompt_builder import build_prompt
from modules.llm_client import call_llm
import re


def extract_actual_terms(translation: str, glossary_hits: dict) -> dict:
    """
    从译文中提取实际出现的术语形式（支持词形变化）
    """
    actual_terms = {}
    
    for src_term, ref_target in glossary_hits.items():
        # 跳过中文术语（中文不需要词形变化）
        if any('\u4e00' <= char <= '\u9fff' for char in ref_target):
            if ref_target in translation:
                actual_terms[src_term] = ref_target
            else:
                actual_terms[src_term] = ref_target
            continue
        
        # 处理英文术语：支持词形变化匹配
        ref_words = ref_target.lower().split()
        patterns = []
        for word in ref_words:
            stem = word[:5] if len(word) > 5 else word
            patterns.append(r'\b' + re.escape(stem) + r'[a-z]*\b')
        
        pattern = r'\s+'.join(patterns)
        regex = re.compile(pattern, re.IGNORECASE)
        
        match = regex.search(translation)
        if match:
            actual_terms[src_term] = match.group(0)
        else:
            actual_terms[src_term] = ref_target
    
    return actual_terms


def translate_text(
    text: str,
    direction: str,
    base_url: str,
    api_key: str,
    model_id: str,
    temperature: float = 0.3,
    custom_prompt: str = None,
    use_who: bool = True,
    csv_terms: list = None
) -> dict:
    """
    完整的文本翻译流程：术语匹配 → 构造Prompt → 调用LLM
    返回译文和命中术语
    """
    try:
        # 第一步：加载术语表并匹配
        glossary = load_glossary(direction=direction, use_who=use_who)
        # 合并csv_terms，优先级高于WHO，低于手动添加
        if csv_terms:
            for item in csv_terms:
                src = item.get("source_term", "").strip()
                tgt = item.get("target_term", "").strip()
                if src and tgt and src not in glossary:
                    glossary[src] = tgt

        glossary_hits = match_glossary(text, glossary)

        # 第二步：构造Prompt
        prompt = build_prompt(
            text=text,
            direction=direction,
            glossary_hits=glossary_hits,
            custom_prompt=custom_prompt
        )

        # 第三步：调用LLM
        translation = call_llm(
            prompt=prompt,
            base_url=base_url,
            api_key=api_key,
            model_id=model_id,
            temperature=temperature
        )

        # ========== 新增：从译文中提取实际出现的术语形式 ==========
        actual_terms = extract_actual_terms(translation, glossary_hits)

        # 返回两套数据
        return {
            "translation": translation,
            "glossary_hits_actual": actual_terms,      # 实际形式（用于前端高亮）
            "glossary_hits_reference": glossary_hits   # 参考形式（用于前端列表显示）
        }
    except Exception as e:
        print(f"翻译错误: {str(e)}")
        return {
            "error": str(e),
            "translation": "",
            "glossary_hits_actual": {},
            "glossary_hits_reference": {}
        }