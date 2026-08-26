from pathlib import Path

path = Path('src/App.tsx')
source = path.read_text()
old = '''      <a className="suite-link" href="https://forge-crm-six.vercel.app"><span>CRM</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://robquotes.vercel.app"><span>Reader</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://forge-scope.vercel.app"><span>Scope</span><ArrowUpRight size={13} /></a>
      <div className="suite-link active"><span>Quote / AI Quoter</span><span className="suite-dot" /></div>'''
new = '''      <a className="suite-link" href="https://forge2-navy.vercel.app"><span>Home</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://forge-crm-six.vercel.app"><span>CRM</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://robquotes.vercel.app"><span>Reader</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://forge-scope.vercel.app"><span>Scope</span><ArrowUpRight size={13} /></a>
      <div className="suite-link active"><span>Quote / AI Quoter</span><span className="suite-dot" /></div>
      <a className="suite-link" href="https://forgemfg.vercel.app"><span>Manufacturing</span><ArrowUpRight size={13} /></a>
      <a className="suite-link" href="https://forge-portal-pi.vercel.app"><span>Portal</span><ArrowUpRight size={13} /></a>'''
count = source.count(old)
if count != 1:
    raise SystemExit(f'Expected one Quoter suite nav block, found {count}')
path.write_text(source.replace(old, new))
