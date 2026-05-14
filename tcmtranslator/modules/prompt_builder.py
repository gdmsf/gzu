DEFAULT_SYSTEM_PROMPT = """你是一位专业的中医药翻译专家，请将以下文本准确翻译。
翻译要求：
1. 专业术语须使用标准译法
2. 译文须通顺自然，语法完全正确
3. 英文译文必须注意：主谓一致、时态正确、冠词使用恰当、名词单复数正确
4. 使用完整的句子结构，避免残缺句
5. 只输出译文，不要输出任何解释"""

def build_prompt(text: str, direction: str, glossary_hits: dict = None, custom_prompt: str = None) -> str:
    """
    构造完整的翻译Prompt
    
    text: 待翻译文本
    direction: 翻译方向，'zh2en'中译英，'en2zh'英译中
    glossary_hits: 命中的术语字典，如 {'气虚': 'Qi deficiency'}
    custom_prompt: 用户自定义提示词，为空则使用默认
    """
    system = custom_prompt if custom_prompt and custom_prompt.strip() else DEFAULT_SYSTEM_PROMPT
    
    if direction == "zh2en":
        direction_text = "请将以下中文翻译为英文"
        grammar_note = grammar_note = "\n\n【特别注意】英文语法要求：主谓一致、时态正确、冠词(a/an/the)使用恰当、可数名词复数加s\n\n【强制规则】\n1. 术语只能改变形态（原形→-ing/-ed/-s），不能改变单词本身\n   示例：circulate → circulating（正确），circulate → activate（错误，禁止）\n2. 主语中有'and'时，谓语动词必须用are，禁止用is"
    else:
        direction_text = "请将以下英文翻译为中文"
        grammar_note = "\n\n【特别注意】中文语法要求：语序正确、虚词使用恰当、表达自然流畅"
    
    # 如果有命中术语，注入术语约束
    if glossary_hits:
        terms = "\n".join([f"- {src} → {tgt}（参考译法，可根据语法调整词形）" 
                       for src, tgt in glossary_hits.items()])
        glossary_instruction = f"""
        【术语参考】以下为术语参考译法，翻译时优先采用，但必须保证英文语法正确、表达自然流畅。允许对术语译文进行词形变化（如动名词、名词化、加冠词等），不得为迁就术语而破坏句子语法结构：
        {terms}
        """
    
    prompt = f"{system}\n\n{direction_text}{grammar_note}\n{glossary_instruction}\n\n待翻译文本：\n{text}"
    
    return prompt