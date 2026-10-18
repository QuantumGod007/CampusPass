import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("public/posters", { recursive: true });
const head = (bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="800" height="520" fill="${bg}"/>`;
const text = (x, y, size, color, value, extra = "") =>
  `<text x="${x}" y="${y}" fill="${color}" ${extra.includes("font-family") ? "" : 'font-family="Arial,Helvetica,sans-serif"'} font-size="${size}" ${extra}>${value}</text>`;
const small = (color, label) =>
  text(40, 45, 13, color, "CAMPUSPASS / " + label, 'letter-spacing="3"');
const posters = {
  build:
    head("#2449ed") +
    small("#d8ed85", "MAKE SOMETHING MATTER") +
    `<g fill="none" stroke="#b7d76a" stroke-width="1" opacity=".35">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 80 - 120} 0L${i * 80 + 260} 520"/><path d="M0 ${i * 50}H800"/>`).join("")}</g>` +
    text(
      38,
      174,
      116,
      "#e4f4ac",
      "BUILD",
      'font-weight="900" letter-spacing="-8"',
    ) +
    text(
      38,
      281,
      116,
      "#e4f4ac",
      "FEST",
      'font-weight="900" letter-spacing="-8"',
    ) +
    `<g transform="translate(525 123)"><path d="M0 70L115 0l115 70v140l-115 70L0 210Z" fill="#d8ed85"/><path d="M0 70l115 70L230 70M115 140v140" stroke="#2449ed" stroke-width="4"/><path d="M0 140l115 70 115-70M58 35v140l115 70M173 35v140L58 245" fill="none" stroke="#2449ed" stroke-width="3"/></g>` +
    text(
      43,
      396,
      19,
      "#e4f4ac",
      "24 HOURS. LIMITLESS POSSIBILITIES.",
      'letter-spacing="2"',
    ) +
    `<path d="M40 438H760" stroke="#8fa5ff"/>` +
    text(40, 480, 17, "white", "THE CAMPUS HACKATHON") +
    text(
      760,
      480,
      17,
      "white",
      "BRING YOUR NEXT BIG IDEA ↗",
      'text-anchor="end"',
    ),
  design:
    head("#f3cfc5") +
    small("#673e35", "DESIGN SOCIETY PRESENTS") +
    `<g transform="translate(560 260)" fill="none" stroke="#a23228" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<ellipse rx="${36 + i * 13}" ry="190" transform="rotate(${i * 15})"/>`).join("")}</g>` +
    text(
      40,
      158,
      69,
      "#692e26",
      "Design",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(
      40,
      238,
      69,
      "#692e26",
      "after",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(
      40,
      318,
      69,
      "#692e26",
      "dark.",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(
      40,
      470,
      14,
      "#692e26",
      "GOOD IDEAS DON’T KEEP OFFICE HOURS.",
      'letter-spacing="2"',
    ),
  ai:
    head("#e7e9e5") +
    small("#2145bd", "CAMPUS AI LAB") +
    `<g transform="translate(580 235)">${Array.from({ length: 8 }, (_, i) => `<rect x="${-150 + i * 16}" y="${-150 + i * 16}" width="${300 - i * 32}" height="${300 - i * 32}" rx="${80 - i * 8}" fill="none" stroke="#315cfd" stroke-width="${2 + i * 0.6}" transform="rotate(${i * 10})"/>`).join("")}</g>` +
    text(
      40,
      210,
      108,
      "#213fa7",
      "AI",
      'font-weight="800" letter-spacing="-6"',
    ) +
    text(
      42,
      274,
      44,
      "#213fa7",
      "Innovation",
      'font-weight="600" letter-spacing="-2"',
    ) +
    text(
      42,
      329,
      44,
      "#213fa7",
      "Summit",
      'font-weight="600" letter-spacing="-2"',
    ) +
    text(
      40,
      474,
      15,
      "#213fa7",
      "THE FUTURE IS A CONVERSATION.",
      'letter-spacing="2"',
    ),
  startup:
    head("#f3a34b") +
    small("#3c2b1c", "ENTREPRENEURSHIP CELL") +
    `<path d="M470 375L655 190H524v-62h240v240h-62V236L517 422Z" fill="#3c2b1c"/>` +
    text(
      40,
      170,
      65,
      "#3c2b1c",
      "Small idea.",
      'font-weight="700" letter-spacing="-4"',
    ) +
    text(
      40,
      246,
      65,
      "#3c2b1c",
      "Big energy.",
      'font-weight="700" letter-spacing="-4"',
    ) +
    text(40, 347, 29, "#3c2b1c", "STARTUP PITCH NIGHT", 'font-weight="500"') +
    text(
      40,
      474,
      14,
      "#3c2b1c",
      "SIX TEAMS. ONE NEXT CHAPTER.",
      'letter-spacing="2"',
    ),
  coffee:
    head("#d9d4bd") +
    small("#3b4938", "DEVELOPER COMMUNITY") +
    `<g transform="translate(500 160)" fill="none" stroke="#3b4938" stroke-width="8"><path d="M0 0h160v130a60 60 0 0 1-60 60H60a60 60 0 0 1-60-60Z" fill="#f2efdf"/><path d="M160 20h30a42 42 0 0 1 0 84h-30M-30 215h225M40-30c-25-35 25-45 0-80M90-30c-25-35 25-45 0-80"/></g>` +
    text(
      40,
      200,
      70,
      "#3b4938",
      "code &amp;",
      'font-weight="700" letter-spacing="-4"',
    ) +
    text(
      40,
      282,
      70,
      "#3b4938",
      "coffee.",
      'font-weight="700" letter-spacing="-4"',
    ) +
    text(
      40,
      474,
      14,
      "#3b4938",
      "COME FOR THE COFFEE. STAY FOR THE PEOPLE.",
      'letter-spacing="1.5"',
    ),
  film:
    head("#c5c8ee") +
    small("#292351", "THE FILM COLLECTIVE") +
    `<g transform="translate(505 -20) rotate(12)"><rect width="230" height="600" fill="#343058"/>${Array.from({ length: 8 }, (_, i) => `<rect x="35" y="${i * 85}" width="160" height="67" rx="2" fill="#e0e1f4"/><rect x="8" y="${i * 85 + 15}" width="12" height="18" fill="#c5c8ee"/><rect x="210" y="${i * 85 + 15}" width="12" height="18" fill="#c5c8ee"/>`).join("")}</g>` +
    text(40, 175, 68, "#292351", "A different", 'font-family="Georgia,serif"') +
    text(40, 258, 68, "#292351", "point of", 'font-family="Georgia,serif"') +
    text(
      40,
      341,
      68,
      "#292351",
      "view.",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(40, 474, 17, "#292351", "CAMPUS FILM FESTIVAL", 'letter-spacing="2"'),
  robot:
    head("#cce1e1") +
    small("#214748", "ROBOTICS CLUB") +
    `<g transform="translate(490 125)" stroke="#214748" stroke-width="6"><rect width="240" height="220" rx="22" fill="#93bcbd"/><rect x="28" y="40" width="184" height="92" rx="14" fill="#214748"/><circle cx="78" cy="86" r="17" fill="#dff2ac"/><circle cx="163" cy="86" r="17" fill="#dff2ac"/><path d="M70 170h100M120 0v-40"/><circle cx="120" cy="-46" r="10" fill="#dff2ac"/></g>` +
    text(
      40,
      200,
      65,
      "#214748",
      "ROBOTICS",
      'font-weight="800" letter-spacing="-4"',
    ) +
    text(
      40,
      276,
      65,
      "#214748",
      "ARENA",
      'font-weight="800" letter-spacing="-4"',
    ) +
    text(
      40,
      474,
      14,
      "#214748",
      "A LITTLE HARDWARE. A LOT OF HEART.",
      'letter-spacing="2"',
    ),
  photo:
    head("#d8dccb") +
    small("#3e5034", "SHUTTER SOCIETY") +
    `<g transform="translate(565 260)"><circle r="175" fill="#768769"/><circle r="135" fill="#b4c4a1"/>${Array.from({ length: 6 }, (_, i) => `<path d="M0-135L117-67 50 29Z" fill="#3e5034" opacity=".7" transform="rotate(${i * 60})"/>`).join("")}<circle r="42" fill="#e6eadf"/></g>` +
    text(
      40,
      174,
      65,
      "#32442a",
      "Look a little",
      'font-family="Georgia,serif"',
    ) +
    text(
      40,
      252,
      65,
      "#32442a",
      "closer.",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(43, 343, 22, "#32442a", "THE SUNDAY PHOTO WALK") +
    text(
      40,
      474,
      14,
      "#32442a",
      "NEW PERSPECTIVES. FAMILIAR PLACES.",
      'letter-spacing="2"',
    ),
  source:
    head("#242b29") +
    small("#b1dfb3", "OPEN SOURCE CIRCLE") +
    text(
      430,
      330,
      230,
      "#b1dfb3",
      "&lt;/&gt;",
      'font-weight="400" letter-spacing="-20"',
    ) +
    text(
      40,
      175,
      64,
      "#e5f0df",
      "open",
      'font-weight="700" letter-spacing="-3"',
    ) +
    text(
      40,
      248,
      64,
      "#e5f0df",
      "source.",
      'font-weight="700" letter-spacing="-3"',
    ) +
    text(40, 325, 22, "#b1dfb3", "A WEEKEND OF CONTRIBUTING") +
    text(
      40,
      474,
      14,
      "#b1dfb3",
      "YOUR FIRST PR STARTS HERE.",
      'letter-spacing="2"',
    ),
  music:
    head("#462d42") +
    small("#f0c6a0", "CAMPUS MUSIC SOCIETY") +
    `<g fill="none" stroke="#ed9d79" stroke-width="2">${Array.from({ length: 18 }, (_, i) => `<path d="M400 ${100 + i * 15}Q500 ${-70 + i * 24} 600 ${100 + i * 15}T800 ${100 + i * 15}"/>`).join("")}</g>` +
    text(
      40,
      180,
      66,
      "#f6d9b4",
      "music",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(40, 255, 55, "#f6d9b4", "under the", 'font-family="Georgia,serif"') +
    text(
      40,
      333,
      76,
      "#f6d9b4",
      "stars.",
      'font-family="Georgia,serif" font-style="italic"',
    ) +
    text(
      40,
      474,
      14,
      "#f0c6a0",
      "A NIGHT TO TUNE EVERYTHING ELSE OUT.",
      'letter-spacing="2"',
    ),
  product:
    head("#f0e7d3") +
    small("#6c4434", "PRODUCT PEOPLE") +
    `<g transform="translate(535 150) rotate(-8)"><rect x="25" y="-30" width="185" height="250" rx="12" fill="#c77d63"/><rect x="-20" y="10" width="185" height="250" rx="12" fill="#eab89c"/><rect x="-55" y="45" width="185" height="250" rx="12" fill="#f9f4e8" stroke="#6c4434" stroke-width="2"/><circle cx="-20" cy="85" r="12" fill="#c77d63"/><path d="M-30 130h130M-30 150h90M-30 170h115" stroke="#6c4434" stroke-width="3"/><rect x="-30" y="210" width="90" height="30" rx="5" fill="#c77d63"/></g>` +
    text(
      40,
      180,
      62,
      "#6c4434",
      "from idea",
      'font-weight="600" letter-spacing="-3"',
    ) +
    text(
      40,
      255,
      62,
      "#6c4434",
      "to interface.",
      'font-weight="600" letter-spacing="-3"',
    ) +
    text(40, 344, 20, "#6c4434", "A HANDS-ON DESIGN WORKSHOP") +
    text(
      40,
      474,
      14,
      "#6c4434",
      "MAKE SOMETHING FEEL RIGHT.",
      'letter-spacing="2"',
    ),
  sport:
    head("#cae262") +
    small("#244738", "ATHLETICS COUNCIL") +
    `<g transform="translate(500 60)" fill="none" stroke="#244738" stroke-width="3"><rect width="250" height="400"/><path d="M0 200h250M60 0v65h130V0M60 400v-65h130v65"/><circle cx="125" cy="200" r="60"/><circle cx="125" cy="200" r="5" fill="#244738"/></g>` +
    text(
      40,
      185,
      80,
      "#244738",
      "THE",
      'font-weight="900" letter-spacing="-5"',
    ) +
    text(
      40,
      275,
      80,
      "#244738",
      "CAMPUS",
      'font-weight="900" letter-spacing="-5"',
    ) +
    text(
      40,
      365,
      80,
      "#244738",
      "CUP.",
      'font-weight="900" letter-spacing="-5"',
    ) +
    text(
      40,
      474,
      14,
      "#244738",
      "FIND YOUR TEAM. FIND YOUR GAME.",
      'letter-spacing="2"',
    ),
};
for (const [name, svg] of Object.entries(posters))
  writeFileSync(`public/posters/${name}.svg`, svg + "</svg>");
