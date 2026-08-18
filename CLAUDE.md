# Axiom-9 Map Generator

Bordspel-tool voor het spel Axiom-9. Het bord bestaat uit **20 tegels van 8×8 vakjes**
in een raster van 4 rijen × 5 kolommen (posities A t/m T, van links naar rechts, rij voor rij).

## Belangrijkste regel voor wie hieraan werkt

**Bewerk NOOIT `dist/axiom9.html`.** Dat is het gebouwde eindresultaat (±1,1 MB,
waarvan 800 KB het logo). Bewerk altijd de bronbestanden in `src/` en draai daarna:

```
python3 build.py
```

Dit is precies waarom het project is opgesplitst: één wijziging in de knopjes hoeft
niet het hele logo mee te slepen.

**Als je dit ook als Artifact publiceert:** dat is een aparte, niet-versiebeheerde
kopie — wijzigingen die je alleen in de live artifact doorvoert (en dus niet via
`src/` + `build.py` + commit) verdwijnen zodra de sessie/container wordt opgeruimd.
Werk dus altijd via `src/`, bouw, commit/push, en publiceer daarna pas (opnieuw) de
artifact vanuit de verse `dist/axiom9.html`. Dit is precies wat er op 2026-08-16 mis
was: de artifact liep qua functionaliteit ver voor op dit repo (hele solo-modus),
en is toen alsnog teruggehaald naar `src/`.

## Structuur

```
src/
  index.html          HTML-skelet met placeholders {{CSS}} {{JS}} {{LOGO}}
  styles.css          alle opmaak (~16 KB)
  assets/logo.b64     logo als base64 — hier zelden iets aan doen
  assets/cards/*.webp de fysieke actiekaarten (Canva-ontwerp), 520px breed.
                      De bestandsnaam MOET het kaart-id uit ACTION_CARDS zijn
                      (boots.webp, condenser.webp, ...); build.py bakt ze in als
                      ACTION_CARD_IMAGES via src/js/05-card-art.js. Nieuwe kaart
                      = plaatje erbij zetten en opnieuw bouwen, verder niets.
                      Ontbreekt een plaatje, dan tekent renderPrintedCardFace()
                      de kaart na met het inline SVG-icoon (zie 95-simulate.js),
                      dus het venster blijft werken zonder ontwerp.
  data/tiles.json     de 20 tegels + de vorm van een tegel (pattern)
  js/
    00-data.js        laadt tiles.json, bouwt tileLookup, globale state (layout, selectedSlot)
    10-rules.js       plaatsingsregels, rotatie, kamer-/opdrachtnamen, welke tegel mag waar
    20-connectivity.js naden tussen tegels + bereikbaarheid op vakjesniveau
    30-random.js      seeded random (mulberry32) — zelfde seed = zelfde bord
    40-board.js       het bord tekenen, contour, naadmarkeringen, statusregel
    50-interaction.js slepen om tegels te verwisselen, selecteren
    60-palette.js     het register onderaan (twee tabellen: Kamers / Gangen)
    70-generator.js   backtracking-solver die een geldige indeling zoekt
    80-controls.js    knoppen: seed, dobbelsteen, herstel, draaien, download, legenda
    90-editor.js      tegel-editor (vakjes aan/uit klikken)
    95-simulate.js    spelsimulatie (2xD6, geen U-turn, bezette vakjes blokkeren) +
                      ACTION_CARDS/ENERGY_ACTIONS, gedeeld met 96/97
    96-walk.js        stap-voor-stap: automatische modus, 1-4 spelers + bots zichtbaar
                      over het bord, eigen tabblad
    97-solo.js        stap-voor-stap "zelf spelen": jij bestuurt één menselijke speler
                      tussen bots, met actiekaarten (Kortsluiting, Duwstoot,
                      Prioriteitspas, Zwaartekracht-laarzen, Koerscorrectie, ...)
build.py              plakt alles tot dist/axiom9.html (JS_ORDER bepaalt de volgorde,
                      dus een nieuw js/-bestand moet je daar ook toevoegen)
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
| iets aan "stap voor stap" automatisch (pion, tempo, bots) | `96-walk.js` |
| iets aan de solo-modus / actiekaarten        | `97-solo.js` (kaartdefinities zelf staan in `95-simulate.js`, `ACTION_CARDS`/`ENERGY_ACTIONS`) |
| wanneer een kaart wel/niet speelbaar is      | `97-solo.js` (`soloCardBlockReason`) — één bron voor zowel de kaartkluis als het kaartvenster |
| het kaartvenster (kluis onder de dobbelstenen + venster) | `97-solo.js` (`soloRefreshCardVault`, `soloRenderCardGrid`), opmaak in `styles.css` onder "kaartkluis + kaartvenster" |

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
  **Kamers spreiden — schaakbord-voorkeur bij het bouwen.** Kamers klonterden
  samen (gemiddeld 5,9 kamerparen rechtstreeks tegen elkaar, uitschieters tot 9;
  in de praktijk blokken van 3-4 kamers op een rij). Alleen de rangschikking
  omdraaien hielp niet — in 95% van de gevallen koos hij dezelfde indeling,
  omdat álle 60 kandidaten in de pool al even sterk geklonterd waren. Wat wél
  werkt is sturen bij de **opbouw**: `attemptSeamlessLayout` krijgt een
  `roomColorPref` mee en probeert per positie eerst de tegelsoort die volgens
  het schaakbordpatroon op dat veld hoort. Het bord is 4×5 = 10 velden per
  kleur en er zijn precies 10 kamers, dus dat patroon is exact de indeling
  zonder enkele kamer-kamer-grens. Let op: dit is een **volgorde, geen filter**
  — elke kandidaat wordt nog steeds geprobeerd, dus de zoektocht blijft
  compleet. Gemeten over 250 indelingen (origineel vs. nieuw, één proces):
  kamerparen 5,88 → 2,15 gemiddeld, maximum 9 → 4, het aandeel met ≥6 paren
  0% (was 58,8%), en 26% haalt nu een perfect schaakbord (0 paren). Dode tegels
  bleven 0,000 (100% van de indelingen dode-tegel-vrij, ongewijzigd), wurgpunten
  0,000, `minTileBetweenness` 47,2 → 46,8 (verwaarloosbaar), opdrachtafstand
  8,7 → 11,4 (beter), en het zoeken werd niet trager (164 → 152 pogingen).
  Enige lichte achteruitgang: `startBalanceScore` 0,589 → 0,628 — criterium 9,
  dus laag gewicht.
  **Meetvalkuil bij dit soort tests:** meet een kandidaat altijd vóór
  `applyRandomBoardFlip`, of laat de rotaties met rust. Meet je ná de
  spiegeling en roep je dan `applyCornerRotations` aan, dan worden alle
  niet-hoektegels op 0 gezet terwijl een gespiegeld bord 180° nodig heeft — je
  meet dan een spookbord met kapotte naden (gaf 0,46 "dode tegels" waar het er
  echt 0 waren). De spiegeling is puntsymmetrisch en verandert geen enkele
  afstand, dus vóóraf meten is altijd correct én simpeler.
- Spelsimulatie (`95-simulate.js`): 2×D6 = exact aantal te lopen stappen, geen
  U-turn, bezette vakjes (andere spelers) blokkeren. Uitzondering: land je exact
  op je eigen opdrachtvakje met minder dan de volledige worp, dan stop je daar
  en vervalt de rest. Elke speler heeft een eigen geschud stapeltje opdrachten
  1–9 (labels `2.1`–`2.9`); wie als eerste 6 opdrachten voltooit wint. Draait
  altijd op de indeling die op dat moment in de tool staat.
- **Beurtvolgorde in de solo-modus** (`97-solo.js`, `soloPhase`): eerst je
  energie-actie kiezen en direct inzetten (`choose-action`, vóór het dobbelen)
  — dan dobbelen (`rolling`) — dan stappen zetten (`moving`), waarbij je vóór
  de eerste stap of tussen stappen door hooguit 1 actiekaart mag spelen/afleggen
  (`soloRenderMoveCardRow`). Er is dus geen apart moment vóór de worp om een
  kaart te spelen — ook Zwaartekracht-laarzen en Stuwlading niet, ondanks dat
  die de worp zelf raken (zie de toelichting bij `SOLO_MOVE_ROW_EXCLUDE`). Wie
  een opdracht bereikt trekt een kaart uit de gedeelde stapel (max 2 op hand) —
  dat blijft de enige manier om aan actiekaarten te komen.

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
