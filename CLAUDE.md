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
    96-walk.js        stap-voor-stap "automatisch": 1-4 bot-spelers zichtbaar over het bord
    97-solo.js        stap-voor-stap "zelf spelen": jij dobbelt/loopt/speelt kaarten zelf
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
| iets aan "stap voor stap" automatisch (pionnen, tempo, pauze, aantal spelers) | `96-walk.js` |
| iets aan "stap voor stap" zelf spelen (jouw acties, klikbare vakjes)   | `97-solo.js` |

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
9. In "Welke energie-actie wint?" liggen Stuwstoot en Noodtransport rond de
   32-34%, Herprioritering rond de 26% (lager dan zonder kaarten: Herkalibratie
   geeft nu iedereen af en toe hetzelfde gratis, wat specifiek Herprioritering's
   voorsprong opeet) en de speler die nooit uitgeeft rond de 7%. Loopt één
   actie ver weg van dit patroon, dan is de balans stuk.
10. In "Beloningskaarten" (zelfde paneel) moet elke kaart behalve Prioriteitspas
   op een aantal keer per potje > 0 staan; Prioriteitspas hoort op 0,00 (geen
   mechanisch effect in de bot-simulatie, geen bug). Het aandeel trekkansen
   verloren aan een volle hand ligt rond de 15-20%.
11. Stap voor stap met 4 spelers: vier gekleurde pionnen tegelijk op het bord,
   ze staan nooit op hetzelfde vakje (bezet blokkeert, net als in de batch), de
   standenbalk telt mee, "Startpositie" is alleen te kiezen bij 1 speler, en
   getrokken beloningskaarten verschijnen als kleine badges naast elke speler.
12. Mobiel (breedte ≤ 640px, test o.a. op 320/375/414px): het bord (Kaart maken,
   Stap voor stap én de drukte-heatmap in Simulatie) moet **passen zonder
   horizontaal te scrollen** — controleer dat `document.documentElement.scrollWidth`
   niet groter is dan `clientWidth`. Wordt dat toch breder, dan klopt de
   `clamp(...)`-formule voor `--cell` in `styles.css` niet meer met de werkelijke
   marges van `body`/`.panel` op dat breakpoint.
13. Tabblad "Stap voor stap" → "Zelf spelen": alleen de solo-besturing
   (Startpositie/Potje starten/Nieuw potje) mag zichtbaar zijn, niet de
   automatische besturing (Aantal spelers/Energie-inzet/Tempo/Simulatie starten)
   — en andersom bij "Automatisch". Wisselen van modus of het bord bewerken
   (Genereer indeling) terwijl een solo-potje loopt moet dat potje stilletjes
   afbreken (`stopSoloGame()`), niet laten hangen of crashen. Een potje uitspelen:
   dobbelen → per worp een aangrenzend vakje aanklikken (geen-U-turn-vakjes zijn
   niet aanklikbaar) **of** een van de vier richtingsknoppen boven het bord
   gebruiken (die alleen ingeschakeld zijn in een toegestane richting) → bij 6/6
   een winmelding. Beide manieren van bewegen moeten door elkaar blijven werken
   binnen dezelfde beurt. Kortsluiting/Blinde Vlek/Duwstoot/Prioriteitspas staan
   altijd uitgeschakeld in het actiepaneel (tooltip legt uit waarom); de overige
   kaarten en alle drie de energie-acties moeten wél werken, inclusief de
   richtingskeuze bij Zwaartekracht-laarzen en de vakjeskeuze bij Noodtransport.

- **Energie** (`95-simulate.js`, bovenaan): naast de twee loopstenen rolt elke
  beurt een derde steen mee met kanten `– 1 1 2 2 3` (`ENERGY_DIE_FACES`),
  gemiddeld 1,5 per beurt, en de voorraad stapelt tot `ENERGY_MAX` = 10. Energie
  die je deze beurt rolt mag je meteen inzetten. Er is **maximaal één actie per
  beurt**, uit drie (`ENERGY_ACTIONS`):
  - **3 Stuwstoot** — gooi met 3 loopstenen in plaats van 2 (+3,5 stappen).
  - **6 Herprioritering** — wissel je opdracht met de volgende in je stapel,
    maar alleen als die dichterbij ligt (scheelt gemeten 7,6 stappen lopen).
  - **10 Noodtransport** — verplaats je tot `ENERGY_JUMP_RANGE` vakjes vrij:
    geen dobbelsteen, bezette vakjes tellen niet. Gebruik dit **vóór** de zet,
    zodat de opdracht binnen bereik van de stenen komt; alleen erná springen
    maakt de actie flink zwakker (26,5% winst tegen 32,4%).
  - Elke speler krijgt per potje één strategie uit `ENERGY_STRATEGIES`, geloot
    over de startposities, zodat één batch een zuiver toernooi tussen de acties
    is. Zie de tabel "Welke energie-actie wint?" in het simulatiepaneel.
  - `ENERGY_JUMP_RANGE` = 13 is **gemeten, niet gegokt** — de sweep staat in het
    commentaar bij de constante. Verzet je 'm, draai die sweep opnieuw.
  - Niet doen: een actie "negeer de geen-U-turn-regel" geven. Gemeten waardeloos —
    met die regel bereik je op elk aantal stappen exact dezelfde vakjes als
    zonder (verhouding 1,000 over 180 startposities).
  Let op: de energiesteen trekt elke beurt een getal uit dezelfde `rand`-stroom,
  dus dezelfde seed geeft een ander verloop dan vóór deze toevoeging.
- **Beloningskaarten** (`95-simulate.js`, bij `ACTION_CARDS`): wie een opdracht
  bereikt trekt een kaart van een **gedeelde**, gesloten stapel van 20 (2 van
  elk van de 10 typen, `ACTION_CARD_IDS`). Max **2 kaarten in de hand**
  (`ACTION_CARD_HAND_MAX`) — sta je al op 2, dan trek je niet, de kaart blijft
  liggen. Gebruikte kaarten gaan op de aflegstapel; is de trekstapel leeg, dan
  wordt de aflegstapel geschud en dient weer als trekstapel
  (`buildActionDeck`/`drawActionCard`). De opdrachtkaarten blijven gewoon staan
  — een beloningskaart is een bonus onderweg, geen vervanging van de 6 op te
  lossen opdrachten.
  - Een kaart spelen is **dezelfde actie-slot** als een energie-actie: hooguit
    één ding per beurt, of dat nu een kaart is of energie. Kaarten zijn gratis,
    dus een speler geeft ze voorrang boven het uitgeven van energie.
  - De tien kaarten en hun AI-voorwaarde in de simulatie (`resolveGravityBoots`,
    `pickShortCircuitTarget`, `pickShoveMove` — de rest zit inline in
    `simulateOneGame`): Zwaartekracht-laarzen (10 rechtdoor, geen bochten —
    alleen gebruikt als het doel raakt of minstens 7 stappen dichterbij komt),
    Noodrantsoen (+3 energie, alleen onder het plafond), Kortsluiting (de
    koploper mist zijn eerstvolgende energiesteen), Blinde Vlek (reageert
    alleen als de normale zet daadwerkelijk geblokkeerd werd), Herkalibratie
    (gratis versie van Herprioritering, zelfde dichterbij-voorwaarde), Duwstoot
    (duwt de tegenstander wiens afstand tot zijn eigen doel het meest toeneemt),
    Stuwlading (gratis versie van Stuwstoot, altijd gebruikt), Overdrukklep
    (redt energie die anders over het plafond ging), Herbevoorrading (trekt
    een nieuwe kaart, alleen als sluitstuk — niets anders was die beurt bruikbaar),
    Prioriteitspas (puur informatie, **geen mechanisch effect** in de bot-
    simulatie, dus altijd 0 keer ingezet in de tabel — dat is verwacht, geen bug).
  - `pickShoveMove`/`pickShortCircuitTarget`/`resolveGravityBoots` worden door
    zowel de batch als "stap voor stap" gebruikt. De batch-speler noemt zijn
    opdrachtstapel `order`, het tabblad noemt 'm `deck` — waar een functie een
    willekeurige speler uit de array pakt (niet "de huidige speler" via een
    `shim`), moet hij dus met **beide** veldnamen overweg kunnen
    (`target.order || target.deck`). Dit was al eens een bug (Duwstoot crashte
    het tabblad zodra een tegenstander adjacent stond) — vergeet dit niet
    opnieuw als je een elfde kaart toevoegt die ook naar een ANDERE speler kijkt.
  - Sectie "Beloningskaarten" in het simulatiepaneel: keer getrokken, keer
    gebruikt per kaart, en het aandeel trekkansen dat verloren ging aan een
    volle hand.
  - Kaart-illustraties (`95-simulate.js`, `ACTION_CARD_ICONS`/`ACTION_CARD_TINTS`/
    `renderActionCardFace`): elke kaart is een klein lijntekening-icoon in inline
    SVG (geen losse plaatjes — dat zou het éénbestands-HTML flink opblazen),
    gedeeld tussen de badges in de bot-standenbalk (`size:'sm'`) en de klikbare
    kaarten in de solo-modus (`size:'lg'`, `interactive:true`). Nieuwe kaart
    toevoegen? Voeg 'm toe aan `ACTION_CARDS`/`ACTION_CARD_IDS` in `95-simulate.js`
    én teken een icoon in `ACTION_CARD_ICONS` — zonder icoon crasht de render.
- **Stap voor stap, zelf spelen** (`97-solo.js`): los tabblad-modusje, geen bots.
  Jij dobbelt zelf (knop), kiest na elke worp zelf een aangrenzend vakje om
  naartoe te lopen (klikbare vakjes krijgen de `.walk-clickable`-klasse). Boven
  het bord staat ook een richtingskruis (N/O/Z/W, `#walkDirPad`) dat exact
  dezelfde stap zet als een klik op de cel — op een telefoon zijn de kleine
  vakjes lastig te raken, deze knoppen zijn 58×58px. Ernaast (op smalle
  schermen: eronder, via `flex-wrap`) staat een stappenteller (gezet/nog) die
  in `soloRenderDirPad()` meeschrijft bij elke stap — daarvoor moest je terug
  scrollen naar de dobbelsteen-HUD bovenaan om te zien hoever je nog kon lopen.
  Beide manieren werken altijd tegelijk en door elkaar: een knopklik roept
  dezelfde `soloHandleMoveClick()` aan als een celklik, en `soloRenderDirPad()`
  schakelt per stap alleen de knoprichtingen in die net als de cellen ook
  daadwerkelijk legaal zijn (geen U-turn, geen muur). Vergeet bij een nieuwe
  fase niet ook `soloHideDirPad()` aan te roepen — net zo makkelijk te vergeten
  als `soloClearClickable()`, en het kruis blijft anders zichtbaar tijdens een
  fase waarin het niet hoort (bijv. tijdens het kiezen van een Noodtransport-
  bestemming, die geen 4 maar tot 13 vakjes breed is).
  Verder kiest de speler zelf een energie-actie of handkaart aan het begin van
  de beurt — hooguit één van de twee, net als in de bot-modus. Alle drie de betaalde energie-acties
  staan hier gewoon klaar (niet vastgezet op één strategie zoals bij de bots),
  en Herkalibratie/Herprioritering zijn hier **onvoorwaardelijk**: de bot-AI
  swapt alleen als het dichterbij is, maar een mens mag zelf kiezen ook als het
  niet optimaal is — vandaar `soloUnconditionalSwap()` in plaats van het
  hergebruiken van `energyReorderTarget()` voor de daadwerkelijke uitvoering.
  - Geen tegenstanders → Kortsluiting, Blinde Vlek, Duwstoot en Prioriteitspas
    hebben altijd een doelwit nodig dat er in solo niet is; ze staan daarom
    permanent uitgeschakeld in het actiepaneel (`WALK_SOLO_NO_OPPONENT_CARDS`),
    met een tooltip die uitlegt waarom — niet stilzwijgend verbergen, dat oogt
    als een bug.
  - Zwaartekracht-laarzen laat de speler zelf een richting kiezen (N/O/Z/W) in
    plaats van de bot-AI die automatisch de beste richting bepaalt;
    `gravityBootsOptions()` in `95-simulate.js` geeft alle (tot 4) rechte lijnen
    terug zodat de UI ze als knoppen kan tonen. Noodtransport licht elk vakje
    binnen bereik op als klikbaar (tot `ENERGY_JUMP_RANGE` vakjes vrij) i.p.v.
    automatisch het beste te kiezen.
  - **Belangrijke CSS-valkuil**: een element met een eigen `display`-regel
    (zoals `.walk-controls{display:flex}`) negeert het HTML `hidden`-attribuut
    tenzij je ook `<selector>[hidden]{display:none;}` toevoegt — auteur-CSS wint
    altijd van de UA-standaardregel voor `[hidden]`, ook al is de specificiteit
    gelijk. Dit was een echte bug (de automatische besturing bleef zichtbaar in
    de solo-modus): zoek naar bestaande `[hidden]`-regels in `styles.css` als
    voorbeeld voordat je een nieuw element toggle je via `.hidden = true/false`.

## Nog te doen

- Elke opdracht (2.1–2.9) heeft nu een naam (`QUEST_NAMES` in `10-rules.js`,
  zichtbaar in het paneel "Opdrachten" en in de simulatie-uitslag) zodat de
  fysieke opdrachtkaarten een titel hebben. De speelregel zelf is nog steeds
  de tijdelijke testregel: een opdracht telt als voltooid zodra je op het
  vakje staat, zonder verdere actie of inhoud.
