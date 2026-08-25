from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()
old = "className={`confidence ${(item.confidence || 'low').toLowerCase()}`}>{item.needsVerification ? 'Verify' : item.confidence || 'Unrated'}"
new = "className={`confidence ${item.needsVerification ? 'verify' : (item.confidence || 'low').toLowerCase()}`}>{item.needsVerification ? 'Verify' : item.confidence || 'Unrated'}"
if old not in text:
    raise SystemExit('Expected confidence badge expression not found; refusing blind patch.')
path.write_text(text.replace(old, new, 1))
