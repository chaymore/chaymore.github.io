export const corePrompt = `You're going to turn my personal context into a knowledge wiki. It follows Andrej Karpathy's LLM wiki pattern: the raw source files stay untouched, you write and maintain a set of linked markdown pages, and a schema file tells the next session how to keep it up to date.

Two rules hold for the whole job. Don't make up facts about me, and if a source is missing, note the gap. When two sources disagree, keep both claims and say they conflict instead of smoothing it over.

Step 1: Check what I've gathered.
Before you create any files, go through this list with me. For each source, ask whether I uploaded it, connected it, or decided to skip it, and wait for my answers. If I still want a source I haven't gathered, tell me to go get it first. Don't start until I say the set is complete.
1. iMessage, for close relationships: an imessage-export folder with a summary.md inside
2. LinkedIn, for the wider group of people I know: the unzipped data export
3. Files on this computer, for notes, school, and work: files.md
4. Gmail, for day-to-day email: connected
5. Google Calendar, for how my time actually goes: connected
6. Google Drive, for notes and documents: connected
7. A brain dump, for what's never been written down: interview.md

Step 2: Ask where the wiki should live.
It can be a folder on this computer or a folder in Google Drive. Wait for my answer, then create the folder and tell me the path. The raw sources include other people's messages, so keep the folder private.

Step 3: Read what you have.
Start with the files and folders I attached. Then use Gmail, Calendar, and Drive if they're connected. In Drive, read the folders that look like notes, journals, writing, or current work. If you can't tell which ones matter, ask me once and keep going. Don't try to read all of Drive, and don't wait on a source I don't have. If I didn't attach files.md but you can see this computer's files, read Documents, Desktop, and Downloads yourself.

Read text, CSV, and JSON. Skip images, video, and attachments. LinkedIn's Connections.csv usually has a few lines of notes above the real header row, so find the header before you parse it.

Step 4: Build the wiki.
Use this structure, and fill it with real pages based on what you actually found:

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

Here's what each part is for:
- raw/ holds the sources as they came in. Copy exports here. For a connected source you can't copy, write a short note saying what you read and when. Never edit anything in raw/ after that.
- wiki/people/ has one page per person who matters. iMessage is the best evidence for close relationships, and LinkedIn is best for the wider network.
- wiki/preferences/ covers likes, dislikes, taste, and values. The brain dump is the main source. Email and calendar can correct it when what I do doesn't match what I said.
- wiki/work/ and wiki/day-to-day/ come mostly from Gmail, Calendar, Drive, and my files. This is the everyday stuff that would never make it into a biography.
- wiki/sources/ has one page per raw source: what it covers, how recent it is, and what it shouldn't be trusted for.
- wiki/overview.md is the big picture, with links. End it with a Gaps section.
- wiki/index.md lists every wiki page with one line each, grouped by folder. Future sessions read this first.
- wiki/log.md only ever gets added to. Start each entry with ## [YYYY-MM-DD] ingest | title so it's easy to search.

Step 5: Write AGENTS.md.
This is the rulebook. Write it so a new agent could keep the wiki up to date without ever seeing this chat. Include these rules:
- raw/ never changes. wiki/ is yours to write. I pick the sources and ask the questions.
- Filenames are kebab-case.md.
- Every wiki page starts with a title and a two-sentence summary, and ends with a Sources section of relative links.
- Link people, preferences, and work pages to each other.
- When sources disagree, keep both and mark the conflict.
- To add a source: read it, update the pages it affects, update index.md, and add an entry to log.md.
- To answer a question: read index.md, open the relevant pages, answer with links, and save a useful answer back into the wiki if I ask you to.
- To check the wiki: look for pages nothing links to, claims that are out of date, missing pages, and conflicts.

Write the pages in plain language. Keep them short and make specific claims, with no biography voice and no filler. Quote me when my exact words matter.

When you're done, show me the folder tree, the path, and five pages I should read first. Then stop.`;

export const imessagePrompt = `Export my iMessage history into plain text files I can give to another AI. Everything stays on this Mac, so don't upload anything anywhere.

1. My messages are in ~/Library/Messages/chat.db. Copy it into a temporary folder, along with chat.db-wal and chat.db-shm if they exist, and work only on the copy. Never write to the original.
2. If you can't read the file, stop and tell me to turn on Full Disk Access for the app you're running in, then quit and reopen it.
3. Use the sqlite3 and python3 that come with macOS. Ask me before you install anything.
4. Ask me how far back to go. If I don't care, use the last three years.
5. For each message, pull the date, who sent it, and the text. On newer versions of macOS the text column is often empty and the words are stored in attributedBody instead, so decode them from there when you need to. Message dates are counted in nanoseconds from January 1, 2001.
6. Match phone numbers and emails to names using my Contacts database in ~/Library/Application Support/AddressBook, if you can read it. Keep the number when there's no match.
7. Skip photos, videos, and other attachments. Skip reactions (rows where associated_message_type isn't 0), and skip texts from short codes and businesses.
8. Write one file per conversation to ~/Desktop/imessage-export/, named after the person or group. Put messages oldest first, one per line, as [YYYY-MM-DD HH:MM] Name: text.
9. Then write ~/Desktop/imessage-export/summary.md. List the 30 people I talk to most, with how many messages we've traded, when we first and last talked, and one line on what we mostly talk about. Base every line on the messages themselves, and don't guess.
10. Delete the temporary copy. Tell me where the folder is, how many conversations and messages you exported, and anything you skipped.`;

export const brainPrompt = `I want you to interview me about the parts of my life that aren't written down anywhere, meaning not in my email, calendar, texts, or LinkedIn. What you write at the end goes into a personal knowledge wiki as raw/brain/interview.md.

How to run it:
- Ask one question at a time, and wait for my answer before you ask the next one.
- Ask about scenes, people, and recent examples rather than abstract ideas.
- If I say something interesting, follow it before you change the subject.
- If I'm vague, ask once for a specific example, then move on.
- Don't flatter me, don't recap after every answer, and don't give me advice.

Cover these in whatever order feels natural. Skip one only if I tell you there's nothing there.
1. People who matter to me but might not show up in my texts, and what they are to me.
2. Things I like and dislike that I'd never bother posting about: food, work, places, media, habits, and the kinds of rooms I want to be in.
3. What a good week feels like, and what a bad one feels like.
4. Work I care about, work I'm done with, and work I'm avoiding.
5. Something I believe that would surprise someone who only knows my LinkedIn.
6. A choice I keep making over and over.
7. What an AI that knows me should never get wrong.

When I say we're done, write one markdown document I can save as interview.md. Use headings, quote me when my exact words matter, and end with a list of questions I left open. Don't turn it into a biography.`;

export const filesPrompt = `Look through the documents on this computer and pull out what they say about me. You're collecting context for a personal knowledge wiki, not writing my life story, so treat this as a search.

Where to look: Documents, Desktop, and Downloads, plus any other folder that's clearly notes, journals, school, writing, or current work.

What to skip: applications, caches, Library, node_modules, the insides of .git folders, photos, and video. Don't move, change, or delete anything.

What to read: text, markdown, PDF, Word documents, spreadsheets, and CSV.

1. First, list the folders you plan to read and tell me before you start.
2. Read them. If a folder is huge, stick to files changed in the last year and tell me you did.
3. Write one markdown file I can save as files.md, grouped by folder. For each group, say what the files are, which people and projects come up, and what they suggest about how I spend my time. Quote a line when the exact wording matters. End with a list of what you skipped.

Only write what's in the files. If you're unsure about something, say so instead of guessing.`;
