// Kaartafbeeldingen van de fysieke actiekaarten (Canva-ontwerp, zie src/assets/cards/*.webp).
// Dit blok wordt door build.py ingevuld: per kaart-id een data-URI. Handmatig bewerken heeft
// dus geen zin — vervang de .webp-bestanden en draai `python3 build.py` opnieuw.
//
// Waarom WebP op 520px: de kaarten worden hooguit ~260px breed getoond (dus 2x voor scherpe
// weergave op een retina-scherm), en zo blijft de hele set onder de 140 KB. De volledige
// drukversie staat los in Canva; deze kopie is puur voor het scherm.
const ACTION_CARD_IMAGES = {{CARD_IMAGES}};
