from pathlib import Path

core = Path('src/forgeCore.ts')
text = core.read_text(encoding='utf-8')

text = text.replace(
"""export interface CoreTakeoff {
  id: string;
  title: string;
  status: string;
  scopeId?: string;
  projectId?: string;
  itemCount: number;
  source?: string;
  createdAt: string;
}
""",
"""export interface CoreTakeoffItem {
  id: string;
  category?: string;
  sku?: string;
  description: string;
  quantity: number;
  unit?: string;
  metadata: Record<string, any>;
}

export interface CoreTakeoff {
  id: string;
  title: string;
  status: string;
  scopeId?: string;
  projectId?: string;
  customerId?: string;
  customerName?: string;
  itemCount: number;
  items: CoreTakeoffItem[];
  source?: string;
  createdAt: string;
}

export interface PricedTakeoffLine {
  takeoffItemId: string;
  quantity: number;
  unitCost: number;
  unitSell: number;
}

export interface CreatedQuoteResult {
  quoteId: string;
  quoteRevisionId: string;
  quoteNumber: string;
  itemCount: number;
  subtotal: number;
  costTotal: number;
  tax: number;
  total: number;
  grossMarginPercent: number;
}
""",
1)

old_parallel = """  const [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult] = await Promise.all([
"""
new_parallel = """  const [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult, takeoffItemsResult] = await Promise.all([
"""
if old_parallel not in text:
    raise SystemExit('Could not find Quoter workspace Promise.all declaration.')
text = text.replace(old_parallel, new_parallel, 1)

old_takeoffs_query = """    client.from('takeoffs')
      .select('id,title,status,scope_id,project_id,totals,source,created_at')
      .eq('organization_id', organizationId)
      .eq('source', 'forge-quoter')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  for (const result of [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult]) {
"""
new_takeoffs_query = """    client.from('takeoffs')
      .select('id,title,status,scope_id,project_id,totals,source,created_at')
      .eq('organization_id', organizationId)
      .eq('source', 'forge-quoter')
      .order('created_at', { ascending: false })
      .limit(50),
    client.from('takeoff_items')
      .select('id,takeoff_id,category,sku,description,quantity,unit,metadata')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(5000)
  ]);

  for (const result of [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult, takeoffItemsResult]) {
"""
if old_takeoffs_query not in text:
    raise SystemExit('Could not find takeoff workspace query block.')
text = text.replace(old_takeoffs_query, new_takeoffs_query, 1)

old_takeoffs_map = """  const takeoffs: CoreTakeoff[] = (takeoffsResult.data || []).map((row: any) => ({
    id: row.id,
    title: row.title || 'Untitled Takeoff',
    status: row.status,
    scopeId: row.scope_id || undefined,
    projectId: row.project_id || undefined,
    itemCount: Number(row.totals?.item_count || 0),
    source: row.source || undefined,
    createdAt: row.created_at
  }));
"""
new_takeoffs_map = """  const takeoffItemsByTakeoff = new Map<string, CoreTakeoffItem[]>();
  (takeoffItemsResult.data || []).forEach((row: any) => {
    const key = String(row.takeoff_id || '');
    if (!key) return;
    const next: CoreTakeoffItem = {
      id: String(row.id),
      category: row.category || undefined,
      sku: row.sku || undefined,
      description: row.description || 'Untitled material',
      quantity: Number(row.quantity || 0),
      unit: row.unit || undefined,
      metadata: row.metadata || {}
    };
    takeoffItemsByTakeoff.set(key, [...(takeoffItemsByTakeoff.get(key) || []), next]);
  });

  const takeoffs: CoreTakeoff[] = (takeoffsResult.data || []).map((row: any) => {
    const project = row.project_id ? projectMap.get(String(row.project_id)) : null;
    const customerId = project?.customer_id || undefined;
    const items = takeoffItemsByTakeoff.get(String(row.id)) || [];
    return {
      id: row.id,
      title: row.title || 'Untitled Takeoff',
      status: row.status,
      scopeId: row.scope_id || undefined,
      projectId: row.project_id || undefined,
      customerId,
      customerName: customerId ? customerMap.get(customerId) || undefined : undefined,
      itemCount: items.length || Number(row.totals?.item_count || 0),
      items,
      source: row.source || undefined,
      createdAt: row.created_at
    };
  });
"""
if old_takeoffs_map not in text:
    raise SystemExit('Could not find CoreTakeoff mapping block.')
text = text.replace(old_takeoffs_map, new_takeoffs_map, 1)

append = """

export async function commitPricedTakeoffToQuote(
  context: QuoterContext,
  takeoff: CoreTakeoff,
  quoteNumber: string,
  title: string,
  taxRate: number,
  lines: PricedTakeoffLine[]
): Promise<CreatedQuoteResult> {
  const client = await getForgeCoreClient();
  const { data, error } = await client.rpc('commit_priced_takeoff_quote_v1', {
    p_organization_id: context.organizationId,
    p_location_id: context.locationId || null,
    p_takeoff_id: takeoff.id,
    p_quote_number: quoteNumber.trim(),
    p_title: title.trim() || takeoff.title,
    p_customer_id: takeoff.customerId || null,
    p_project_id: takeoff.projectId || null,
    p_tax_rate: Number.isFinite(taxRate) ? taxRate : 0,
    p_items: lines.map(line => ({
      takeoff_item_id: line.takeoffItemId,
      quantity: line.quantity,
      unit_cost: line.unitCost,
      unit_sell: line.unitSell
    }))
  });
  if (error) throw error;
  if (!data?.quote_id) throw new Error('Forge Core did not return a quote ID.');
  return {
    quoteId: data.quote_id,
    quoteRevisionId: data.quote_revision_id,
    quoteNumber: data.quote_number,
    itemCount: Number(data.item_count || lines.length),
    subtotal: Number(data.subtotal || 0),
    costTotal: Number(data.cost_total || 0),
    tax: Number(data.tax || 0),
    total: Number(data.total || 0),
    grossMarginPercent: Number(data.gross_margin_percent || 0)
  };
}
"""
if 'export async function commitPricedTakeoffToQuote(' not in text:
    text += append
core.write_text(text, encoding='utf-8')

app = Path('src/App.tsx')
text = app.read_text(encoding='utf-8')

text = text.replace(
"""  commitEstimateToCore,
  CoreScope,
  EstimateResult,
""",
"""  commitEstimateToCore,
  commitPricedTakeoffToQuote,
  CoreScope,
  EstimateResult,
""",
1)

state_anchor = """  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [message, setMessage] = useState('');
"""
state_insert = """  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [pricingTakeoffId, setPricingTakeoffId] = useState('');
  const [pricedLines, setPricedLines] = useState<Record<string, { quantity: string; unitCost: string; unitSell: string }>>({});
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteTitle, setQuoteTitle] = useState('');
  const [targetMargin, setTargetMargin] = useState('20');
  const [taxPercent, setTaxPercent] = useState('0');
  const [message, setMessage] = useState('');
"""
if state_anchor not in text:
    raise SystemExit('Could not find App pricing state insertion point.')
text = text.replace(state_anchor, state_insert, 1)

refresh_anchor = """      setWorkspace(next);
      setScopeId(current => current && next.scopes.some(scope => scope.id === current)
        ? current
        : next.scopes[0]?.id || '');
"""
refresh_insert = """      setWorkspace(next);
      setScopeId(current => current && next.scopes.some(scope => scope.id === current)
        ? current
        : next.scopes[0]?.id || '');
      setPricingTakeoffId(current => current && next.takeoffs.some(takeoff => takeoff.id === current)
        ? current
        : next.takeoffs[0]?.id || '');
"""
if refresh_anchor not in text:
    raise SystemExit('Could not find refresh selection block.')
text = text.replace(refresh_anchor, refresh_insert, 1)

memo_anchor = """  const selectedScope = useMemo(() => workspace.scopes.find(scope => scope.id === scopeId) || null, [workspace.scopes, scopeId]);
"""
memo_insert = memo_anchor + """  const selectedPricingTakeoff = useMemo(() => workspace.takeoffs.find(takeoff => takeoff.id === pricingTakeoffId) || null, [workspace.takeoffs, pricingTakeoffId]);
"""
text = text.replace(memo_anchor, memo_insert, 1)

categories_anchor = """  const categories = useMemo(() => {
"""
pricing_effect = """  useEffect(() => {
    if (!selectedPricingTakeoff) {
      setPricedLines({});
      return;
    }
    const next: Record<string, { quantity: string; unitCost: string; unitSell: string }> = {};
    selectedPricingTakeoff.items.forEach(item => {
      next[item.id] = {
        quantity: String(item.quantity ?? 0),
        unitCost: '',
        unitSell: ''
      };
    });
    setPricedLines(next);
    setQuoteTitle(selectedPricingTakeoff.title.replace(/\s+—\s+AI Takeoff$/i, '') || selectedPricingTakeoff.title);
  }, [selectedPricingTakeoff?.id]);

  const pricingTotals = useMemo(() => {
    let cost = 0;
    let sell = 0;
    selectedPricingTakeoff?.items.forEach(item => {
      const line = pricedLines[item.id];
      const quantity = Number(line?.quantity || 0);
      const unitCost = Number(line?.unitCost || 0);
      const unitSell = Number(line?.unitSell || 0);
      if (Number.isFinite(quantity) && Number.isFinite(unitCost)) cost += quantity * unitCost;
      if (Number.isFinite(quantity) && Number.isFinite(unitSell)) sell += quantity * unitSell;
    });
    const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
    const taxRate = Math.max(0, Math.min(100, Number(taxPercent || 0))) / 100;
    return { cost, sell, margin, tax: sell * taxRate, total: sell * (1 + taxRate) };
  }, [selectedPricingTakeoff, pricedLines, taxPercent]);

"""
if categories_anchor not in text:
    raise SystemExit('Could not find categories memo insertion point.')
text = text.replace(categories_anchor, pricing_effect + categories_anchor, 1)

save_anchor = """  const exportJson = () => {
"""
pricing_functions = """  const updatePricedLine = (itemId: string, field: 'quantity' | 'unitCost' | 'unitSell', value: string) => {
    setPricedLines(current => ({ ...current, [itemId]: { ...(current[itemId] || { quantity: '0', unitCost: '', unitSell: '' }), [field]: value } }));
  };

  const applyGrossMargin = () => {
    const margin = Number(targetMargin || 0) / 100;
    if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return setError('Target gross margin must be between 0% and 99.99%.');
    setPricedLines(current => {
      const next = { ...current };
      selectedPricingTakeoff?.items.forEach(item => {
        const line = next[item.id] || { quantity: String(item.quantity || 0), unitCost: '', unitSell: '' };
        const cost = Number(line.unitCost || 0);
        next[item.id] = { ...line, unitSell: cost > 0 ? (cost / (1 - margin)).toFixed(2) : line.unitSell };
      });
      return next;
    });
    setMessage(`Applied ${Number(targetMargin || 0).toFixed(1)}% target gross margin to lines with cost entered.`);
  };

  const createDraftQuote = async () => {
    if (!workspace.context?.organizationId || !selectedPricingTakeoff) return;
    if (!quoteNumber.trim()) return setError('Enter a quote number before creating the draft quote.');
    if (!selectedPricingTakeoff.items.length) return setError('This takeoff has no material lines to price.');
    const lines = selectedPricingTakeoff.items.map(item => {
      const line = pricedLines[item.id] || { quantity: String(item.quantity || 0), unitCost: '', unitSell: '' };
      return {
        takeoffItemId: item.id,
        quantity: Number(line.quantity || 0),
        unitCost: Number(line.unitCost || 0),
        unitSell: Number(line.unitSell || 0)
      };
    });
    if (lines.some(line => !Number.isFinite(line.quantity) || !Number.isFinite(line.unitCost) || !Number.isFinite(line.unitSell) || line.quantity < 0 || line.unitCost < 0 || line.unitSell < 0)) {
      return setError('Pricing contains an invalid or negative quantity/cost/sell value.');
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await commitPricedTakeoffToQuote(
        workspace.context,
        selectedPricingTakeoff,
        quoteNumber,
        quoteTitle,
        Math.max(0, Math.min(100, Number(taxPercent || 0))) / 100,
        lines
      );
      setMessage(`Draft quote ${result.quoteNumber} created in Forge Core: $${result.subtotal.toFixed(2)} subtotal at ${result.grossMarginPercent.toFixed(2)}% gross margin.`);
      setQuoteNumber('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not create the Core quote from this takeoff.');
    } finally {
      setBusy(false);
    }
  };

"""
if save_anchor not in text:
    raise SystemExit('Could not find App pricing function insertion point.')
text = text.replace(save_anchor, pricing_functions + save_anchor, 1)

text = text.replace(
"""        <div className="sidebar-item muted"><Boxes size={17} /><span>Pricing</span><span className="sidebar-next">Next</span></div>
        <div className="sidebar-item muted"><ClipboardList size={17} /><span>Quote Builder</span><span className="sidebar-next">Next</span></div>
""",
"""        <a href="#pricing" className="sidebar-item"><Boxes size={17} /><span>Pricing</span><span className="sidebar-live">Live</span></a>
        <a href="#pricing" className="sidebar-item"><ClipboardList size={17} /><span>Quote Builder</span><span className="sidebar-live">Live</span></a>
""",
1)

recent_anchor = """              <section className="panel recent-panel">
"""
pricing_ui = """              <section className="panel pricing-panel" id="pricing">
                <div className="panel-heading">
                  <div><div className="eyebrow">4. Pricing & quote builder</div><h2>Price an approved Core takeoff</h2></div>
                  <a href="https://forge-crm-six.vercel.app/quotes" target="_blank" rel="noreferrer">Open CRM Quotes <ArrowUpRight size={13} /></a>
                </div>
                {workspace.takeoffs.length ? (
                  <>
                    <div className="pricing-controls">
                      <label><span>Saved takeoff</span><select className="input" value={pricingTakeoffId} onChange={event => setPricingTakeoffId(event.target.value)}>{workspace.takeoffs.map(takeoff => <option key={takeoff.id} value={takeoff.id}>{takeoff.title} — {takeoff.itemCount} lines</option>)}</select></label>
                      <label><span>Quote number</span><input className="input" value={quoteNumber} onChange={event => setQuoteNumber(event.target.value)} placeholder="e.g. Q260825-01" /></label>
                      <label><span>Quote title</span><input className="input" value={quoteTitle} onChange={event => setQuoteTitle(event.target.value)} /></label>
                      <label><span>Tax %</span><input className="input" type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={event => setTaxPercent(event.target.value)} /></label>
                    </div>

                    <div className="pricing-summary">
                      <div><span>Cost</span><strong>${pricingTotals.cost.toFixed(2)}</strong></div>
                      <div><span>Sell</span><strong>${pricingTotals.sell.toFixed(2)}</strong></div>
                      <div><span>Gross Margin</span><strong className={pricingTotals.margin < 0 ? 'warn-text' : ''}>{pricingTotals.margin.toFixed(2)}%</strong></div>
                      <div><span>Total + Tax</span><strong>${pricingTotals.total.toFixed(2)}</strong></div>
                      <div className="margin-apply"><span>Target GM %</span><div><input className="input" type="number" min="0" max="99.99" step="0.1" value={targetMargin} onChange={event => setTargetMargin(event.target.value)} /><button className="button secondary" onClick={applyGrossMargin}>Apply GM</button></div></div>
                    </div>

                    {selectedPricingTakeoff?.items.length ? (
                      <div className="table-wrap pricing-table"><table><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Unit Sell</th><th>Line Sell</th><th>GM</th></tr></thead><tbody>
                        {selectedPricingTakeoff.items.map(item => {
                          const line = pricedLines[item.id] || { quantity: String(item.quantity || 0), unitCost: '', unitSell: '' };
                          const quantity = Number(line.quantity || 0);
                          const cost = Number(line.unitCost || 0);
                          const sell = Number(line.unitSell || 0);
                          const lineMargin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
                          return <tr key={item.id} className={item.metadata?.needs_verification ? 'verify-row' : ''}>
                            <td><strong>{item.description}</strong><small>{item.category || 'Other'}{item.sku ? ` • SKU ${item.sku}` : ''}{item.metadata?.needs_verification ? ' • Verify' : ''}</small></td>
                            <td><input className="pricing-input" type="number" min="0" step="0.01" value={line.quantity} onChange={event => updatePricedLine(item.id, 'quantity', event.target.value)} /></td>
                            <td>{item.unit || '—'}</td>
                            <td><input className="pricing-input" type="number" min="0" step="0.01" value={line.unitCost} onChange={event => updatePricedLine(item.id, 'unitCost', event.target.value)} placeholder="0.00" /></td>
                            <td><input className="pricing-input" type="number" min="0" step="0.01" value={line.unitSell} onChange={event => updatePricedLine(item.id, 'unitSell', event.target.value)} placeholder="0.00" /></td>
                            <td className="number">${(quantity * sell || 0).toFixed(2)}</td>
                            <td><span className={`confidence ${lineMargin < 0 ? 'verify' : 'high'}`}>{lineMargin.toFixed(1)}%</span></td>
                          </tr>;
                        })}
                      </tbody></table></div>
                    ) : <div className="empty">The selected Core takeoff has no stored lines.</div>}

                    <div className="pricing-footer">
                      <div><strong>Creates a draft Core quote.</strong><span>Cost is internal; quote items keep their source takeoff IDs for downstream purchasing and audit.</span></div>
                      <button className="button primary" onClick={() => void createDraftQuote()} disabled={busy || !quoteNumber.trim() || !selectedPricingTakeoff?.items.length}><ClipboardList size={16} /> {busy ? 'Creating…' : 'Create Draft Quote'}</button>
                    </div>
                  </>
                ) : <div className="empty large">Save an approved takeoff to Forge Core before pricing it.</div>}
              </section>

"""
if recent_anchor not in text:
    raise SystemExit('Could not find recent takeoff panel insertion point.')
text = text.replace(recent_anchor, pricing_ui + recent_anchor, 1)
app.write_text(text, encoding='utf-8')

css = Path('src/index.css')
styles = css.read_text(encoding='utf-8')
addition = """
.sidebar-live{margin-left:auto;font-size:8px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;color:var(--forge-accent)}
.pricing-panel{scroll-margin-top:24px}.pricing-controls{display:grid;grid-template-columns:1.2fr .8fr 1.2fr .5fr;gap:10px;padding:16px;border-top:1px solid var(--forge-border)}.pricing-controls label{display:grid;gap:6px}.pricing-controls label>span,.pricing-summary>div>span{font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--forge-secondary)}.pricing-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.3fr;gap:10px;padding:0 16px 16px}.pricing-summary>div{border:1px solid var(--forge-border);background:#101215;border-radius:10px;padding:12px;display:grid;gap:6px}.pricing-summary strong{font-size:15px;color:#fff}.margin-apply>div{display:flex;gap:7px}.margin-apply .input{min-width:0}.pricing-table{border-top:1px solid var(--forge-border)}.pricing-input{width:88px;background:#0d0f11;border:1px solid var(--forge-border);border-radius:7px;color:#fff;padding:7px 8px;font:inherit}.pricing-input:focus{outline:none;border-color:rgba(255,118,23,.55);box-shadow:0 0 0 2px rgba(255,118,23,.08)}.pricing-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border-top:1px solid var(--forge-border)}.pricing-footer>div{display:grid;gap:4px}.pricing-footer strong{font-size:11px;color:#fff}.pricing-footer span{font-size:9px;color:var(--forge-secondary)}
@media(max-width:1200px){.pricing-controls{grid-template-columns:1fr 1fr}.pricing-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.margin-apply{grid-column:span 2}}
@media(max-width:720px){.pricing-controls,.pricing-summary{grid-template-columns:1fr}.margin-apply{grid-column:auto}.pricing-footer{align-items:stretch;flex-direction:column}.pricing-footer .button{justify-content:center}}
"""
if '.pricing-panel{' not in styles:
    styles += addition
css.write_text(styles, encoding='utf-8')

print('Forge Quoter Pricing + Quote Builder v1 patch applied.')
