export const corePrompt = `You are compiling my personal context into a knowledge wiki. The pattern is Andrej Karpathy's LLM wiki: raw source files stay untouched, you write and maintain a linked set of markdown pages, and a schema file tells the next session how to keep it up.

Do not invent facts about me. If a source is missing, record the gap. Do not summarize your way past a contradiction. Keep both claims and say they conflict.

Before you create any files, check with me. Go through this list and ask whether I have gathered the context I want from each source. Wait for my answers. Do not start the wiki until I say this set is complete, including any source I am deliberately skipping.

1. iMessage, for core relationships
2. LinkedIn, for the wider set of people I know
3. Files on this computer, for documents, notes, and work that live on disk
4. Gmail, for day-to-day correspondence
5. Google Calendar, for how my time actually goes
6. Google Drive, for notes and files
7. A brain dump, for what was never written down

For each one, ask if it is uploaded, connected, or something I am leaving out. If I still want a source I have not gathered, stop and tell me to gather it first.

Once I confirm the set, ask where the wiki should live, and wait:
1. A folder of files on this computer
2. A folder in Google Drive

If I choose local files, create the folder and tell me the path. If I choose Google Drive, create the folder there. The raw sources include other people's messages, so keep the folder private.

Then see what context you already have. Read attached exports and folders first. Use Gmail, Google Calendar, and Google Drive if they are connected. For Drive, read the folders that look like notes, journals, writing, or active work. If you cannot tell which folders matter, ask me once, then continue. Do not try to read all of Drive, and do not block on a source I don't have.

Skip images, video, and attachments. Read text, csv, and json. LinkedIn's Connections.csv often has a notes preamble before the real header. Find the header row before you parse it.

Build this tree, then fill it with real pages from what you actually found:

context-wiki/
  AGENTS.md
  raw/
    imessage/
    linkedin/
    files/
    gmail/
    calendar/
    drive/
    brain/
  wiki/
    index.md
    overview.md
    log.md
    people/
    preferences/
    work/
    day-to-day/
    sources/

What the folders are for:
- raw/ is immutable. Copy exports here, or write a short note pointing at a connected source you cannot copy. Never revise raw files later.
- wiki/people/ is one page per person who matters. iMessage is the best evidence for core relationships. LinkedIn is the best evidence for the wider set of people I know.
- raw/files/ is the pass over documents on this computer: notes, school, work, and writing that never became an email. Read those notes. If they are not attached and you can see the disk, read Documents, Desktop, and Downloads yourself, and skip applications, caches, photos, and video.
- wiki/preferences/ is likes, dislikes, taste, and values. The brain dump is the main source. Mail and calendar can correct it when what I do disagrees with what I said.
- wiki/work/ and wiki/day-to-day/ come mainly from Gmail, Calendar, and Drive. This is day-to-day life and the other context that never becomes a biography.
- wiki/sources/ is one summary page per raw source: what it covers, how fresh it is, and what it should not be trusted for.
- wiki/overview.md is the synthesis, with links. Include a Gaps section.
- wiki/index.md is a catalog, one link and one line per wiki page, grouped by folder. Future sessions read this first.
- wiki/log.md is append-only. Start each entry with ## [YYYY-MM-DD] ingest | title so it can be grepped.

AGENTS.md is the schema. Write it so a fresh agent can maintain the wiki without this chat. Include these rules:
- raw/ is immutable. wiki/ is yours to write. I curate sources and ask questions.
- Filenames are kebab-case.md.
- Every wiki page starts with a title and a two-sentence summary, and ends with a Sources section of relative links.
- Cross-link people, preferences, and work.
- When sources disagree, keep both and mark the contradiction.
- Ingest: read the new source, update the pages it changes, update index.md, append to log.md.
- Query: read index.md, open the relevant pages, answer with links, and file a valuable answer back into the wiki if I ask you to keep it.
- Lint: look for orphans, stale claims, missing pages, and contradictions.

Write in plain language. Short pages. Specific claims. No biography voice and no filler. Quote me when the exact wording matters.

When the files exist, show me the folder tree, the path, and five pages to read first. Then stop.`;

export const brainPrompt = `Interview me for the part of my life that is not written down anywhere. Not in email, not in my calendar, not in my texts, and not on LinkedIn. This becomes raw/brain/interview.md for a personal knowledge wiki.

Rules for this conversation:
- Ask one question at a time.
- Wait for my answer before you ask another.
- Prefer a scene, a person, or a recent example over an abstraction.
- Follow the interesting thread before you change the subject.
- If I am vague, ask once for a specific. Then move on.
- Do not flatter me. Do not summarize every turn. Do not turn my answers into advice.

Cover these, in whatever order the conversation earns them. Skip one only if I say there is nothing there:
1. People who matter and might not show up in my texts. Who they are, and what they actually are to me.
2. Likes and dislikes I would not bother posting. Food, work, places, media, habits, and the kinds of rooms I want to be in.
3. What a good week feels like, and what a bad one feels like.
4. Work I care about, work I am done with, and work I am avoiding.
5. Something I believe that would surprise someone who only read my LinkedIn.
6. The choice I keep making over and over.
7. What an AI that knows me should never get wrong.

When I say we are done, write one markdown document I can save as interview.md. Use headings. Quote my words when the exact phrasing matters. End with a list of questions I left open. Do not rewrite it as a biography.`;

export const filesPrompt = `Look through the documents stored on this computer and pull out context worth keeping. This is a search, not a biography. Run it on a cheap model.

Search the places files actually live:
- Documents, Desktop, and Downloads
- Any folder that is clearly notes, journals, school, writing, or active work

Skip applications, caches, Library, node_modules, .git internals, photos, and video. Do not modify or delete anything. Read text, markdown, pdf, Word documents, spreadsheets, and csv.

Work in two passes:
1. List the folders that look relevant and which ones you are about to read. Then read them.
2. Write one markdown file I can save as files.md. Group it by folder. For each cluster, say what the files are, which people and projects show up, and what they imply about how I spend my time. Quote a line when the wording matters. Say what you skipped.

If a folder is huge, prefer files changed in the last year and say so. Do not invent anything that is not in the files.`;
