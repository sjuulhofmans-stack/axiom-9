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
    95-simulate.js    spelsimulatie (2xD6, geen U-turn, bezette vakjes blokkeren)
    96-walk.js        stap-voor-stap: 1-4 spelers zichtbaar over het bord, eigen tabblad
build.py              plakt alles tot dist/axiom9.html
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
| iets aan "stap voor stap" (pionnen, tempo, pauze, aantal spelers) | `96-walk.js` |

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
- **Er wordt doorgespeeld na de winnaar**, zodat ook plaats 2 en 3 uitgespeeld
  worden. Wie binnen is stopt met spelen en verdwijnt van het bord — hij
  blokkeert dus niemand meer. Het potje eindigt zodra `simFinishTarget()`
  spelers binnen zijn: bij 4 spelers is dat de **nummer 3**, want daarmee is de
  vierde plaats al beslist en kan die speler niets meer veranderen. De formule
  is `max(1, aantal spelers - 1)`, zodat "stap voor stap" met 2 of 3 spelers
  hetzelfde principe volgt. `SIM_MAX_TURNS` staat daarom op 900 (was 500): een
  potje duurt nu ~115 beurten in plaats van ~90, en die marge houdt het aantal
  vastgelopen potjes op 0.
- Stap voor stap (`96-walk.js`) speelt hetzelfde potje met **1 t/m 4 zichtbare
  spelers** en roept daarvoor dezelfde `resolveMove()` aan als de batch — dus
  dezelfde U-turn- en blokkeerregels. Bij meerdere spelers is de "bezette
  vakjes"-set de posities van de andere pionnen, krijgt iedereen een eigen
  startvakje (willekeurig verdeeld) en wordt de beurtvolgorde geloot, precies
  zoals in `simulateOneGame()`. Wijkt hier iets af, dan liegt het tabblad over
  de batch-cijfers — houd de twee dus gelijk.

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
   zien, "vastgelopen potjes" is 0 of bijna 0. In "Eindklassering per
   startpositie" moet elke kolom (1e/2e/3e/4e) over de vier startposities
   optellen tot 100% en de gemiddelde plaats over alle vier precies 2,50 zijn —
   dat is een rekenkundige controle op de klassering, geen balanstest.
7. Onderaan de simulatie: tabel "koudste tegels" — geen enkele tegel mag op
   0,0% verkeer staan. Gebeurt dat toch, dan is er een dode lus ontstaan en
   klopt `deadTileCount` in `70-generator.js` niet meer.
8. Tabblad "Stap voor stap" → "Simulatie starten" → de pionnen lopen zichtbaar,
   de dobbelstenen rollen, en het potje eindigt met "Speler x wint vanaf 3.y"
   plus een eindklassering 1e t/m 4e; de pion van wie binnen is verdwijnt, die
   van de verliezer blijft staan.
   Tempo moet je tijdens het lopen kunnen wijzigen; "Stoppen" moet de pionnen
   echt stilzetten (geen achtergrondlus die doorloopt). "⏸ Pauze" bevriest alles
   (pionnen, dobbelsteen, log) en "▶ Hervatten" gaat verder waar hij was;
   stoppen vanuit pauze mag niet blijven hangen.
9. Stap voor stap met 4 spelers: vier gekleurde pionnen tegelijk op het bord,
   ze staan nooit op hetzelfde vakje (bezet blokkeert, net als in de batch), de
   standenbalk telt mee en "Startpositie" is alleen te kiezen bij 1 speler.

- **Energie** (`95-simulate.js`, bovenaan): naast de twee loopstenen rolt elke
  beurt een derde steen mee met kanten `– 1 1 2 2 3` (`ENERGY_DIE_FACES`),
  gemiddeld 1,5 per beurt, en de voorraad stapelt tot `ENERGY_MAX` = 10.
  **Uitgeven bestaat nog niet**, dus energie verandert op dit moment niets aan
  het spelverloop — het wordt alleen opgebouwd en gemeten. Zonder uitgeven zit
  een speler na ~7 eigen beurten aan het plafond en gaat ~77% van alle gerolde
  energie verloren; dat cijfer is de maatstaf voor wat een actie mag kosten.
  Komt het uitgeven erbij, dan is de afgesproken standaard: inzetten zodra je
  het kunt betalen (`ENERGY_SPEND_WHEN_AFFORDABLE`), maximaal één keer per beurt.
  Let op: de energiesteen trekt elke beurt een getal uit dezelfde `rand`-stroom,
  dus dezelfde seed geeft een ander verloop dan vóór deze toevoeging.

## Nog te doen

- Elke opdracht (2.1–2.9) heeft nu een naam (`QUEST_NAMES` in `10-rules.js`,
  zichtbaar in het paneel "Opdrachten" en in de simulatie-uitslag) zodat de
  fysieke opdrachtkaarten een titel hebben. De speelregel zelf is nog steeds
  de tijdelijke testregel: een opdracht telt als voltooid zodra je op het
  vakje staat, zonder verdere actie of inhoud.
