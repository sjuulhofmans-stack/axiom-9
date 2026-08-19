# Axiom-9 Map Generator

Bordspel-tool voor het spel Axiom-9. Het bord bestaat uit **20 tegels van 8×8 vakjes**
in een raster van 4 rijen × 5 kolommen (posities A t/m T, van links naar rechts, rij voor rij).

## Belangrijkste regel voor wie hieraan werkt

**Bewerk NOOIT `dist/axiom9.html`.** Dat is het gebouwde eindresultaat (±860 KB,
waarvan 800 KB het logo). Bewerk altijd de bronbestanden in `src/` en draai daarna:

```
python3 build.py
```

Dit is precies waarom het project is opgesplitst: één wijziging in de knopjes hoeft
niet het hele logo mee te slepen.

## Structuur

```
src/
  index.html          HTML-skelet met placeholders {{CSS}} {{JS}} {{LOGO}}
  styles.css          alle opmaak (~16 KB)
  assets/logo.b64     logo als base64 — hier zelden iets aan doen
  assets/cards/*.webp foto's van de actiekaarten (Canva), build.py injecteert ze in 05-card-art.js
  assets/quests/*.webp idem voor opdrachtkaarten, optioneel — leeg = eigen SVG-tekening
  data/tiles.json     de 20 tegels + de vorm van een tegel (pattern)
  js/
    00-data.js        laadt tiles.json, bouwt tileLookup, globale state (layout, selectedSlot)
    05-card-art.js    kaartafbeeldingen (build.py-geinjecteerd) + QUEST_CARD_ART (SVG-iconen/tints)
    10-rules.js       plaatsingsregels, rotatie, kamer-/opdrachtnamen, welke tegel mag waar
    20-connectivity.js naden tussen tegels + bereikbaarheid op vakjesniveau
    30-random.js      seeded random (mulberry32) — zelfde seed = zelfde bord
    40-board.js       het bord tekenen, contour, naadmarkeringen, statusregel
    50-interaction.js slepen om tegels te verwisselen, selecteren
    60-palette.js     het register onderaan (twee tabellen: Kamers / Gangen)
    70-generator.js   backtracking-solver die een geldige indeling zoekt
    80-controls.js    knoppen: seed, dobbelsteen, herstel, draaien, download, legenda
    90-editor.js      tegel-editor (vakjes aan/uit klikken)
    95-simulate.js    spelsimulatie (2xD6 + energiesteen, kaarten, geen U-turn, bezette vakjes blokkeren)
    96-walk.js        stap-voor-stap: automatische weergave (1-4 spelers), eigen tabblad
    97-solo.js        stap-voor-stap: zelf spelen (mix van mens/bot, kaarten- en energie-UI)
    98-cards.js        tabblad "Kaarten": overzicht van alle opdracht- en actiekaarten
build.py              plakt alles tot dist/axiom9.html, injecteert tiles.json + kaartfoto's
dist/axiom9.html      GEBOUWD — niet handmatig bewerken
```

De JS-bestanden worden in bovenstaande volgorde achter elkaar geplakt in één
`<script>`. Er zijn dus geen imports/exports; alles deelt één scope. Nieuwe
functies moeten gedefinieerd staan vóór de plek waar ze bij het laden worden
aangeroepen (functiedeclaraties worden gehoist, `const`/`let` niet).

## Waar moet ik zijn?

| Ik wil...                                  | Bestand              |
|--------------------------------------------|----------------------|
| een tegel van vorm veranderen               | `src/data/tiles.json` |
| een kamer hernoemen / kamer↔gang wisselen   | `10-rules.js` (`ROOM_NAMES`) |
| een opdracht hernoemen (2.1–2.9)            | `10-rules.js` (`QUEST_NAMES`) — puur thematisch, geen spelregel |
| regel wijzigen over waar een tegel mag liggen | `10-rules.js` (`canTileGoInSlot`) |
| de generator slimmer/anders maken           | `70-generator.js`     |
| kleuren, formaat vakjes, mobiel             | `styles.css`          |
| een knop toevoegen                          | `index.html` + `80-controls.js` |
| iets aan de tegel-editor                    | `90-editor.js`        |
| de spelsimulatie aanpassen                  | `95-simulate.js`      |
| iets aan "stap voor stap" (pion, tempo)     | `96-walk.js` (automatisch) / `97-solo.js` (zelf spelen) |
| energiesteen-acties of hun kosten/drempels balanceren | `95-simulate.js` (`ENERGY_DIE_FACES`, `ENERGY_ACTIONS`, `ENERGY_JUMP_RANGE`, `REORDER_BLIND_THRESHOLD`) |
| actie-/opdrachtkaarten wijzigen             | `95-simulate.js` (`ACTION_CARDS`) voor spelregels · `98-cards.js` voor het tabblad · `05-card-art.js` voor plaatjes/iconen |

## Spelregels die in de code zitten

- Beweging is **horizontaal/verticaal**, nooit diagonaal.
- Een zijde van een tegel is een **doorgang** als beide deurvakjes gevuld zijn.
  Deurvakjes: N=(0,3)(0,4), Z=(7,3)(7,4), W=(3,0)(4,0), O=(3,7)(4,7).
- Op een **hoekpositie** (A, E, P, T) mag geen doorgang het bord af wijzen.
  Daardoor passen tegel 1 en 16 alleen op A en P; E en T kunnen 10/5 resp. 20/5 zijn.
- **4-weg kruisingen** (tegels 7, 8, 9, 13) liggen altijd binnenin op G/H/I/L/M/N.
- Tegel **8** (Hibernatie) bevat de vier startposities 3.1–3.4 en hoort ook binnenin.
  Als enige kamertegel heeft hij bewust **geen** opdrachtvakje — de tegel-editor
  staat dat uitzonderlijk toe (zie `tileValidationIssues` in `90-editor.js`).
- De generator zoekt een indeling **zonder doodlopende naden** en waarbij alle
  20 tegels met elkaar verbonden zijn. Kandidaten (pool van 20) worden daarna
  gerangschikt op (1) `deadTileCount`; (2) kamers achter een wurgpunt;
  (3) `roomIsolationScore` — hoeveel gangen je hoogstens moet passeren van een
  kamer naar de dichtstbijzijnde andere kamer; (4) `questSpacingScore.minDist` —
  kortste loopafstand tussen twee opdrachtvakjes, zo groot mogelijk;
  (5) `questCoverageScore`; (6) eerlijkheid startposities. Zie `70-generator.js`.
  **Waarom `deadTileCount` bovenaan staat:** "dicht bij een opdracht" bleek niet
  genoeg — een buitenrand-lus kan 5 stappen van een opdracht liggen en toch 0
  bezoeken krijgen, omdat spelers alleen van opdracht naar opdracht reizen. De
  test is gevalideerd tegen de simulatie: hij wees exact de tegels aan die 0–17
  bezoeken kregen terwijl de rest er 4000+ had.
  **Niet doen — 4-weg-tegels verplicht binnenin.** Klinkt logisch (meer grid),
  maar is gemeten over 248 indelingen en pakt averechts uit: gemiddeld 4,0-4,4
  dode tegels i.p.v. 2,6-2,9, en het aandeel indelingen zónder dode tegel zakt
  van ~17% naar ~4%. Reden: de 4-weg-tegels zijn de knooppunten; sluit je die
  allemaal in het midden op, dan houdt de buitenring alleen 2- en 3-weg-tegels
  over en dat is precies de gangenlus waar niemand komt. Twee ervan (7
  Serverruimte, 17 Kernreactor) dragen bovendien een opdracht, dus centraal
  vastzetten haalt de reden weg om naar buiten te lopen.
- Spelsimulatie (`95-simulate.js`): 2×D6 = exact aantal te lopen stappen, geen
  U-turn, bezette vakjes (andere spelers) blokkeren. Uitzondering: land je exact
  op je eigen opdrachtvakje met minder dan de volledige worp, dan stop je daar
  en vervalt de rest. Elke speler heeft een eigen geschud stapeltje opdrachten
  1–9 (labels `2.1`–`2.9`); wie als eerste 6 opdrachten voltooit wint. Draait
  altijd op de indeling die op dat moment in de tool staat.
- **Energiesteen** (`95-simulate.js`, `ENERGY_DIE_FACES = [0,1,1,2,2,3]`): rolt elke beurt
  mee naast de twee loopstenen, stapelt tot `ENERGY_MAX` (10). Drie acties, max 1 per beurt:
  Stuwstoot (3 energie, +1 loopsteen), Herprioritering (2 energie, **blind** ruilen met je
  volgende opdracht — je kent `dAlt` niet, alleen `dCur`), Noodtransport (10 energie, vrije
  sprong tot `ENERGY_JUMP_RANGE` vakjes, negeert de geen-U-turn-regel). Simulatiebots spelen
  Herprioritering via `blindReorderTarget()`: wissel alleen als je al verder dan
  `REORDER_BLIND_THRESHOLD` van je huidige opdracht af staat.
  **Balans-ijkpunt (getest, niet opnieuw doen):** in een volledige 4-speler-toernooisimulatie
  (elke speler een vaste strategie, 5000 potjes) wint Herprioritering structureel minder dan
  Stuwstoot/Noodtransport (~26% vs ~32–35%, bij een eerlijk toernooi zou dat ~25% per stuk
  zijn met vier gelijke opties, of ~31–37% relatief tussen de drie echte acties na aftrek van
  de "geeft nooit uit"-ijkpersoon). Cost verlagen (2→1) verandert vrijwel niets (26,4%→26,8%,
  binnen de foutmarge) — bij cost 2 kun je de actie al 90%+ van je beurten betalen, dus cost is
  niet de bottleneck. `REORDER_BLIND_THRESHOLD` verlagen naar 20 maakt het juist WORSE (21,3%
  — vaker een blinde gok nemen betekent vaker een gok die tegenvalt); verhogen naar 40 ook
  (17,9% — te zeldzaam om het gemiddelde nog te beïnvloeden). 31 zit dus al dicht bij het
  optimum voor déze hefboom. Wil je Herprioritering echt sterker maken, dan moet dat via het
  mechanisme zelf (bv. gedeeltelijke info, een andere drempelvorm) of via het afzwakken van
  Noodtransport/Stuwstoot — niet via cost of threshold van Herprioritering alleen.

## Controleren of het nog werkt

Na een wijziging altijd `python3 build.py` en dan `dist/axiom9.html` openen.
Check minimaal:
1. Dobbelsteenknop → melding "strak aaneengesloten, geen doodlopende doorgangen".
2. Onbereikbare vakjes (bv. na een tegel-bewerking) krijgen een roze/magenta rand
   direct op het bord — geen apart paneel, dit is de enige indicatie.
3. Een tegel selecteren → draaiknoppen gaan per **90°** (niet 180).
4. Een tegel over een andere slepen → wisselt om, rood kader = niet toegestaan.
5. Browserconsole moet leeg zijn.
6. Paneel Simulatie → "Draai simulatie" → 4 startposities laten allemaal winst
   zien, "vastgelopen potjes" is 0 of bijna 0.
7. Onderaan de simulatie: tabel "koudste tegels" — geen enkele tegel mag op
   0,0% verkeer staan. Gebeurt dat toch, dan is er een dode lus ontstaan en
   klopt `deadTileCount` in `70-generator.js` niet meer.
8. Tabblad "Stap voor stap" → "Simulatie starten" → de pion loopt zichtbaar,
   de dobbelstenen rollen, en het potje eindigt met "Gewonnen vanaf 3.x".
   Tempo moet je tijdens het lopen kunnen wijzigen; "Stoppen" moet de pion
   echt stilzetten (geen achtergrondlus die doorloopt).

## Nog te doen

- Elke opdracht (2.1–2.9) heeft nu een naam (`QUEST_NAMES` in `10-rules.js`,
  zichtbaar in het paneel "Opdrachten" en in de simulatie-uitslag) zodat de
  fysieke opdrachtkaarten een titel hebben. De speelregel zelf is nog steeds
  de tijdelijke testregel: een opdracht telt als voltooid zodra je op het
  vakje staat, zonder verdere actie of inhoud.
