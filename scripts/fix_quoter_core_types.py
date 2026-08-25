from pathlib import Path

path = Path('src/forgeCore.ts')
text = path.read_text(encoding='utf-8')
old = """  const customerMap = new Map((customersResult.data || []).map((row: any) => [row.id, row.display_name]));
  const projectMap = new Map((projectsResult.data || []).map((row: any) => [row.id, row]));
"""
new = """  const customerMap = new Map<string, string>((customersResult.data || []).map((row: any) => [String(row.id), String(row.display_name || '')]));
  const projectMap = new Map<string, { name?: string; customer_id?: string }>((projectsResult.data || []).map((row: any) => [String(row.id), { name: row.name || undefined, customer_id: row.customer_id || undefined }]));
"""
if old not in text:
    raise SystemExit('Expected Core lookup maps were not found; refusing to patch blindly.')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Typed Quoter Core customer/project lookup maps.')
