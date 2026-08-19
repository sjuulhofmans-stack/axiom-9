// Kaartafbeeldingen van de fysieke actiekaarten (Canva-ontwerp, zie src/assets/cards/*.webp).
// Dit blok wordt door build.py ingevuld: per kaart-id een data-URI. Handmatig bewerken heeft
// dus geen zin — vervang de .webp-bestanden en draai `python3 build.py` opnieuw.
//
// Waarom WebP op 520px: de kaarten worden hooguit ~260px breed getoond (dus 2x voor scherpe
// weergave op een retina-scherm), en zo blijft de hele set onder de 140 KB. De volledige
// drukversie staat los in Canva; deze kopie is puur voor het scherm.
const ACTION_CARD_IMAGES = {{CARD_ART}};

// Idem voor de opdrachtkaarten, maar dan uit src/assets/quests/ met het label als
// bestandsnaam ("2.1.webp"). Die map mag leeg zijn: staat er geen foto, dan tekent
// renderQuestCardFace() in 98-cards.js de kaart zelf na.
const QUEST_CARD_IMAGES = {{QUEST_ART}};

// Accentkleur + icoon per opdracht, overgenomen van het Canva-ontwerp. Staat hier en niet in
// 98-cards.js omdat "stap voor stap" dezelfde kleur gebruikt om het doelvakje, de rand om de
// kamer en de kaart in het zijpaneel bij elkaar te laten horen — en 96/97 worden eerder
// ingeladen dan 98.
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
