from openai import OpenAI

def call_llm(prompt: str, base_url: str, api_key: str, model_id: str, temperature: float = 0.3) -> str:
    """
    调用LLM API，发送prompt，返回译文字符串
    """
    client = OpenAI(api_key=api_key, base_url=base_url)
    
    response = client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=temperature
    )
    
    return response.choices[0].message.content