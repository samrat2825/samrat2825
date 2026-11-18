// Pulls commit counts from the GitHub GraphQL API and renders assets/commits.svg + stats.json.
// Runs in GitHub Actions with the default GITHUB_TOKEN. Private contributions are counted
// because the profile has "include private contributions" switched on.

const LOGIN = process.env.GH_LOGIN || "samrat2825";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN missing");

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const yearQuery = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    contributionsCollection(from:$from,to:$to){
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar{ totalContributions }
    }
  }
}`;

const base = await gql(
  `query($login:String!){ user(login:$login){ createdAt repositories(privacy:PUBLIC, ownerAffiliations:OWNER){ totalCount } } }`,
  { login: LOGIN }
);
const createdAt = new Date(base.user.createdAt);
const publicRepos = base.user.repositories.totalCount;
const now = new Date();

// Per calendar year since the account was created.
const years = [];
for (let y = createdAt.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
  const from = y === createdAt.getUTCFullYear() ? createdAt : new Date(Date.UTC(y, 0, 1));
  const to = y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  const d = await gql(yearQuery, { login: LOGIN, from: from.toISOString(), to: to.toISOString() });
  const c = d.user.contributionsCollection;
  years.push({ year: y, commits: c.totalCommitContributions + c.restrictedContributionsCount, all: c.contributionCalendar.totalContributions });
}
const commitsAllTime = years.reduce((s, y) => s + y.commits, 0);

// Same window GitHub draws on the profile graph: from the Sunday that starts the week one year ago.
const lastYearFrom = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
lastYearFrom.setUTCDate(lastYearFrom.getUTCDate() - lastYearFrom.getUTCDay());
const ly = await gql(yearQuery, { login: LOGIN, from: lastYearFrom.toISOString(), to: now.toISOString() });
const lastYear = ly.user.contributionsCollection.contributionCalendar.totalContributions;
const lastYearCommits = ly.user.contributionsCollection.totalCommitContributions + ly.user.contributionsCollection.restrictedContributionsCount;

const fmt = (n) => n.toLocaleString("en-US");
const stats = {
  login: LOGIN,
  updatedAt: now.toISOString().slice(0, 10),
  commitsAllTime,
  commitsAllTimeLabel: fmt(commitsAllTime),
  contributionsLastYear: lastYear,
  contributionsLastYearLabel: fmt(lastYear),
  commitsLastYear: lastYearCommits,
  publicRepos,
  years,
};

// ---------- SVG ----------
const W = 900, H = 320;
const bars = years.filter((y) => y.commits > 0 || y.year >= 2020);
const maxC = Math.max(...bars.map((b) => b.commits), 1);
const chartX = 600, chartW = 270, chartY = 70, chartH = 150;
const gap = 10;
const bw = Math.floor((chartW - gap * (bars.length - 1)) / bars.length);
const barSvg = bars
  .map((b, i) => {
    const h = Math.max(4, Math.round((b.commits / maxC) * chartH));
    const x = chartX + i * (bw + gap);
    const y = chartY + chartH - h;
    const hot = b.commits === maxC;
    return `
    <rect class="bar" x="${x}" y="${y}" width="${bw}" height="${h}" rx="2" fill="${hot ? "#ff2bd6" : "#00f0ff"}" opacity="${hot ? 1 : 0.75}"/>
    <text x="${x + bw / 2}" y="${chartY + chartH + 16}" class="tick" text-anchor="middle">${String(b.year).slice(2)}</text>
    <text x="${x + bw / 2}" y="${y - 5}" class="val" text-anchor="middle">${b.commits >= 1000 ? (b.commits / 1000).toFixed(1) + "k" : b.commits}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(commitsAllTime)} commits on GitHub since ${createdAt.getUTCFullYear()}">
  <title>${fmt(commitsAllTime)} commits since ${createdAt.getUTCFullYear()}</title>
  <defs>
    <filter id="glowC" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glowM" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" opacity="0.18"/></pattern>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#00f0ff" stroke-opacity="0.08"/></pattern>
    <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stop-color="#ff2bd6"/><stop offset="1" stop-color="#00f0ff"/></linearGradient>
  </defs>
  <style>
    text{font-family:"JetBrains Mono","Fira Code","SFMono-Regular",Menlo,Consolas,monospace}
    .lbl{fill:#00f0ff;font-size:13px;letter-spacing:3px}
    .big{fill:#ff2bd6;font-size:84px;font-weight:700;letter-spacing:2px}
    .sub{fill:#9aa0b4;font-size:12px}
    .mini{fill:#f9f002;font-size:22px;font-weight:700}
    .minil{fill:#00f0ff;font-size:10px;letter-spacing:2px}
    .tick{fill:#9aa0b4;font-size:10px}
    .val{fill:#e6e6f0;font-size:9px}
    .big{animation:flicker 6s infinite}
    .cursor{animation:blink 1s steps(2,start) infinite}
    @keyframes flicker{0%,93%,100%{opacity:1}94%{opacity:.55}95%{opacity:1}97%{opacity:.7}98%{opacity:1}}
    @keyframes blink{to{visibility:hidden}}
  </style>
  <rect width="${W}" height="${H}" rx="10" fill="#0b0014"/>
  <rect width="${W}" height="${H}" rx="10" fill="url(#grid)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
  <path d="M0 14 H${W}" stroke="#ff2bd6" stroke-opacity="0.6"/>
  <text x="32" y="48" class="lbl">&gt; GIT LOG --ONELINE | WC -L<tspan class="cursor">_</tspan></text>
  <text x="32" y="150" class="big" filter="url(#glowM)">${fmt(commitsAllTime)}</text>
  <text x="32" y="182" class="sub">commits since ${createdAt.getUTCFullYear()}  //  public + private  //  synced ${stats.updatedAt}</text>
  <text x="32" y="262" class="mini" filter="url(#glowC)">${fmt(lastYear)}</text>
  <text x="32" y="280" class="minil">CONTRIBUTIONS // LAST 12 MONTHS</text>
  <text x="320" y="262" class="mini" filter="url(#glowC)">${publicRepos}</text>
  <text x="320" y="280" class="minil">PUBLIC REPOS</text>
  <text x="470" y="262" class="mini" filter="url(#glowC)">${fmt(Math.max(...years.map((y) => y.commits)))}</text>
  <text x="470" y="280" class="minil">BEST YEAR // ${years.find((y) => y.commits === Math.max(...years.map((v) => v.commits))).year}</text>
  <text x="${chartX}" y="48" class="lbl">COMMITS / YEAR</text>
  <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="#00f0ff" stroke-opacity="0.35"/>
  ${barSvg}
  <rect width="${W}" height="${H}" rx="10" fill="url(#scan)"/>
</svg>`;

import { writeFileSync } from "node:fs";
writeFileSync("assets/commits.svg", svg);
writeFileSync("stats.json", JSON.stringify(stats, null, 2) + "\n");
console.log(JSON.stringify({ commitsAllTime, lastYear, lastYearCommits, publicRepos, years }, null, 1));
