// ===== localStorage：模型配置 =====

const CONFIG_KEYS = ["base_url", "api_key", "model_id", "temperature", "custom_prompt"]

function saveConfig() {
    CONFIG_KEYS.forEach(key => {
        const el = document.getElementById(key)
        if (el) localStorage.setItem(key, el.value)
    })
}

function loadConfig() {
    CONFIG_KEYS.forEach(key => {
        const el = document.getElementById(key)
        const saved = localStorage.getItem(key)
        if (el && saved !== null) {
            el.value = saved
            if (key === "temperature") {
                document.getElementById("temp_val").innerText = saved
            }
        }
    })
}

CONFIG_KEYS.forEach(key => {
    const el = document.getElementById(key)
    if (el) el.addEventListener("input", saveConfig)
})


// ===== CSV术语表：只存内存 =====

let csvTerms = []

function renderCsvTerms() {
    const box = document.getElementById("csv_term_info")
    if (csvTerms.length > 0) {
        box.innerText = `已载入CSV术语 ${csvTerms.length} 条（刷新后清空）`
        box.style.color = "#2c4a2e"
    } else {
        box.innerText = ""
    }
}

async function uploadCSV() {
    const fileInput = document.getElementById("csv_file")
    const file = fileInput.files[0]
    if (!file) { alert("请先选择CSV文件"); return }

    const formData = new FormData()
    formData.append("file", file)

    try {
        const res = await fetch("/api/glossary/upload", {
            method: "POST",
            body: formData
        })
        const data = await res.json()
        if (data.error) {
            alert("导入失败：" + data.error)
        } else {
            csvTerms = data.terms
            alert(`成功载入 ${data.count} 条术语，刷新页面后将清空`)
            fileInput.value = ""
            renderCsvTerms()
        }
    } catch (e) {
        alert("上传失败，请检查后端是否启动")
    }
}


// ===== 术语高亮 =====

// 常见英文词停用词列表，这些词不做高亮
const STOP_WORDS = new Set([
    'pattern', 'blood', 'disease', 'syndrome', 'symptom',
    'heat', 'cold', 'wind', 'fire', 'water', 'wood', 'metal', 'earth',
    'heart', 'liver', 'lung', 'kidney', 'spleen',
    'qi', 'yin', 'yang', 'the', 'and', 'with', 'from'
])


function highlightTerms(text, glossaryHits) {
    if (!glossaryHits || Object.keys(glossaryHits).length === 0) {
        return escapeHtml(text)
    }

    let result = text
    const placeholders = []

    // 构建术语列表，按译文长度降序排序（优先匹配长术语）
    const termsList = Object.entries(glossaryHits)
        .sort((a, b) => b[1].length - a[1].length)

    termsList.forEach(([sourceTerm, targetTerm], index) => {
        const placeholder = `%%TERM_${index}%%`
        // 转义正则特殊字符
        const escaped = targetTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // 使用精确匹配（因为后端已经返回了实际在译文中出现的形式）
        const regex = new RegExp(`(${escaped})`, 'g')

        placeholders.push({
            placeholder,
            targetTerm,
            sourceTerm
        })

        result = result.replace(regex, placeholder)
    })

    // 转义HTML
    result = escapeHtml(result)

    // 还原占位符为高亮span，添加鼠标悬停显示中文原文
    placeholders.forEach(({ placeholder, targetTerm, sourceTerm }) => {
        const escapedTarget = escapeHtml(targetTerm)
        // 构建悬停提示文本：中文术语 → 参考译文
        const hoverText = `${sourceTerm} → ${targetTerm}`

        const placeholderRegex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        result = result.replace(
            placeholderRegex,
            `<span class="highlight" title="${escapeHtml(hoverText)}">${escapedTarget}</span>`
        )
    })

    return result
}

// 转义HTML特殊字符
function escapeHtml(text) {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(text))
    return div.innerHTML
}


// ===== 复制译文 =====

function copyTranslation() {
    const text = document.getElementById("output_text").value
    if (!text) { alert("没有可复制的译文"); return }

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById("copy_btn")
        btn.innerText = "已复制"
        setTimeout(() => { btn.innerText = "复制译文" }, 1500)
    }).catch(() => {
        // 兼容不支持clipboard API的浏览器
        const textarea = document.getElementById("output_text")
        textarea.style.display = "block"
        textarea.select()
        document.execCommand("copy")
        textarea.style.display = "none"
        const btn = document.getElementById("copy_btn")
        btn.innerText = "已复制"
        setTimeout(() => { btn.innerText = "复制译文" }, 1500)
    })
}


// ===== 翻译历史 =====

const MAX_HISTORY = 15


function saveHistory(inputText, translation, direction, glossaryHits) {
    let history = JSON.parse(localStorage.getItem("translate_history") || "[]")
    history.unshift({
        time: new Date().toLocaleString("zh-CN"),
        direction: direction,
        input: inputText,
        output: translation,
        hits_actual: glossaryHits.actual || {},
        hits_reference: glossaryHits.reference || {}
    })
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY)
    localStorage.setItem("translate_history", JSON.stringify(history))
    renderHistory()
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem("translate_history") || "[]")
    const list = document.getElementById("history_list")
    list.innerHTML = ""

    if (history.length === 0) {
        list.innerHTML = '<div style="font-size:13px;color:#aaa;padding:8px 0">暂无翻译历史</div>'
        return
    }

    history.forEach((item, index) => {
        const div = document.createElement("div")
        div.className = "history-item"
        div.innerHTML = `
      <div class="history-item-header">
        <span class="history-time">${item.time} · ${item.direction === "zh2en" ? "中→英" : "英→中"}</span>
        <button class="history-delete-btn" onclick="deleteHistory(${index}, event)">删除</button>
      </div>
      <div class="history-preview" onclick="restoreHistory(${index})">${escapeHtml(item.input)}</div>
      <div class="history-translation" onclick="restoreHistory(${index})">${escapeHtml(item.output)}</div>
    `
        list.appendChild(div)
    })
}

function deleteHistory(index, event) {
    event.stopPropagation()
    let history = JSON.parse(localStorage.getItem("translate_history") || "[]")
    history.splice(index, 1)
    localStorage.setItem("translate_history", JSON.stringify(history))
    renderHistory()
}

function restoreHistory(index) {
    const history = JSON.parse(localStorage.getItem("translate_history") || "[]")
    const item = history[index]
    if (!item) return

    document.getElementById("input_text").value = item.input
    document.getElementById("direction").value = item.direction

    const display = document.getElementById("output_display")
    const hidden = document.getElementById("output_text")
    hidden.value = item.output

    // 恢复命中术语展示
    const hitsActual = item.hits_actual || {}
    const hitsReference = item.hits_reference || {}

    // 过滤用于显示的术语
    const referenceEntries = Object.entries(hitsReference).filter(([src, tgt]) => {
        const isChinese = /[\u4e00-\u9fa5]/.test(tgt)
        if (isChinese) return tgt.length >= 2
        if (STOP_WORDS.has(tgt.toLowerCase())) return false
        return tgt.length >= 5
    })

    // 高亮使用实际形态
    display.innerHTML = highlightTerms(item.output, hitsActual)

    // 列表显示使用原始参考译文
    if (referenceEntries.length > 0) {
        const hitsText = referenceEntries.map(([k, v]) => `${k} → ${v}`).join("　")
        document.getElementById("hits_content").innerText = hitsText
        document.getElementById("glossary_hits").style.display = "block"
    } else {
        document.getElementById("glossary_hits").style.display = "none"
    }
}

function clearHistory() {
    if (!confirm("确定清空所有翻译历史吗？")) return
    localStorage.removeItem("translate_history")
    renderHistory()
}


// ===== 翻译文本 =====

async function translateText() {
    const text = document.getElementById("input_text").value.trim()
    const base_url = document.getElementById("base_url").value.trim()
    const api_key = document.getElementById("api_key").value.trim()
    const model_id = document.getElementById("model_id").value.trim()
    const direction = document.getElementById("direction").value
    const temperature = parseFloat(document.getElementById("temperature").value)
    const custom_prompt = document.getElementById("custom_prompt").value.trim()
    const use_who = document.getElementById("use_who").checked

    if (!text) { alert("请输入待翻译文本"); return }
    if (!base_url || !api_key || !model_id) { alert("请填写完整的模型配置信息"); return }

    const btn = document.getElementById("translate_btn")
    btn.disabled = true
    btn.innerText = "翻译中..."

    const display = document.getElementById("output_display")
    const hidden = document.getElementById("output_text")
    display.innerHTML = ""
    hidden.value = ""
    document.getElementById("glossary_hits").style.display = "none"

    try {
        const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text, direction, base_url, api_key, model_id,
                temperature, custom_prompt, use_who,
                csv_terms: csvTerms
            })
        })
        const data = await res.json()

        if (data.error) {
            alert("错误：" + data.error)
        } else {
            const translation = data.translation

            // ✅ 修改点1：接收两套数据
            // 用于高亮：实际出现在译文中的形态
            const hitsForHighlight = data.glossary_hits_actual || data.glossary_hits || {}
            // 用于列表显示：术语表中的原始参考译文
            const hitsForDisplay = data.glossary_hits_reference || data.glossary_hits || {}

            // 更新隐藏textarea用于复制
            hidden.value = translation

            // ✅ 修改点2：过滤用于高亮的术语
            const hitsEntriesForHighlight = Object.entries(hitsForHighlight || {}).filter(([src, tgt]) => {
                const isChinese = /[\u4e00-\u9fa5]/.test(tgt)
                if (isChinese) return tgt.length >= 2
                if (STOP_WORDS.has(tgt.toLowerCase())) return false
                return tgt.length >= 5
            })
            const filteredHitsForHighlight = Object.fromEntries(hitsEntriesForHighlight)

            // ✅ 修改点3：过滤用于列表显示的术语（使用原始参考译文）
            const hitsEntriesForDisplay = Object.entries(hitsForDisplay || {}).filter(([src, tgt]) => {
                const isChinese = /[\u4e00-\u9fa5]/.test(tgt)
                if (isChinese) return tgt.length >= 2
                if (STOP_WORDS.has(tgt.toLowerCase())) return false
                return tgt.length >= 5
            })

            // ✅ 修改点4：高亮时使用实际形态
            display.innerHTML = highlightTerms(translation, filteredHitsForHighlight)

            // ✅ 修改点5：列表显示时使用原始参考译文
            if (hitsEntriesForDisplay.length > 0) {
                const hitsText = hitsEntriesForDisplay.map(([k, v]) => `${k} → ${v}`).join("　")
                document.getElementById("hits_content").innerText = hitsText
                document.getElementById("glossary_hits").style.display = "block"
            } else {
                document.getElementById("glossary_hits").style.display = "none"
            }

            // ✅ 修改点6：保存历史时同时保存两套数据
            saveHistory(text, translation, direction, {
                actual: filteredHitsForHighlight,
                reference: hitsForDisplay
            })
        }
    } catch (e) {
        alert("请求失败，请检查后端是否启动")
        console.error(e)
    } finally {
        btn.disabled = false
        btn.innerText = "翻译"
    }
}


// ===== 术语表管理 =====

async function loadTerms() {
    const res = await fetch("/api/glossary")
    const terms = await res.json()
    const list = document.getElementById("term_list")
    list.innerHTML = ""
    terms.forEach(item => {
        const div = document.createElement("div")
        div.className = "term-item"
        div.innerHTML = `
      <span>${escapeHtml(item.source_term)} → ${escapeHtml(item.target_term)}</span>
      <button onclick="deleteTerm('${item.source_term.replace(/'/g, "\\'")}')">删除</button>
    `
        list.appendChild(div)
    })
}

async function addTerm() {
    const source_term = document.getElementById("new_source").value.trim()
    const target_term = document.getElementById("new_target").value.trim()

    if (!source_term || !target_term) { alert("术语和译文不能为空"); return }

    await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_term, target_term })
    })

    document.getElementById("new_source").value = ""
    document.getElementById("new_target").value = ""
    loadTerms()
}

async function deleteTerm(source_term) {
    await fetch(`/api/glossary/${encodeURIComponent(source_term)}`, { method: "DELETE" })
    loadTerms()
}




// ===== 文件翻译 =====

let translatedBlob = null
let translateStartTime = null

// ===== 文件选择：点击选择 =====
function handleFileSelect(input) {
    if (input.files.length > 0) {
        showSelectedFile(input.files[0])
    }
}

// ===== 文件选择：拖拽悬停 =====
function handleDragOver(event) {
    event.preventDefault()
    document.getElementById("file_upload_area").classList.add("dragover")
}

// ===== 文件选择：拖拽放下 =====
function handleDrop(event) {
    event.preventDefault()
    document.getElementById("file_upload_area").classList.remove("dragover")
    const file = event.dataTransfer.files[0]
    if (file) {
        const input = document.getElementById("translate_file")
        const dt = new DataTransfer()
        dt.items.add(file)
        input.files = dt.files
        showSelectedFile(file)
    }
}

// ===== 显示已选择的文件名 =====
function showSelectedFile(file) {
    const nameDisplay = document.getElementById("file_name_display")
    nameDisplay.innerText = `📄 ${file.name}`
    nameDisplay.style.display = "inline-block"

    resetDownloadBtn()
    document.getElementById("file_log_area").style.display = "none"
    translatedBlob = null
}

// ===== 更新日志文字 =====
function updateLog(text) {
    const logEl = document.getElementById("file_log_text")
    logEl.innerHTML += escapeHtml(text) + "<br>"
}

// ===== 显示进度条 =====
function showProgressBar() {
    const wrap = document.getElementById("progress_bar_wrap")
    const inner = document.getElementById("progress_bar_inner")
    wrap.style.display = "block"
    inner.classList.add("loading")
}

// ===== 停止进度条 =====
function stopProgressBar(success) {
    const inner = document.getElementById("progress_bar_inner")
    inner.classList.remove("loading")
    inner.style.width = "100%"
    inner.style.background = success ? "#2c4a2e" : "#a04040"
}

// ===== 重置下载按钮状态 =====
function resetDownloadBtn() {
    const btn = document.getElementById("file_download_btn")
    btn.disabled = true
    btn.classList.remove("active")
}

// ===== 激活下载按钮 =====
function activateDownloadBtn() {
    const btn = document.getElementById("file_download_btn")
    btn.disabled = false
    btn.classList.add("active")
}

// ===== 开始翻译 =====
async function translateFile() {
    const fileInput = document.getElementById("translate_file")
    const file = fileInput.files[0]

    if (!file) {
        alert("请先选择文件")
        return
    }

    const base_url = document.getElementById("base_url").value.trim()
    const api_key = document.getElementById("api_key").value.trim()
    const model_id = document.getElementById("model_id").value.trim()
    if (!base_url || !api_key || !model_id) {
        alert("请填写完整的模型配置信息")
        return
    }

    const translateBtn = document.getElementById("file_translate_btn")
    const logArea = document.getElementById("file_log_area")
    const logText = document.getElementById("file_log_text")
    const resultText = document.getElementById("file_result_text")

    translateBtn.disabled = true
    translateBtn.innerText = "翻译中..."
    logArea.style.display = "block"
    logText.innerHTML = ""
    resultText.style.display = "none"
    translatedBlob = null
    resetDownloadBtn()

    showProgressBar()
    updateLog("正在读取文件...")
    updateLog(`文件名：${file.name}`)
    updateLog("正在调用翻译模型，请稍候...")

    translateStartTime = Date.now()

    const formData = new FormData()
    formData.append("file", file)
    formData.append("base_url", base_url)
    formData.append("api_key", api_key)
    formData.append("model_id", model_id)
    formData.append("direction", document.getElementById("direction").value)
    formData.append("temperature", document.getElementById("temperature").value)
    formData.append("custom_prompt", document.getElementById("custom_prompt").value)
    formData.append("use_who", document.getElementById("use_who").checked)
    formData.append("csv_terms", JSON.stringify(csvTerms))

    try {
        const res = await fetch("/api/translate/file", {
            method: "POST",
            body: formData
        })

        if (!res.ok) {
            const data = await res.json()
            const elapsed = ((Date.now() - translateStartTime) / 1000).toFixed(1)
            stopProgressBar(false)
            updateLog(`错误：${data.error}`)
            resultText.innerText = `翻译失败，用时 ${elapsed} 秒`
            resultText.className = "file-result-text error"
            resultText.style.display = "block"
            return
        }

        translatedBlob = await res.blob()
        const elapsed = ((Date.now() - translateStartTime) / 1000).toFixed(1)

        stopProgressBar(true)
        updateLog("翻译完成，译文文件已生成")

        resultText.innerText = `✓ 翻译成功！用时 ${elapsed} 秒`
        resultText.className = "file-result-text success"
        resultText.style.display = "block"

        activateDownloadBtn()

    } catch (e) {
        const elapsed = ((Date.now() - translateStartTime) / 1000).toFixed(1)
        stopProgressBar(false)
        updateLog("网络请求失败，请检查后端是否启动")
        resultText.innerText = `翻译失败，用时 ${elapsed} 秒`
        resultText.className = "file-result-text error"
        resultText.style.display = "block"
    } finally {
        translateBtn.disabled = false
        translateBtn.innerText = "▶ 开始翻译"
    }
}

// ===== 下载译文 =====
function downloadFile() {
    if (!translatedBlob) {
        alert("请先完成翻译")
        return
    }

    const url = window.URL.createObjectURL(translatedBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = "译文.docx"
    a.click()
    window.URL.revokeObjectURL(url)
}


// ===== 页面加载 =====

window.onload = function () {
    loadConfig()
    loadTerms()
    renderCsvTerms()
    renderHistory()

    document.getElementById("csv_file").addEventListener("change", function () {
        if (this.files.length > 0) uploadCSV()
    })
}