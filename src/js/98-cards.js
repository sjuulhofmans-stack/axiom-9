// ---------- tabblad "Kaarten" ----------
// Toont het hele kaartspel op één plek: de negen opdrachtkaarten (2.1-2.9) en alle
// achttien actiekaarten. Puur een overzicht — je kunt hier niets spelen, het is bedoeld
// om naast het bord te leggen en om te controleren of code en drukwerk hetzelfde zeggen.
//
// Actiekaarten gebruiken renderPrintedCardFace() uit 95-simulate.js, dus die tonen hier
// exact dezelfde kaart als in het kaartvenster van de solo-modus: de Canva-foto als die
// er is, anders de nagetekende versie.
//
// Opdrachtkaarten worden hier nagetekend. Reden: de Canva-export van de opdrachtkaarten
// is vanuit deze omgeving niet te downloaden, en een nagetekende kaart heeft bovendien
// het voordeel dat de kamernaam meeloopt met de indeling — verschuif je 2.4 naar een
// andere tegel, dan verandert de kaart mee. Zodra er wél .webp-bestanden in
// src/assets/quests/ staan (bestandsnaam = het label, dus "2.1.webp") wint die foto,
// net als bij de actiekaarten.

// accentkleur + icoon per opdracht, overgenomen van het Canva-ontwerp
const QUEST_CARD_ART = {
  '2.1': { tint: '#f5a623', icon: `<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="9.5"/>
    <line x1="3" y1="24" x2="8" y2="24"/><line x1="40" y1="24" x2="45" y2="24"/>
    <path d="M26.5 11 L16 26.5 L23 26.5 L21 37 L32 21.5 L25 21.5 Z" fill="currentColor" stroke-width="1.6"/>` },
  '2.2': { tint: '#e8752a', icon: `<rect x="9" y="13" width="30" height="24" rx="1.5"/>
    <line x1="9" y1="21" x2="39" y2="21"/><line x1="9" y1="30" x2="39" y2="30"/><line x1="21" y1="21" x2="21" y2="37"/>
    <circle cx="14.5" cy="17" r="1.4" fill="currentColor"/>
    <circle cx="31" cy="31" r="5.5"/><line x1="35" y1="35" x2="41" y2="41"/>` },
  '2.3': { tint: '#f0554d', icon: `<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="11"/><circle cx="24" cy="24" r="6"/>
    <circle cx="24" cy="24" r="2.6" fill="currentColor" stroke="none"/>
    <line x1="24" y1="3" x2="24" y2="7"/><line x1="24" y1="41" x2="24" y2="45"/>
    <line x1="3" y1="24" x2="7" y2="24"/><line x1="41" y1="24" x2="45" y2="24"/>` },
  '2.4': { tint: '#e8559e', icon: `<rect x="8" y="8" width="32" height="32" rx="4"/>
    <circle cx="16" cy="16" r="2.6"/><circle cx="24" cy="16" r="2.6"/><circle cx="32" cy="16" r="2.6"/>
    <circle cx="16" cy="24" r="2.6"/><circle cx="24" cy="24" r="2.6" fill="currentColor"/><circle cx="32" cy="24" r="2.6"/>
    <circle cx="16" cy="32" r="2.6"/><circle cx="24" cy="32" r="2.6"/><circle cx="32" cy="32" r="2.6"/>` },
  '2.5': { tint: '#8b6fe8', icon: `<circle cx="24" cy="24" r="14"/>
    <path d="M24 12 L36 24 L24 36 L12 24 Z"/>
    <circle cx="24" cy="24" r="2.2" fill="currentColor" stroke="none"/>
    <line x1="24" y1="4" x2="24" y2="10"/><line x1="8" y1="24" x2="12" y2="24"/><line x1="36" y1="24" x2="40" y2="24"/>` },
  '2.6': { tint: '#3d8bf0', icon: `<rect x="8" y="16" width="32" height="22" rx="3"/>
    <path d="M19 16 v-3 a2 2 0 0 1 2-2 h6 a2 2 0 0 1 2 2 v3"/>
    <line x1="8" y1="33" x2="40" y2="33"/>
    <path d="M22 21 h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 v-4 h4 Z" fill="currentColor" stroke-width="1.4"/>` },
  '2.7': { tint: '#35c4c4', icon: `<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="10"/>
    <rect x="18.5" y="18.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>
    <line x1="24" y1="4" x2="24" y2="9"/><line x1="24" y1="39" x2="24" y2="44"/>
    <line x1="4" y1="24" x2="9" y2="24"/><line x1="39" y1="24" x2="44" y2="24"/>
    <line x1="12" y1="12" x2="16.5" y2="16.5"/><line x1="31.5" y1="31.5" x2="36" y2="36"/>` },
  '2.8': { tint: '#3fbf6f', icon: `<rect x="9" y="9" width="30" height="30" rx="1.5"/>
    <line x1="19" y1="9" x2="19" y2="39"/><line x1="29" y1="9" x2="29" y2="39"/>
    <line x1="9" y1="19" x2="39" y2="19"/><line x1="9" y1="29" x2="39" y2="29"/>
    <circle cx="15" cy="15" r="3"/>
    <path d="M29 24 L34.5 29.5 L29 35 L23.5 29.5 Z" fill="currentColor" stroke-width="1.6"/>` },
  '2.9': { tint: '#a8cc3a', icon: `<path d="M18 12 L30 12 L36 34 L12 34 Z"/>
    <line x1="14.5" y1="21" x2="33.5" y2="21"/><line x1="13" y1="28" x2="35" y2="28"/>
    <circle cx="24" cy="17" r="2.4" fill="currentColor" stroke="none"/>
    <line x1="18" y1="38" x2="18" y2="43"/><line x1="24" y1="38" x2="24" y2="45"/><line x1="30" y1="38" x2="30" y2="43"/>` },
};
const QUEST_CARD_IDS = Object.keys(QUEST_CARD_ART);

// De kamer waar een opdracht op ligt, opgezocht via de tegel — dus als je de indeling of
// een tegel wijzigt, klopt de kaart nog steeds. Gangen hebben geen naam in ROOM_NAMES.
function questCardRoom(label){
  const tid = findLabelTile(label);
  if (!tid) return '—';
  return ROOM_NAMES[tid] || `Gang ${tid}`;
}

function renderQuestCardFace(label){
  const img = QUEST_CARD_IMAGES[label];
  const name = QUEST_NAMES[label] || label;
  if (img) return `<img src="${img}" alt="Opdracht ${label} — ${name}">`;
  const art = QUEST_CARD_ART[label];
  return `<span class="quest-card" style="--q-tint:${art.tint}">
    <span class="quest-card-top">
      <span class="quest-card-badge">${label}</span>
      <span class="quest-card-kicker">OPDRACHT</span>
    </span>
    <span class="quest-card-title">${name}</span>
    <svg class="quest-card-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${art.icon}</svg>
    <span class="quest-card-rule"></span>
    <span class="quest-card-foot">
      <span class="quest-card-kicker">KAMER</span>
      <span class="quest-card-room">${questCardRoom(label)}</span>
    </span>
  </span>`;
}

// ---------- opbouw van het tabblad ----------
const CARDS_CATEGORY_ORDER = ['amber', 'start', 'quest', 'danger', 'dim'];
const CARDS_CATEGORY_LABELS = {
  amber: 'Beweging', start: 'Energie', quest: 'Nut', danger: 'Verstoring', dim: 'Informatie',
};
const cardsQuestGrid  = document.getElementById('cardsQuestGrid');
const cardsActionWrap = document.getElementById('cardsActionWrap');
const cardsZoom       = document.getElementById('cardsZoom');
const cardsZoomFace   = document.getElementById('cardsZoomFace');
const cardsZoomCap    = document.getElementById('cardsZoomCap');

// één kaart in de vitrine: de kaart zelf plus een bijschrift, aanklikbaar om te vergroten
function cardsShelfItem(face, tintClass, tintStyle, name, sub){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card-show' + (tintClass ? ' ' + tintClass : '');
  if (tintStyle) btn.style.setProperty('--card-tint', tintStyle);
  btn.innerHTML = `<span class="card-show-face">${face}</span>
    <span class="card-show-cap"><b>${name}</b><span>${sub}</span></span>`;
  btn.addEventListener('click', () => openCardsZoom(face, tintClass, tintStyle, name, sub));
  return btn;
}

function openCardsZoom(face, tintClass, tintStyle, name, sub){
  cardsZoomFace.className = 'cards-zoom-face' + (tintClass ? ' ' + tintClass : '');
  if (tintStyle) cardsZoomFace.style.setProperty('--card-tint', tintStyle);
  else cardsZoomFace.style.removeProperty('--card-tint');
  cardsZoomFace.innerHTML = face;
  cardsZoomCap.innerHTML = `<b>${name}</b><span>${sub}</span>`;
  cardsZoom.hidden = false;
}
function closeCardsZoom(){ cardsZoom.hidden = true; }

// Wordt opnieuw gedraaid zodra je het tabblad opent: de kamernaam op een opdrachtkaart
// hangt aan de tegel, en die kan intussen bewerkt of verplaatst zijn.
function renderCardsTab(){
  cardsQuestGrid.innerHTML = '';
  for (const label of QUEST_CARD_IDS){
    const tint = QUEST_CARD_ART[label].tint;
    cardsQuestGrid.appendChild(cardsShelfItem(
      renderQuestCardFace(label), '', tint,
      `${label} · ${QUEST_NAMES[label] || label}`,
      `kamer: ${questCardRoom(label)}`,
    ));
  }

  if (cardsActionWrap.childElementCount) return;   // actiekaarten veranderen niet, één keer bouwen
  for (const cat of CARDS_CATEGORY_ORDER){
    const ids = ACTION_CARD_IDS.filter(id => ACTION_CARD_TINTS[id] === cat);
    if (!ids.length) continue;
    const head = document.createElement('h3');
    head.className = 'cards-subhead';
    head.innerHTML = `${CARDS_CATEGORY_LABELS[cat]} <span>${ids.length} ${ids.length === 1 ? 'kaart' : 'kaarten'} · 2× in de stapel</span>`;
    cardsActionWrap.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'cards-shelf';
    for (const id of ids){
      grid.appendChild(cardsShelfItem(
        renderPrintedCardFace(id), 'action-card--' + cat, '',
        ACTION_CARDS[id].name, ACTION_CARDS[id].hint,
      ));
    }
    cardsActionWrap.appendChild(grid);
  }
}

cardsZoom.addEventListener('click', closeCardsZoom);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !cardsZoom.hidden) closeCardsZoom();
});
