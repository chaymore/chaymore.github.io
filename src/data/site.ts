export const site = {
  name: 'Caleb Haymore',
  tagline: 'Finance, law, and systems thinking.',
  intro:
    'Finance student at BYU interested in the touchpoint between finance and law. Find me on the tennis court or reading a sci-fi novel.',
  email: 'you@example.com',
  socialLinks: [
    { label: 'GitHub', href: 'https://github.com/calebhaymore' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/caleb-haymore/' },
    { label: 'Instagram', href: 'https://www.instagram.com/caleb_haymore/' },
  ],
};

export const pageLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/competitions', label: 'Competitions' },
  { href: '/research', label: 'Research' },
  { href: '/writing', label: 'Writing' },
  { href: '/projects', label: 'Projects' },
  { href: '/contact', label: 'Contact' },
];

export const competitions = [
  {
    name: 'Marriott Case Competition',
    description: 'Add a description of the case, your role, and outcomes here.',
    year: '2025',
    placement: '1st Place',
  },
  {
    name: 'Ballard Center Case Competition',
    description: 'Add a description of the case, your role, and outcomes here.',
    year: '2025',
    placement: '3rd Place',
  },
  {
    name: 'Global Business Center Case Competition',
    description: 'Add a description of the case, your role, and outcomes here.',
    year: '2026',
    placement: '',
  },
];

export const research = [
  {
    title: 'Paper Title',
    abstract: 'Add a brief abstract or summary of your research here.',
    href: '',
  },
];

export const essays = [
  {
    title: 'Essay Title',
    date: 'Month Year',
    summary: 'Add a one or two sentence summary of the essay here.',
    href: '',
  },
];

export const projects: {
  title: string;
  description: string;
  tags: string[];
  repo?: string;
  href?: string;
}[] = [
  {
    title: 'Automated End-of-Day Work Journal',
    description:
      'A scheduled Claude Desktop agent that runs every evening and compiles a daily work journal entry without any manual effort. Each run, it pulls my Granola meeting recordings and transcripts, cross-references them against my Google Calendar events, and scans Notion for pages I created or updated that day. It then synthesizes everything into a structured summary — what I got done, what I learned, open tasks for the rest of the week, and the top priorities for tomorrow — and writes the result as a new sub-page inside my Notion Work Journal, titled with the date. The goal was to stop losing context between days and replace the 15–20 minutes I was spending on manual reflection with a log that is already waiting for me when I sit down the next morning.',
    tags: ['Claude Desktop', 'Scheduled Tasks', 'Granola MCP', 'Notion MCP', 'Google Calendar MCP'],
  },
];
