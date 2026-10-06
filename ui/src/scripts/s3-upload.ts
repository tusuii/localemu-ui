export {};
/**
 * S3 upload helpers: file + folder pickers, and drag & drop of files or whole
 * folders onto the objects card. Everything is sent as one multipart POST with
 * an aligned `paths` field carrying each file's relative path.
 */
interface Item { file: File; path: string }

const form = document.querySelector<HTMLFormElement>('form[data-s3-upload]');
const card = document.querySelector<HTMLElement>('[data-s3-dropzone]');

function setStatus(msg: string, error = false) {
  const el = document.querySelector<HTMLElement>('[data-upload-status]');
  if (!el) return;
  el.textContent = msg;
  el.className = error ? 'text-[13px] text-danger' : 'text-[13px] text-muted';
}

async function send(items: Item[]) {
  if (!form || !items.length) return;
  const fd = new FormData();
  fd.set('intent', 'upload');
  fd.set('prefix', (form.elements.namedItem('prefix') as HTMLInputElement).value);
  for (const it of items) { fd.append('files', it.file, it.file.name); fd.append('paths', it.path); }
  setStatus(`Uploading ${items.length} file${items.length === 1 ? '' : 's'}...`);
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    const r = await fetch(form.action || location.href, { method: 'POST', body: fd, redirect: 'follow' });
    if (!r.ok) throw new Error(`Upload failed (HTTP ${r.status}).`);
    location.reload();
  } catch (e) {
    setStatus((e as Error).message, true);
    form.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}

function pickerItems(): Item[] {
  const out: Item[] = [];
  for (const input of form!.querySelectorAll<HTMLInputElement>('input[type=file]')) {
    for (const file of Array.from(input.files ?? [])) out.push({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name });
  }
  return out;
}

if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const items = pickerItems();
    if (!items.length) { setStatus('Choose files or a folder first.', true); return; }
    void send(items);
  });
  form.addEventListener('change', () => {
    const n = pickerItems().length;
    setStatus(n ? `${n} file${n === 1 ? '' : 's'} selected.` : '');
  });
}

// ---- drag & drop ----
const readEntries = (dir: FileSystemDirectoryReader) => new Promise<FileSystemEntry[]>((res, rej) => dir.readEntries(res, rej));
async function walk(entry: FileSystemEntry, base: string, out: Item[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, path: base + entry.name });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await readEntries(reader);
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${base}${entry.name}/`, out);
    }
  }
}

if (card && form) {
  let depth = 0;
  const hl = (on: boolean) => card.classList.toggle('s3-dragging', on);
  card.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; hl(true); e.preventDefault(); } });
  card.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  card.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hl(false); });
  card.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); depth = 0; hl(false);
    const entries = Array.from(e.dataTransfer.items ?? []).map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x);
    const items: Item[] = [];
    if (entries.length) for (const en of entries) await walk(en, '', items);
    else for (const f of Array.from(e.dataTransfer.files)) items.push({ file: f, path: f.name });
    void send(items);
  });
}
