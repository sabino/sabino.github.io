import type { ItemId } from './types';

/** Small botanical/material icons are composed in code, using the same item identity as play. */
export function itemIcon(
  kind: ItemId | 'staff' | 'sword' | 'bow' | 'ward' | 'hand',
  size = 32,
): string {
  const herb = ['cequin', 'heartleaf', 'emberroot'].includes(kind);
  const color = kind === 'cequin' ? '#97d5a7' : kind === 'heartleaf' ? '#b2a0df' : '#e5a565';
  let parts = '';
  if (herb) {
    parts = '<path d="M11 27Q17 17 18 5" stroke="#819977" stroke-width="2" fill="none"/>';
    for (let i = 0; i < 5; i++) {
      const y = 8 + i * 3;
      parts += `<path d="M17 ${y + 3}Q${i % 2 ? 6 : 27} ${y - 5} ${i % 2 ? 9 : 24} ${y + 2}Q20 ${y + 6} 17 ${y + 3}" fill="${color}"/>`;
    }
    if (kind === 'emberroot') parts += '<path d="M12 24l6-5 4 4-8 6z" fill="#c98552"/>';
  } else if (kind === 'ore')
    parts =
      '<path d="M6 23l3-12 10-5 8 9-4 12-10 1z" fill="#718c9f" stroke="#b5c5c9"/><path d="M9 11l10 6 8-2M19 17l-6 11" fill="none" stroke="#d8e4db"/><path d="M15 13l4-3 3 4-3 5z" fill="#ac91e3"/>';
  else if (kind === 'wood')
    parts =
      '<path d="M6 20L22 6l6 7-16 15z" fill="#977453" stroke="#c5a277"/><path d="M10 24L25 10M7 20l5 8" stroke="#5d493a"/><ellipse cx="24" cy="9" rx="4" ry="3" transform="rotate(40 24 9)" fill="#dbc297"/>';
  else if (kind === 'rations')
    parts =
      '<path d="M5 23q-1-17 12-16 11 1 10 15-9 9-22 1" fill="#cfa667" stroke="#f0d2a0"/><path d="M10 13l3 5m4-8 2 6m3-3 1 4" stroke="#886345" stroke-width="2"/>';
  else if (kind === 'bandage')
    parts =
      '<path d="M7 10l9-5 12 19-10 6z" fill="#c8cfbf" stroke="#f5edcd"/><path d="M10 10l9 17m-5-19 9 16" stroke="#94a9a3"/>';
  else if (kind === 'lens')
    parts =
      '<circle cx="15" cy="14" r="9" fill="#78cbd151" stroke="#c1a872" stroke-width="3"/><path d="M20 21l7 8" stroke="#c1a872" stroke-width="4"/><path d="M10 13q0-5 6-5" fill="none" stroke="#d2faff"/>';
  else if (kind === 'seal')
    parts =
      '<path d="M11 20l-3 11 8-4 7 3-3-12" fill="#986b60"/><circle cx="16" cy="13" r="10" fill="#b38e51" stroke="#e3cd8a"/><path d="M16 5l6 8-6 8-6-8z" fill="none" stroke="#5e5239"/>';
  else if (kind === 'staff')
    parts =
      '<path d="M9 29L22 5" stroke="#ba976a" stroke-width="3"/><path d="M18 9l-3-5 7-3 6 6-5 7z" fill="#526d66" stroke="#c5b880"/><path d="M20 6l3-2 1 5-3 2z" fill="#b4e9bc"/>';
  else if (kind === 'sword')
    parts =
      '<path d="M11 23L23 3l4 1-1 6-12 15z" fill="#bad1d7" stroke="#edf1d5"/><path d="M7 21l11 7M10 25l-5 6" stroke="#c2a169" stroke-width="3"/>';
  else if (kind === 'bow')
    parts =
      '<path d="M10 3Q33 16 10 29" fill="none" stroke="#bb9566" stroke-width="3"/><path d="M10 3L15 16 10 29M6 16h21" fill="none" stroke="#d8cba6"/><path d="M28 16l-5-3v6z" fill="#b6c9ca"/>';
  else if (kind === 'ward')
    parts =
      '<path d="M16 2L28 10 26 24 16 31 6 24 4 10z" fill="#8bc7ce30" stroke="#9bdddf"/><path d="M16 8v17M10 15l6-7 6 7" fill="none" stroke="#dbedc9" stroke-width="2"/>';
  else if (kind === 'hand')
    parts =
      '<path d="M8 18v-7q2-4 4 0V6q2-4 4 0v5-7q3-2 4 1v7-4q3-2 4 1v11q-3 10-10 9-7-3-9-10 1-4 4-1" fill="#c1aa84" stroke="#ead8b1"/>';
  else
    parts = `<path d="M12 4h9v5l4 5v14H7V14l5-5z" fill="${kind === 'salve' ? '#9aabc3' : '#81bdab'}" stroke="#d7e3bd"/><path d="M12 4h9M9 19h14" stroke="#b29869" stroke-width="3"/><path d="M14 13v10m-4-5h9" stroke="#e9edd1" stroke-width="2"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${parts}</svg>`;
}
