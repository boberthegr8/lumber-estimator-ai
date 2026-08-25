import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  FileJson,
  LogOut,
  Upload,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WandSparkles
} from 'lucide-react';
import {
  commitEstimateToCore,
  CoreScope,
  EstimateResult,
  getForgeCoreClient,
  loadQuoterWorkspace,
  QuoterWorkspace,
  sendQuoterMagicLink,
  signOutQuoter
} from './forgeCore';
import {
  buildEstimatorPrompt,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  normalizeEstimate
} from './estimatingPrompt';

const OWNER_EMAIL = 'rob.flagg1234@gmail.com';

function fmtDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function parseJsonResponse(raw: string): any {
  let text = String(raw || '').trim();
  if (!text) throw new Error('AI returned no takeoff JSON.');
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('AI response was not valid JSON.');
  }
}

function scopeAttentionCount(scope: CoreScope) {
  const fields = scope.structuredData?.fields || {};
  return Object.values(fields).filter((field: any) => ['RFI', 'Verify'].includes(String(field?.status || ''))).length;
}

function SuiteNav() {
  return (
    <nav className="suite-nav">
      <div className="suite-label">Forge Suite</div>
      <a className="suite-link" href="https://forge-crm-six.vercel.app"><span>CRM</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://robquotes.vercel.app"><span>Reader</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://forge-scope.vercel.app"><span>Scope</span><ArrowUpRight size={13} /></a>
      <div className="suite-link active"><span>Quote / AI Quoter</span><span className="suite-dot" /></div>
    </nav>
  );
}

const Metric = ({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) => (
  <div className="metric-card">
    <div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
    <div className="metric-icon">{icon}</div>
  </div>
);

const ScopeRow = ({ scope, active, onClick }: { scope: CoreScope; active: boolean; onClick: () => void }) => {
  const attention = scopeAttentionCount(scope);
  return (
    <button type="button" className={`scope-row ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="scope-row-main">
        <div className="scope-row-title">{scope.title}</div>
        <div className="scope-row-meta">{scope.customerName || 'Unassigned customer'} • {scope.projectName || 'No project'}</div>
        <div className="scope-row-meta">{scope.scopeType || 'Scope'} • Core v{scope.currentVersion} • {fmtDate(scope.updatedAt)}</div>
      </div>
      {attention > 0 ? <span className="attention-pill">{attention} verify</span> : <CheckCircle2 size={15} className="ok-icon" />}
    </button>
  );
};

const App: React.FC = () => {
  const [workspace, setWorkspace] = useState<QuoterWorkspace>({ context: null, scopes: [], takeoffs: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(OWNER_EMAIL);
  const [query, setQuery] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [estimateSource, setEstimateSource] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [externalJson, setExternalJson] = useState('');
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await loadQuoterWorkspace();
      setWorkspace(next);
      setScopeId(current => current && next.scopes.some(scope => scope.id === current)
        ? current
        : next.scopes[0]?.id || '');
    } catch (err: any) {
      setError(err?.message || 'Forge Quoter could not load Core.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void refresh();
    void getForgeCoreClient().then(client => {
      const listener = client.auth.onAuthStateChange(() => window.setTimeout(() => void refresh(), 0));
      unsubscribe = () => listener?.data?.subscription?.unsubscribe?.();
    });
    return () => unsubscribe?.();
  }, []);

  const connected = Boolean(workspace.context?.organizationId);
  const selectedScope = useMemo(() => workspace.scopes.find(scope => scope.id === scopeId) || null, [workspace.scopes, scopeId]);
  const filteredScopes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workspace.scopes;
    return workspace.scopes.filter(scope =>
      [scope.title, scope.customerName, scope.projectName, scope.scopeType]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );
  }, [workspace.scopes, query]);

  const categories = useMemo(() => {
    if (!estimate) return [] as [string, EstimateResult['items']][];
    const grouped = new Map<string, EstimateResult['items']>();
    estimate.items.forEach(item => {
      const key = item.category || 'Other';
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return Array.from(grouped.entries());
  }, [estimate]);

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await sendQuoterMagicLink(email);
      setMessage('Passwordless Forge sign-in link sent. Open it on this device, then return to Quoter.');
    } catch (err: any) {
      setError(err?.message || 'Could not send Forge sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutQuoter();
      setWorkspace({ context: null, scopes: [], takeoffs: [] });
      setEstimate(null);
      setMessage('Signed out of Forge Core.');
    } catch (err: any) {
      setError(err?.message || 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!selectedScope) return setError('Choose a Forge Scope first.');
    if (!apiKey.trim()) return setError('Paste your Gemini API key for this browser session.');
    setBusy(true);
    setError('');
    setMessage('');
    setEstimate(null);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim()
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildEstimatorPrompt(selectedScope) }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Gemini request failed (${response.status}).`);
      const raw = (payload.candidates || [])
        .flatMap((candidate: any) => candidate.content?.parts || [])
        .map((part: any) => part.text || '')
        .join('\n')
        .trim();
      const normalized = normalizeEstimate(parseJsonResponse(raw));
      setEstimate(normalized);
      setEstimateSource(model);
      setMessage(`AI takeoff draft created with ${normalized.items.length} material lines. Review before saving to Core.`);
    } catch (err: any) {
      setError(err?.message || 'AI takeoff generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPrompt = () => {
    if (!selectedScope) return setError('Choose a Forge Scope first.');
    const blob = new Blob([buildEstimatorPrompt(selectedScope)], { type: 'text/plain' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${selectedScope.title.replace(/[^a-z0-9-_]+/gi, '-') || 'Forge'}-Takeoff-Prompt.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setMessage('Universal takeoff prompt downloaded. Attach it to the same reviewed Scope context in your AI model, then paste the returned JSON here.');
  };

  const importExternalEstimate = () => {
    setError('');
    setMessage('');
    try {
      const normalized = normalizeEstimate(parseJsonResponse(externalJson));
      setEstimate(normalized);
      setEstimateSource('external-ai');
      setMessage(`Imported external AI takeoff with ${normalized.items.length} material lines. Review before saving to Core.`);
    } catch (err: any) {
      setError(err?.message || 'Could not import that takeoff JSON.');
    }
  };

  const saveToCore = async () => {
    if (!workspace.context?.organizationId || !selectedScope || !estimate) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await commitEstimateToCore(workspace.context, selectedScope, estimate, estimateSource);
      setMessage(`Saved to Forge Core as takeoff ${saved.takeoffId.slice(0, 8)}… with ${saved.itemCount} lines.`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not save the AI takeoff to Forge Core.');
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    if (!estimate || !selectedScope) return;
    const blob = new Blob([JSON.stringify({ scopeId: selectedScope.id, scopeVersion: selectedScope.currentVersion, source: estimateSource, estimate }, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${selectedScope.title.replace(/[^a-z0-9-_]+/gi, '-') || 'Forge'}-AI-Takeoff.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <div className="quoter-shell">
      <aside className="quoter-sidebar">
        <div className="brand-block">
          <div className="brand-logo">F</div>
          <div><div className="brand-name">FORGE</div><div className="brand-module">Quote / AI Quoter</div></div>
        </div>
        <SuiteNav />

        <div className="sidebar-section-label">Quoter</div>
        <div className="sidebar-item active"><WandSparkles size={17} /><span>Takeoff Workspace</span></div>
        <div className="sidebar-item muted"><Boxes size={17} /><span>Pricing</span><span className="sidebar-next">Next</span></div>
        <div className="sidebar-item muted"><ClipboardList size={17} /><span>Quote Builder</span><span className="sidebar-next">Next</span></div>

        <div className="sidebar-spacer" />
        <div className="core-card">
          <div className="core-title"><ShieldCheck size={15} /> Forge Core</div>
          <div className="core-meta">{connected ? workspace.context?.organizationName : 'Not connected'}</div>
          <div className="core-meta">{connected ? workspace.context?.locationName || 'Organization-wide' : 'Passwordless owner session'}</div>
        </div>
      </aside>

      <main className="quoter-main">
        <header className="quoter-header">
          <div>
            <div className="eyebrow">Forge Quote / AI Quoter</div>
            <h1>Scope → material takeoff</h1>
            <p>Generate a structured draft from Forge Scope, review it, then commit it to Core.</p>
          </div>
          <div className="header-actions">
            {connected && <button className="button secondary" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>}
            {connected && <button className="button secondary" onClick={() => void signOut()} disabled={busy}><LogOut size={15} /> Sign out</button>}
          </div>
        </header>

        <div className="quoter-content">
          {error && <div className="alert danger">{error}</div>}
          {message && <div className="alert success">{message}</div>}

          {!connected ? (
            <section className="auth-card">
              <div className="auth-icon"><ShieldCheck size={26} /></div>
              <div className="eyebrow">Forge Core</div>
              <h2>Connect Quoter to Forge</h2>
              <p>Use the same Forge owner identity as CRM, Reader and Scope. No separate Quoter account is created.</p>
              {workspace.context && !workspace.context.organizationId ? (
                <div className="alert warning">This identity is signed in but does not have an active Forge organization membership.</div>
              ) : (
                <div className="auth-form">
                  <label>Forge owner email</label>
                  <input value={email} onChange={event => setEmail(event.target.value)} type="email" className="input" />
                  <button className="button primary full" onClick={() => void sendLink()} disabled={busy || !email.trim()}>Send passwordless sign-in link</button>
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="metrics-grid">
                <Metric label="Core Scopes" value={workspace.scopes.length} icon={<ClipboardList size={18} />} />
                <Metric label="Saved AI Takeoffs" value={workspace.takeoffs.length} icon={<Boxes size={18} />} />
                <Metric label="Current Draft Lines" value={estimate?.items.length || 0} icon={<Sparkles size={18} />} />
                <Metric label="Scope Version" value={selectedScope ? `v${selectedScope.currentVersion}` : '—'} icon={<ShieldCheck size={18} />} />
              </section>

              <section className="workspace-grid">
                <div className="panel scope-panel">
                  <div className="panel-heading">
                    <div><div className="eyebrow">1. Core input</div><h2>Choose reviewed Scope</h2></div>
                    <a href="https://forge-scope.vercel.app" target="_blank" rel="noreferrer">Open Scope <ArrowUpRight size={13} /></a>
                  </div>
                  <div className="search-wrap"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search scope, customer, project…" /></div>
                  <div className="scope-list">
                    {filteredScopes.length ? filteredScopes.map(scope => <ScopeRow key={scope.id} scope={scope} active={scope.id === scopeId} onClick={() => { setScopeId(scope.id); setEstimate(null); setMessage(''); setError(''); }} />) : <div className="empty">No Core scopes match this search.</div>}
                  </div>
                </div>

                <div className="panel generator-panel">
                  <div className="panel-heading">
                    <div><div className="eyebrow">2. AI generation</div><h2>{selectedScope?.title || 'Select a Scope'}</h2></div>
                    {selectedScope && <span className="version-pill">Core v{selectedScope.currentVersion}</span>}
                  </div>

                  {selectedScope ? (
                    <>
                      <div className="scope-context-grid">
                        <div><span>Customer</span><strong>{selectedScope.customerName || 'Unassigned'}</strong></div>
                        <div><span>Project</span><strong>{selectedScope.projectName || selectedScope.title}</strong></div>
                        <div><span>Type</span><strong>{selectedScope.scopeType || 'Scope'}</strong></div>
                        <div><span>Needs attention</span><strong className={scopeAttentionCount(selectedScope) ? 'warn-text' : ''}>{scopeAttentionCount(selectedScope) || 'None flagged'}</strong></div>
                      </div>

                      <div className="ai-path-grid">
                        <section className="ai-path universal">
                          <div className="ai-path-heading"><div><span className="eyebrow">Recommended</span><strong>Use any AI model</strong></div><Download size={18} /></div>
                          <p>Download the strict Forge takeoff prompt, use it with ChatGPT, Claude, Gemini, Hermes or another capable model, then paste the returned JSON below.</p>
                          <button className="button secondary full" onClick={downloadPrompt}><Download size={15} /> Download AI Takeoff Prompt</button>
                          <textarea className="input external-json" value={externalJson} onChange={event => setExternalJson(event.target.value)} placeholder="Paste Forge takeoff JSON here…" />
                          <button className="button primary full" onClick={importExternalEstimate} disabled={!externalJson.trim()}><Upload size={15} /> Import & Validate JSON</button>
                        </section>

                        <section className="ai-path quick">
                          <div className="ai-path-heading"><div><span className="eyebrow">Quick AI</span><strong>Run Gemini in this browser</strong></div><Sparkles size={18} /></div>
                          <p>Optional convenience path. Your Gemini key stays in this browser session and is never written to Forge Core.</p>
                          <label><span>Gemini API key — session only</span><input className="input" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Paste key; it is not saved to Core" /></label>
                          <label><span>Model</span><select className="input" value={model} onChange={event => setModel(event.target.value)}>{GEMINI_MODELS.map(name => <option key={name}>{name}</option>)}</select></label>
                          <button className="button secondary full" onClick={() => void generate()} disabled={busy || !apiKey.trim()}>
                            {busy ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />} {busy ? 'Working…' : 'Generate with Gemini'}
                          </button>
                        </section>
                      </div>

                      <div className="notice"><TriangleAlert size={17} /><div><strong>Estimator review is mandatory.</strong><span>Every AI path uses the same Forge validator and Core takeoff contract. RFIs, Verify fields, exclusions and source uncertainty must remain visible.</span></div></div>
                    </>
                  ) : <div className="empty large">Create or select a reviewed Forge Scope before generating a takeoff.</div>}
                </div>
              </section>

              {estimate && (
                <section className="result-panel">
                  <div className="result-header">
                    <div><div className="eyebrow">3. Estimator review</div><h2>AI takeoff draft</h2><p>{estimate.projectSummary || 'Review every line before pricing.'}</p></div>
                    <div className="header-actions"><button className="button secondary" onClick={exportJson}><FileJson size={15} /> JSON</button><button className="button primary" onClick={() => void saveToCore()} disabled={busy}><Save size={15} /> Save to Core</button></div>
                  </div>

                  {(estimate.rfis.length > 0 || estimate.warnings.length > 0 || estimate.assumptions.length > 0) && (
                    <div className="review-notes">
                      {estimate.rfis.length > 0 && <div className="review-note danger-note"><strong>RFIs</strong>{estimate.rfis.map((item, index) => <span key={index}>• {item}</span>)}</div>}
                      {estimate.warnings.length > 0 && <div className="review-note warning-note"><strong>Warnings</strong>{estimate.warnings.map((item, index) => <span key={index}>• {item}</span>)}</div>}
                      {estimate.assumptions.length > 0 && <div className="review-note"><strong>Assumptions used</strong>{estimate.assumptions.map((item, index) => <span key={index}>• {item}</span>)}</div>}
                    </div>
                  )}

                  <div className="category-stack">
                    {categories.map(([category, items]) => (
                      <section className="category" key={category}>
                        <div className="category-title"><span>{category}</span><span>{items.length} lines</span></div>
                        <div className="table-wrap"><table><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Source / Math</th><th>Confidence</th></tr></thead><tbody>
                          {items.map((item, index) => <tr key={`${category}-${index}`} className={item.needsVerification ? 'verify-row' : ''}>
                            <td><strong>{item.description}</strong>{item.sku && <small>SKU {item.sku}</small>}</td>
                            <td className="number">{item.quantity}</td>
                            <td>{item.unit || '—'}</td>
                            <td><span>{item.source || 'Scope / calculation'}</span>{item.notes && <small>{item.notes}</small>}</td>
                            <td><span className={`confidence ${item.needsVerification ? 'verify' : (item.confidence || 'low').toLowerCase()}`}>{item.needsVerification ? 'Verify' : item.confidence || 'Unrated'}</span></td>
                          </tr>)}
                        </tbody></table></div>
                      </section>
                    ))}
                  </div>
                </section>
              )}

              <section className="panel recent-panel">
                <div className="panel-heading"><div><div className="eyebrow">Core history</div><h2>Recent AI takeoffs</h2></div></div>
                {workspace.takeoffs.length ? <div className="recent-list">{workspace.takeoffs.slice(0, 10).map(takeoff => <div className="recent-row" key={takeoff.id}><div><strong>{takeoff.title}</strong><span>{takeoff.itemCount} lines • {fmtDate(takeoff.createdAt)}</span></div><span className="version-pill">{takeoff.status}</span></div>)}</div> : <div className="empty">No Forge Quoter takeoffs saved yet.</div>}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
