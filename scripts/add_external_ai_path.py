from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text(encoding='utf-8')

text = text.replace(
"  FileJson,\n  LogOut,",
"  Download,\n  FileJson,\n  LogOut,\n  Upload,",
1,
)

text = text.replace(
"  const [model, setModel] = useState<string>(DEFAULT_GEMINI_MODEL);\n  const [estimate, setEstimate] = useState<EstimateResult | null>(null);",
"  const [model, setModel] = useState<string>(DEFAULT_GEMINI_MODEL);\n  const [estimateSource, setEstimateSource] = useState<string>(DEFAULT_GEMINI_MODEL);\n  const [externalJson, setExternalJson] = useState('');\n  const [estimate, setEstimate] = useState<EstimateResult | null>(null);",
1,
)

text = text.replace(
"      const normalized = normalizeEstimate(parseJsonResponse(raw));\n      setEstimate(normalized);\n      setMessage(`AI takeoff draft created with ${normalized.items.length} material lines. Review before saving to Core.`);",
"      const normalized = normalizeEstimate(parseJsonResponse(raw));\n      setEstimate(normalized);\n      setEstimateSource(model);\n      setMessage(`AI takeoff draft created with ${normalized.items.length} material lines. Review before saving to Core.`);",
1,
)

anchor = "  const saveToCore = async () => {\n"
insert = """  const downloadPrompt = () => {\n    if (!selectedScope) return setError('Choose a Forge Scope first.');\n    const blob = new Blob([buildEstimatorPrompt(selectedScope)], { type: 'text/plain' });\n    const anchor = document.createElement('a');\n    anchor.href = URL.createObjectURL(blob);\n    anchor.download = `${selectedScope.title.replace(/[^a-z0-9-_]+/gi, '-') || 'Forge'}-Takeoff-Prompt.txt`;\n    anchor.click();\n    URL.revokeObjectURL(anchor.href);\n    setMessage('Universal takeoff prompt downloaded. Attach it to the same reviewed Scope context in your AI model, then paste the returned JSON here.');\n  };\n\n  const importExternalEstimate = () => {\n    setError('');\n    setMessage('');\n    try {\n      const normalized = normalizeEstimate(parseJsonResponse(externalJson));\n      setEstimate(normalized);\n      setEstimateSource('external-ai');\n      setMessage(`Imported external AI takeoff with ${normalized.items.length} material lines. Review before saving to Core.`);\n    } catch (err: any) {\n      setError(err?.message || 'Could not import that takeoff JSON.');\n    }\n  };\n\n"""
if anchor not in text:
    raise SystemExit('Could not find saveToCore insertion point')
text = text.replace(anchor, insert + anchor, 1)

text = text.replace(
"      const saved = await commitEstimateToCore(workspace.context, selectedScope, estimate, model);",
"      const saved = await commitEstimateToCore(workspace.context, selectedScope, estimate, estimateSource);",
1,
)
text = text.replace(
"    const blob = new Blob([JSON.stringify({ scopeId: selectedScope.id, scopeVersion: selectedScope.currentVersion, model, estimate }, null, 2)], { type: 'application/json' });",
"    const blob = new Blob([JSON.stringify({ scopeId: selectedScope.id, scopeVersion: selectedScope.currentVersion, source: estimateSource, estimate }, null, 2)], { type: 'application/json' });",
1,
)

old = """                      <div className=\"key-grid\">\n                        <label><span>Gemini API key — session only</span><input className=\"input\" type=\"password\" autoComplete=\"off\" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder=\"Paste key; it is not saved to Core\" /></label>\n                        <label><span>Model</span><select className=\"input\" value={model} onChange={event => setModel(event.target.value)}>{GEMINI_MODELS.map(name => <option key={name}>{name}</option>)}</select></label>\n                      </div>\n\n                      <div className=\"notice\"><TriangleAlert size={17} /><div><strong>Estimator review is mandatory.</strong><span>AI receives the structured Scope—not a loose PDF—and must preserve RFIs, Verify fields, exclusions and source uncertainty.</span></div></div>\n\n                      <button className=\"button primary generate\" onClick={() => void generate()} disabled={busy || !apiKey.trim()}>\n                        {busy ? <RefreshCw size={18} className=\"spin\" /> : <Sparkles size={18} />} {busy ? 'Working…' : 'Generate AI Takeoff Draft'}\n                      </button>\n"""
new = """                      <div className=\"ai-path-grid\">\n                        <section className=\"ai-path universal\">\n                          <div className=\"ai-path-heading\"><div><span className=\"eyebrow\">Recommended</span><strong>Use any AI model</strong></div><Download size={18} /></div>\n                          <p>Download the strict Forge takeoff prompt, use it with ChatGPT, Claude, Gemini, Hermes or another capable model, then paste the returned JSON below.</p>\n                          <button className=\"button secondary full\" onClick={downloadPrompt}><Download size={15} /> Download AI Takeoff Prompt</button>\n                          <textarea className=\"input external-json\" value={externalJson} onChange={event => setExternalJson(event.target.value)} placeholder=\"Paste Forge takeoff JSON here…\" />\n                          <button className=\"button primary full\" onClick={importExternalEstimate} disabled={!externalJson.trim()}><Upload size={15} /> Import & Validate JSON</button>\n                        </section>\n\n                        <section className=\"ai-path quick\">\n                          <div className=\"ai-path-heading\"><div><span className=\"eyebrow\">Quick AI</span><strong>Run Gemini in this browser</strong></div><Sparkles size={18} /></div>\n                          <p>Optional convenience path. Your Gemini key stays in this browser session and is never written to Forge Core.</p>\n                          <label><span>Gemini API key — session only</span><input className=\"input\" type=\"password\" autoComplete=\"off\" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder=\"Paste key; it is not saved to Core\" /></label>\n                          <label><span>Model</span><select className=\"input\" value={model} onChange={event => setModel(event.target.value)}>{GEMINI_MODELS.map(name => <option key={name}>{name}</option>)}</select></label>\n                          <button className=\"button secondary full\" onClick={() => void generate()} disabled={busy || !apiKey.trim()}>\n                            {busy ? <RefreshCw size={16} className=\"spin\" /> : <Sparkles size={16} />} {busy ? 'Working…' : 'Generate with Gemini'}\n                          </button>\n                        </section>\n                      </div>\n\n                      <div className=\"notice\"><TriangleAlert size={17} /><div><strong>Estimator review is mandatory.</strong><span>Every AI path uses the same Forge validator and Core takeoff contract. RFIs, Verify fields, exclusions and source uncertainty must remain visible.</span></div></div>\n"""
if old not in text:
    raise SystemExit('Could not find current Gemini generation UI block')
text = text.replace(old, new, 1)

app.write_text(text, encoding='utf-8')

css = Path('src/index.css')
styles = css.read_text(encoding='utf-8')
marker = '.key-grid{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:10px;padding:16px}'
addition = marker + '.ai-path-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;padding:16px}.ai-path{border:1px solid var(--forge-border);background:#101215;border-radius:11px;padding:14px;display:flex;flex-direction:column;gap:10px}.ai-path.universal{border-color:rgba(255,118,23,.24);background:linear-gradient(180deg,rgba(255,118,23,.045),#101215)}.ai-path-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;color:var(--forge-accent)}.ai-path-heading strong{display:block;color:#fff;font-size:12px;margin-top:4px}.ai-path p{font-size:9px;line-height:1.5;color:var(--forge-secondary);margin:0}.ai-path label{display:grid;gap:6px}.ai-path label>span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--forge-secondary);font-weight:900}.external-json{min-height:128px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.45}.ai-path .button.full{margin-top:auto}'
if '.ai-path-grid{' not in styles:
    if marker not in styles:
        raise SystemExit('Could not find Quoter CSS insertion point')
    styles = styles.replace(marker, addition, 1)
styles = styles.replace('@media(max-width:1100px){.metrics-grid', '@media(max-width:1100px){.ai-path-grid{grid-template-columns:1fr}.metrics-grid', 1)
css.write_text(styles, encoding='utf-8')
print('Added universal AI prompt/import path to Forge Quoter.')
