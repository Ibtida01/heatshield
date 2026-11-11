// ISO 7010-style safety signs. Shape carries the meaning as well as colour:
// green square = safe, yellow triangle = warning, red ring + bar = stop work, blue circle = do this.
const C = { green: '#0B7A3E', yellow: '#FFC20E', red: '#C8102E', blue: '#005A9C', ink: '#000000', white: '#FFFFFF' };

const thermometer = `<g fill="${C.ink}"><rect x="45" y="38" width="10" height="34" rx="5"/><circle cx="50" cy="76" r="9"/>
  <rect x="58" y="44" width="9" height="3.5" rx="1.5"/><rect x="58" y="52" width="6" height="3.5" rx="1.5"/><rect x="58" y="60" width="9" height="3.5" rx="1.5"/></g>`;
const hammer = `<g transform="rotate(40 50 50)" fill="${C.ink}"><path d="M31 22 H63 Q69 22 69 28 V34 H31 Z"/><rect x="69" y="25" width="5" height="6" rx="1"/><rect x="45" y="33" width="9" height="47" rx="3.5"/></g>`;
const umbrella = `<g fill="${C.white}"><path d="M18 52 A32 30 0 0 1 82 52 Q74 46 66 52 Q58 46 50 52 Q42 46 34 52 Q26 46 18 52 Z"/>
  <rect x="47.5" y="50" width="5" height="22"/><path d="M47.5 70 v4 a7 7 0 0 1 -14 0 h5 a2 2 0 0 0 4 0 v-4 z"/></g>`;
const check = `<path d="M27 52 L43 68 L74 35" fill="none" stroke="${C.white}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
const drop = `<path d="M50 18 C50 18 28 46 28 61 A22 22 0 0 0 72 61 C72 46 50 18 50 18 Z" fill="${C.white}"/>`;
const beaker = `<path d="M38 22 H62 M42 22 V42 L27 72 A6 6 0 0 0 32 80 H68 A6 6 0 0 0 73 72 L58 42 V22" fill="none" stroke="${C.white}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M33 66 H67 L72 74 A4 4 0 0 1 68 78 H32 A4 4 0 0 1 28 74 Z" fill="${C.white}"/>`;

export function sign(kind, size = 160, title = '') {
  const t = title ? `<title>${title}</title>` : '';
  const open = `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${title}">${t}`;
  switch (kind) {
    case 'green':
      return `${open}<rect x="4" y="4" width="92" height="92" rx="8" fill="${C.green}"/>${check}</svg>`;
    case 'amber':
      return `${open}<path d="M50 7 L95 89 H5 Z" fill="${C.yellow}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>${thermometer}</svg>`;
    case 'red':
      return `${open}<circle cx="50" cy="50" r="42" fill="${C.white}" stroke="${C.red}" stroke-width="11"/>${hammer}
        <line x1="21" y1="21" x2="79" y2="79" stroke="${C.red}" stroke-width="11"/></svg>`;
    case 'rest':
      return `${open}<circle cx="50" cy="50" r="46" fill="${C.blue}"/>${umbrella}</svg>`;
    case 'water':
      return `${open}<circle cx="50" cy="50" r="46" fill="${C.blue}"/>${drop}</svg>`;
    case 'urine':
      return `${open}<circle cx="50" cy="50" r="46" fill="${C.blue}"/>${beaker}</svg>`;
    default:
      return `${open}<rect x="4" y="4" width="92" height="92" rx="8" fill="#9AA3AB"/></svg>`;
  }
}

export const TIER_COLOUR = { green: C.green, amber: C.yellow, red: C.red, rest: C.blue };
