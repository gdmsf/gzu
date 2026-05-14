from flask import Flask, request, jsonify, send_from_directory
from modules.translator import translate_text
from modules.glossary import load_glossary, add_user_term, delete_user_term
import os
import pandas as pd
import json
from werkzeug.utils import secure_filename
from modules.file_handler import translate_docx
from flask import send_file
import uuid

import sys

def get_base_path():
    """static和data所在目录（打包后在_internal里）"""
    if getattr(sys, 'frozen', False):
        return os.path.join(os.path.dirname(sys.executable), '_internal')
    return os.path.dirname(os.path.abspath(__file__))

def get_exe_path():
    """uploads和outputs所在目录（打包后在exe同级）"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()
EXE_PATH = get_exe_path()

app = Flask(__name__, static_folder=os.path.join(BASE_PATH, "static"))


# ===== 页面路由 =====

@app.route("/")
def index():
    return send_from_directory(os.path.join(BASE_PATH, "static"), "index.html")


# ===== 翻译接口 =====

@app.route("/api/translate", methods=["POST"])
def api_translate():
    data = request.get_json()

    text = data.get("text", "").strip()
    direction = data.get("direction", "zh2en")
    base_url = data.get("base_url", "")
    api_key = data.get("api_key", "")
    model_id = data.get("model_id", "")
    temperature = float(data.get("temperature", 0.3))
    custom_prompt = data.get("custom_prompt", "")
    use_who = data.get("use_who", True)
    csv_terms = data.get("csv_terms", [])

    if not text:
        return jsonify({"error": "请输入待翻译文本"}), 400
    if not base_url or not api_key or not model_id:
        return jsonify({"error": "请填写完整的模型配置信息"}), 400

    try:
        result = translate_text(
            text=text,
            direction=direction,
            base_url=base_url,
            api_key=api_key,
            model_id=model_id,
            temperature=temperature,
            custom_prompt=custom_prompt,
            use_who=use_who,
            csv_terms=csv_terms 
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===== 术语表接口 =====

@app.route("/api/glossary", methods=["GET"])
def api_get_glossary():
    path = os.path.join(BASE_PATH, "data", "user_terms.json")
    if not os.path.exists(path):
        return jsonify([])
    with open(path, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/glossary", methods=["POST"])
def api_add_term():
    """添加术语"""
    data = request.get_json()
    source_term = data.get("source_term", "").strip()
    target_term = data.get("target_term", "").strip()

    if not source_term or not target_term:
        return jsonify({"error": "源语言术语和目标语言译文不能为空"}), 400

    add_user_term(source_term, target_term)
    return jsonify({"message": "术语添加成功"})


@app.route("/api/glossary/<source_term>", methods=["DELETE"])
def api_delete_term(source_term):
    """删除术语"""
    success = delete_user_term(source_term)
    if success:
        return jsonify({"message": "术语删除成功"})
    return jsonify({"error": "术语不存在"}), 404




@app.route("/api/glossary/upload", methods=["POST"])
def api_upload_glossary():
    if "file" not in request.files:
        return jsonify({"error": "没有收到文件"}), 400
    
    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "只支持CSV格式"}), 400

    try:
        df = pd.read_csv(file)
        if "source_term" in df.columns and "target_term" in df.columns:
            src_col, tgt_col = "source_term", "target_term"
        elif "Chinese term" in df.columns and "English term" in df.columns:
            src_col, tgt_col = "Chinese term", "English term"
        else:
            return jsonify({"error": "CSV需包含source_term/target_term或Chinese term/English term列"}), 400

        terms = []
        for _, row in df.iterrows():
            src = str(row[src_col]).strip()
            tgt = str(row[tgt_col]).strip()
            if src and tgt and src != "nan" and tgt != "nan":
                terms.append({"source_term": src, "target_term": tgt})

        # 直接返回术语列表，不写入文件
        return jsonify({"terms": terms, "count": len(terms)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    




@app.route("/api/translate/file", methods=["POST"])
def api_translate_file():
    if "file" not in request.files:
        return jsonify({"error": "没有收到文件"}), 400

    file = request.files["file"]
    if not file.filename.endswith((".docx", ".txt")):
        return jsonify({"error": "只支持.docx和.txt格式"}), 400

    base_url = request.form.get("base_url", "")
    api_key = request.form.get("api_key", "")
    model_id = request.form.get("model_id", "")
    direction = request.form.get("direction", "zh2en")
    temperature = float(request.form.get("temperature", 0.3))
    custom_prompt = request.form.get("custom_prompt", "")
    use_who = request.form.get("use_who", "true") == "true"
    csv_terms_str = request.form.get("csv_terms", "[]")
    csv_terms = json.loads(csv_terms_str)


    if not base_url or not api_key or not model_id:
        return jsonify({"error": "请填写完整的模型配置信息"}), 400

    # 保存上传文件
    input_filename = f"upload_{uuid.uuid4().hex[:8]}.docx"
    input_path = os.path.join(EXE_PATH, "uploads", input_filename)
    file.save(input_path)

    try:
        from modules.translator import translate_text

        def translate_fn(text):
            result = translate_text(
                text=text,
                direction=direction,
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                temperature=temperature,
                custom_prompt=custom_prompt,
                use_who=use_who,
                csv_terms=csv_terms
            )
            return result["translation"]

        output_path = translate_docx(input_path, translate_fn)

        return send_file(
            output_path,
            as_attachment=True,
            download_name="译文.docx"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        # 清理上传的临时文件
        if os.path.exists(input_path):
            os.remove(input_path)

# ===== 启动 =====

if __name__ == "__main__":
    os.makedirs(os.path.join(EXE_PATH, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(EXE_PATH, "outputs"), exist_ok=True)
    app.run(debug=True, port=5000)