import { createHash, createSign } from 'node:crypto';

const rootFolderId = process.env.DRIVE_WIKI_FOLDER_ID;
const syncUrl = process.env.PORTRAIT_SYNC_URL;
const syncToken = process.env.PORTRAIT_SYNC_TOKEN;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

if (!rootFolderId || !syncUrl || !syncToken || !credentials.client_email || !credentials.private_key) {
  throw new Error('Missing DRIVE_WIKI_FOLDER_ID, PORTRAIT_SYNC_URL, PORTRAIT_SYNC_TOKEN, or GOOGLE_SERVICE_ACCOUNT_JSON.');
}

const accessToken = await googleAccessToken(credentials);
const files = await walkFolder(rootFolderId, '', accessToken);
const publicFiles = [];

for (const file of files) {
  if (!isReadable(file)) continue;
  const content = await readFile(file, accessToken);
  const { data, body } = frontmatter(content);
  if (data.portrait_access !== 'public') continue;
  publicFiles.push({ ...file, body, priority: Number(data.portrait_priority) || 50 });
}

const chunks = publicFiles.flatMap(chunkFile);
if (!chunks.length) throw new Error('No pages marked `portrait_access: public` were found. Sync stopped without changing production data.');

const response = await fetch(new URL('/admin/sync', syncUrl), {
  method: 'POST',
  headers: { authorization: `Bearer ${syncToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ chunks }),
});
if (!response.ok) throw new Error(`Portrait sync failed (${response.status}): ${await response.text()}`);
console.log(`Synced ${chunks.length} chunks from ${publicFiles.length} explicitly public wiki pages.`);

async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google authentication failed: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function walkFolder(folderId, path, token) {
  const collected = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      pageSize: '1000',
      orderBy: 'name',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    const data = await response.json();
    for (const file of data.files || []) {
      const filePath = path ? `${path}/${file.name}` : file.name;
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        if (file.name === '.private' || file.name === '.obsidian') continue;
        collected.push(...await walkFolder(file.id, filePath, token));
      } else collected.push({ ...file, path: filePath });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return collected;
}

function isReadable(file) {
  return file.mimeType === 'text/markdown' || file.mimeType === 'text/plain' || file.mimeType === 'application/vnd.google-apps.document';
}

async function readFile(file, token) {
  const url = file.mimeType === 'application/vnd.google-apps.document'
    ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  return (await driveFetch(url, token)).text();
}

async function driveFetch(url, token) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Drive request failed (${response.status}): ${await response.text()}`);
  return response;
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: markdown };
  const data = {};
  for (const line of match[1].split('\n')) {
    const split = line.indexOf(':');
    if (split > 0) data[line.slice(0, split).trim()] = line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return { data, body: markdown.slice(match[0].length) };
}

function chunkFile(file) {
  const title = file.body.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.name.replace(/\.md$/i, '');
  const sections = [];
  let heading = 'Overview';
  let lines = [];
  const flush = () => {
    const content = cleanMarkdown(lines.join('\n'));
    if (content && !/^(related|open questions|privacy notes)$/i.test(heading)) sections.push({ heading, content });
    lines = [];
  };
  for (const line of file.body.split('\n')) {
    const match = line.match(/^#{2,3}\s+(.+)$/);
    if (match) { flush(); heading = match[1].trim(); }
    else if (!line.startsWith('# ')) lines.push(line);
  }
  flush();
  return sections.flatMap(section => splitLong(section.content, 2600).map((content, index) => {
    const id = createHash('sha256').update(`${file.id}:${section.heading}:${index}:${content}`).digest('hex').slice(0, 32);
    const headingBoost = /^(summary|snapshot|identity|communication|voice)/i.test(section.heading) ? 30 : 0;
    return {
      id,
      sourceId: file.id,
      sourceTitle: title,
      sourcePath: file.path,
      section: section.heading,
      content,
      priority: Math.min(100, file.priority + headingBoost),
      updatedAt: file.modifiedTime || new Date().toISOString(),
    };
  }));
}

function cleanMarkdown(value) {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLong(content, max) {
  if (content.length <= max) return [content];
  const pieces = [], paragraphs = content.split(/\n\n+/), current = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (length && length + paragraph.length + 2 > max) { pieces.push(current.join('\n\n')); current.length = 0; length = 0; }
    current.push(paragraph.slice(0, max)); length += paragraph.length + 2;
  }
  if (current.length) pieces.push(current.join('\n\n'));
  return pieces;
}
