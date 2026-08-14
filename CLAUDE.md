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
- Op een **hoekpositie** (A, E, P, T) mag geen doorgang het bord af wijzen. Alleen een tegel
  met precies 2 open zijden die ook nog eens NAAST elkaar liggen (een L-vorm) kan ooit op een
  hoek terechtkomen (`isCornerCapable` in `10-rules.js`) — daarom kunnen 4-weg tegels (alle
  zijden open) hier NOOIT liggen, en een rechtdoor-tegel (2 open zijden tegenover elkaar) ook
  niet, hoe je 'm ook draait. Met de huidige tegelset zijn dat tegel 1, 5, 16, 20 (4 stuks).
  **Hoek-tegels roteren nu individueel om overal te passen** (`applyCornerRotations`/
  `requiredCornerRotation` in 10-rules.js): vroeger had elke hoek maar 1-2 vaste kandidaten,
  puur omdat de generator alleen de ONGEDRAAIDE tegelvorm gebruikte. Nu wordt elke hoek-geschikte
  tegel gewoon 0/90/180/270° gedraaid tot hij past, dus alle 4 kunnen op alle 4 de hoeken
  terechtkomen. Gemeten over 150 indelingen: elke hoek zag alle 4 tegels langskomen (roughly
  25-35% elk), alle 4 rotatiestanden worden echt gebruikt, en geen enkele plaatsing had ooit een
  doorgang het bord af — dood-vrij bleef 100%, kamer-kamer deuren gemiddeld 7,33 (vergelijkbaar
  met vóór deze wijziging).
  **Waarom dit niet dezelfde rotatie-vervuilingsbug herintroduceert**: deadTileCount e.a. lezen
  nog steeds via de GLOBALE `tileRotation`, en nu is er ECHT per kandidaat een andere rotatie
  nodig (niet meer alleen 0 of 180 voor het HELE bord tegelijk). Vandaar `scored(lay, fn)` in
  `70-generator.js`: die roept `applyCornerRotations(lay)` ALTIJD vlak vóór een rotatie-
  afhankelijke meting aan, per kandidaat, i.p.v. één keer bovenaan `constrainedShuffle()` te
  resetten (dat werkte toen omdat er toen maar 2 rotatiestanden voor het HELE bord bestonden;
  nu verschilt de juiste rotatie per hoekslot en per kandidaat). `applyRandomBoardFlip()` (de
  180°-muntworp) is aangepast om 180° OP TE TELLEN bij de al gezette hoekrotatie in plaats van
  'm te overschrijven, anders ging de net berekende hoekrotatie bij de helft van de klikken
  alsnog verloren.
- **4-weg kruisingen**: geen vaste regel voor WAAR ze mogen liggen (`DEG4_TILES` in
  `10-rules.js` is bewust ongebruikte data, zie de "Niet doen"-notitie verderop) — wél een vaste
  eigenschap van de tegelSET welke tegels dat kunnen zijn. Was tegel 7, 8, 9, 13, 17 (5 stuks);
  sinds de tegel-10/11-wijziging hieronder ook 10 en 11 (7 stuks in totaal).
- **Tegel 10 en 11 omgebouwd naar 4-weg** (was: 10 had alleen Z/W, 11 had N/Z/O). Doel: meer
  kruispunten voor een strakker/beter verbonden bord (gebruikersverzoek). Vorm: de ontbrekende
  zijden zijn als natuurlijke verlenging van de bestaande vorm toegevoegd (tegel 10: N+O erbij,
  29 vakjes i.p.v. 17; tegel 11: alleen W erbij, 31 vakjes i.p.v. 27) — geen kopie van de
  bestaande kruispunt-tegels 9/13, dus ze behouden hun eigen vorm/karakter. Gemeten effect over
  150 indelingen: dood-vrij 97,7% → **100%**, kamer-kamer deuren gemiddeld 6,86 → **7,51**,
  kamers met een kamerbuur 88,7% → **95,1%** — meer kruispunten geeft de backtracking-solver
  meer speelruimte om alles strak aan te sluiten. Dit haalde tegel 10 tijdelijk uit de
  hoek-kandidatenpool (een 4-weg tegel kan nooit op een hoek), maar de rotatie-wijziging
  hierboven lost dat weer op: hoek E/P zijn niet meer aan specifieke tegels gebonden.
- Tegel **8** (Hibernatie) bevat de vier startposities 3.1–3.4 en hoort ook binnenin.
  Als enige kamertegel heeft hij bewust **geen** opdrachtvakje — de tegel-editor
  staat dat uitzonderlijk toe (zie `tileValidationIssues` in `90-editor.js`).
- Tegel-editor, opdrachtgereedschap (`paintCell` in `90-editor.js`): een opdrachtlabel kan
  alleen over een AL LOOPBAAR vakje gelegd worden (of over een vakje dat al opdracht is, om
  het label te wisselen) — nooit op een lege/onbenutte sjabloonplek. Vroeger kon dat wel, en
  dan werd de tegelvorm ongemerkt uitgebreid met dat vakje; verplaatste je het label daarna
  naar een andere plek, dan viel de oude plek altijd terug op "loopbaar" (1) in plaats van
  weer leeg, ook als hij dat origineel nooit was geweest. Nu is elk vakje dat ooit een
  opdrachtlabel droeg per definitie al loopbaar geweest, dus dat terugvallen op "loopbaar" bij
  het verplaatsen klopt nu altijd.
- De generator zoekt een indeling **zonder doodlopende naden** en waarbij alle
  20 tegels met elkaar verbonden zijn. Kandidaten (pool van 20) worden daarna
  gerangschikt op (1) `deadTileCount`; (2) `minTileBetweenness` — de zwakste
  tegel z'n steun boven 0 optrekken (zie hieronder); (3) kamers achter een
  wurgpunt; (4) `roomIsolationScore` — hoeveel gangen je hoogstens moet
  passeren van een kamer naar de dichtstbijzijnde andere kamer;
  (5) `roomAdjacencyCount` — bij gelijke `roomIsolationScore` alsnog zoveel
  mogelijk kamers die ECHT rechtstreeks aan een andere kamer grenzen
  (`roomIsolationScore` let alleen op het slechtste geval, dus twee
  kandidaten kunnen daar allebei op 0 staan terwijl de een veel meer
  kamer-kamer deuren heeft); (6) `questSpacingScore.minDist` — kortste
  loopafstand tussen twee opdrachtvakjes, zo groot mogelijk; (7) `questCoverageScore`;
  (8) eerlijkheid startposities. Zie `70-generator.js`.
  **Waarom `deadTileCount` bovenaan staat:** "dicht bij een opdracht" bleek niet
  genoeg — een buitenrand-lus kan 5 stappen van een opdracht liggen en toch 0
  bezoeken krijgen, omdat spelers alleen van opdracht naar opdracht reizen. De
  test is gevalideerd tegen de simulatie: hij wees exact de tegels aan die 0–17
  bezoeken kregen terwijl de rest er 4000+ had.
  **`deadTileCount === 0` bleek niet genoeg voor de hoek-gangen — `minTileBetweenness`
  toegevoegd.** `deadTileCount` telt een tegel als "niet dood" zodra ÉÉN van de 78
  mogelijke opdracht/start-paren er zijn kortste pad doorheen legt — maar tegel 1 en
  16 (moeten altijd op een hoek liggen, mogen NOOIT een opdracht dragen) haalden dat
  vaak met precies 1 zo'n paar, en kregen in de simulatie dan ook maar 0,2-0,6%
  van het verkeer terwijl `deadTileCount` ze prima vond. `tileBetweennessCounts(lay)`
  telt nu per tegel het AANTAL paren i.p.v. alleen dood/niet-dood, en
  `minTileBetweenness(lay)` = de zwakste tegel z'n telling — hoe hoger, hoe meer marge
  boven 0. Toegevoegd als criterium #2, direct na `deadTileCount`.
  Geanalyseerd over 100 indelingen: gemiddelde `minTileBetweenness` 13,9 → **31,2**
  (bijna verdubbeld), en de laagste hoek-telling specifiek 15,0 → **33,9**.
  **Eerlijk over het effect op de ECHTE simulatie** (8 seeds × 3000 potjes, vóór/na
  vergeleken): het hoek-verkeer ging gemiddeld maar licht omhoog (3,31% → 3,67%) en
  bij meerdere seeds veranderde er nauwelijks iets — de analytische score verbeterde
  dus veel sterker dan het werkelijke speelgedrag. Reden: `minTileBetweenness` meet
  kortste-pad-telling tussen abstracte punten, niet de stochastische AI-realiteit
  (welk specifiek label toevallig waar staat, energie-acties, blokkades). Wél een
  reële winst in het slechtste geval (laagst geziene hoek-percentage 0,05% → 0,22%,
  ruim 4×) en geen enkele regressie (dood-vrij bleef 100% over alle testen). Blijft
  ook een **structurele** grens: tegel 1 en 16 zijn en blijven de kleinste,
  opdrachtloze, aan-de-rand-geforceerde tegels van de hele set.
  **Kandidatenpool vergroot naar 60 (was 20) — `constrainedShuffleAsync`.** Gemeten
  (gebruikersverzoek) over 40 indelingen per poolgrootte: pool 20 → 40 → 60 → 100 geeft
  gemiddelde `minTileBetweenness` 34,8 → 43,5 → 47,9 → 60,7 en laagste hoek-telling
  39,4 → 48,7 → 53,1 → 71,4, tegen ~660ms → 1,35s → 2,0s → 3,5s per klik. Rendement per
  seconde neemt af naarmate de pool groeit, maar de absolute winst blijft oplopen; 60
  is de gekozen balans (+35-37% t.o.v. pool 20, ~2s per klik). `MAX_ATTEMPTS` schaalt
  evenredig mee (240, was 80 — zelfde verhouding van ~4 pogingen per gewenste kandidaat).
  Bij pool 60 zou een blokkerende versie de pagina zichtbaar laten bevriezen, dus
  `constrainedShuffle` is omgebouwd naar `constrainedShuffleAsync(seedStr, onProgress)`:
  een Promise die in brokken van 30ms rekent en na elk brok `onProgress(gevonden, doel,
  poging, maxPogingen)` aanroept — exact hetzelfde patroon als `runSimulationBatch` in
  `95-simulate.js`. `applyGeneratedLayout` (`80-controls.js`) toont daarbij een
  voortgangsbalk (`#genProgress`, hergebruikt de `.sim-progress`-CSS) en schakelt
  `btnShuffle`/`btnDice` uit tijdens het rekenen. Dezelfde `simRunId`-staleness-guard als
  bij de simulatie beschermt tegen een race: `clearSimResults()` (aangeroepen door ELKE
  bordwijziging — slepen, draaien, herstellen, tegel-editor) verhoogt `simRunId` en roept
  nu ook `hideGenProgress()` aan, zodat de balk direct verdwijnt als het bord op een
  ANDERE manier verandert terwijl er nog gegenereerd wordt; `applyGeneratedLayout` checkt
  bij het teruggeven van de Promise of `simRunId` nog hetzelfde is voordat hij het
  resultaat toepast, anders wordt het stilzwijgend weggegooid. Getest: een "Herstel
  origineel"-klik tijdens een lopende generatie reset de balk/knoppen meteen en wordt
  niet alsnog overschreven zodra de verouderde generatie later terugkomt.
  **Niet doen — 4-weg-tegels verplicht binnenin.** Klinkt logisch (meer grid),
  maar is gemeten over 248 indelingen en pakt averechts uit: gemiddeld 4,0-4,4
  dode tegels i.p.v. 2,6-2,9, en het aandeel indelingen zónder dode tegel zakt
  van ~17% naar ~4%. Reden: de 4-weg-tegels zijn de knooppunten; sluit je die
  allemaal in het midden op, dan houdt de buitenring alleen 2- en 3-weg-tegels
  over en dat is precies de gangenlus waar niemand komt. Twee ervan (7
  Serverruimte, 17 Kernreactor) dragen bovendien een opdracht, dus centraal
  vastzetten haalt de reden weg om naar buiten te lopen.
  **Gevonden en gefixt — rotatie-vervuiling in `constrainedShuffle`.** De echte
  boosdoener achter de dode-tegel-klachten bleek geen tegelplaatsing te zijn,
  maar een globale-state-bug: `deadTileCount`/`startBalanceScore`/
  `questCoverageScore` lezen tegelcellen via `getDisplayValue()`, dat de
  GLOBALE `tileRotation` volgt. `applyRandomBoardFlip()` laat die global aan
  het eind van elke `constrainedShuffle()`-aanroep op overal-0 of overal-180
  staan (muntworp, zie hieronder), en handmatig een tegel draaien in de editor
  zet 'm ook. `attemptSeamlessLayout()` bouwt nieuwe kandidaten echter altíjd
  met de ongedraaide brondata — zonder reset werd de hele volgende
  scoringsronde dus zo'n **helft van de tijd** uitgevoerd tegen de verkeerde
  rotatie. Gemeten: het "beste" kandidaat in een pool leek dan `deadTileCount`
  6–11 te hebben, terwijl diezelfde pool schoon gescoord gewoon een
  dood-vrije (0) kandidaat bevatte — de generator koos zo effectief willekeurig
  in plaats van de echte beste indeling, op elke klik die volgde op een
  geflipt bord. Fix: `resetRotations()` als allereerste regel in
  `constrainedShuffle()`. Effect over 300 gegenereerde indelingen: dood-vrij
  64,3% → 97,7%, gemiddeld aantal dode tegels 0,86 → 0,03. Dit verklaart ook
  meteen waarom "4-weg-tegels op de buitenring" geen echte oorzaak is: na de
  fix is `deadTileCount` vlak (0,00–0,05) ongeacht hoeveel 4-weg-tegels op de
  buitenring liggen — dus **niet** opnieuw proberen ze naar binnen te dwingen,
  dat is het hierboven al afgeraden experiment.
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
- **Gevonden en gefixt — wie als eerste aan zet was won systematisch vaker.**
  Gemeten vóór de fix (8000 potjes): 1e aan zet 29,6% winst, 2e 25,9%, 3e 23,9%,
  4e 20,5% — een verschil van 9,1 procentpunt tussen eerste en laatste, puur
  door beurtvolgorde. Oorzaak: zodra de eerste speler zijn 6e opdracht haalde,
  kreeg hij meteen rank 1 en liep het potje door naar de volgende in de
  beurtvolgorde — maar zodra `finishTarget` bereikt werd (bij 4 spelers de
  nummer 3), stopte het potje MIDDEN in de ronde, dus een speler die later in
  de beurtvolgorde zat kon soms zijn beurt die ronde niet eens meer spelen.
  Fix (gebruikersverzoek): plaatsen worden nu pas toegekend nadat de HELE ronde
  is afgemaakt — iedereen die nog mag spelen krijgt altijd zijn beurt, ook als
  er al genoeg spelers binnen zijn voor `finishTarget`. Wie in dezelfde ronde
  als de winnaar zijn 6e opdracht haalt deelt een gelijke stand: eerst de meeste
  energie beslist, dan de meeste actiekaarten in de hand, en zijn ook die gelijk
  dan wordt de plek (en dus eventueel de winst) letterlijk gedeeld tussen de
  betrokken spelers (`resolveRoundFinishers()` in `95-simulate.js`, gebruikt
  door zowel de batch als `96-walk.js`). Gemeten ná de fix: 25,1% / 26,5% /
  24,1% / 24,4% — de 9,1-punts kloof is nagenoeg verdwenen. Getest over 5000
  potjes: ~5,2% van de potjes bevat een gedeelde plek (meestal 2-weg), en de
  "gemiddelde plaats"-som per potje bleef in alle 5000 gevallen exact 10 (dus
  de 2,50-controle in de simulatie-uitslag klopt nog steeds).
  **Statistieken bij een gedeelde plek**: een tie-groep van k spelers krijgt
  allemaal dezelfde `rank` (skip-stijl: 1,1,3 bij een 2-weg tie op de 1e plek),
  en voor eerlijke credit in percentages/gemiddeldes wordt dat verdeeld: elke
  betrokkene telt voor `1/k` mee in bijvoorbeeld winst% en de kolommen van
  "Eindklassering per startpositie". Dat reduceert bij een niet-gedeelde plek
  (verreweg de meeste potjes) gewoon tot de oude 0-of-1-uitkomst — puur een
  uitbreiding, geen gedragswijziging voor een potje zonder tie. Zie
  `rankOverlapFraction()`.
  **Bijwerking op de energie-actie-tabel**: doordat het spel nu tot een echt
  eerlijke ronde-afsluiting speelt in plaats van eerder af te kappen, verschoven
  de percentages in "Welke energie-actie wint?" licht: Stuwstoot 32-34% → nu
  **31,2%**, Herprioritering ~26% → nu **26,8%**, Noodtransport 32-34% → nu
  **34,2%**, geen energie ~7% → nu **7,9%** (15000 potjes). Volgorde en
  onderlinge verhouding zijn ongewijzigd, dus check 9 hieronder is bijgewerkt
  met deze nieuwe cijfers.
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
1. Dobbelsteenknop (of "Genereer indeling") → tijdens het rekenen (~2s) een voortgangsbalk
   ("X / 60 kandidaten...") en uitgeschakelde Genereer-/dobbelsteenknop; erna de melding
   "strak aaneengesloten, geen doodlopende doorgangen" en de balk weer verdwenen. "Herstel
   origineel" klikken TERWIJL er nog gegenereerd wordt moet de balk direct laten verdwijnen
   en mag niet later alsnog overschreven worden door de verouderde generatie.
2. Onbereikbare vakjes (bv. na een tegel-bewerking) krijgen een roze/magenta rand
   direct op het bord — geen apart paneel, dit is de enige indicatie.
3. Een tegel selecteren → draaiknoppen gaan per **90°** (niet 180).
4. Een tegel over een andere slepen → wisselt om, rood kader = niet toegestaan.
5. Browserconsole moet leeg zijn.
6. Paneel Simulatie → "Draai simulatie" → een voortgangsbalk met "X / Y potjes
   (Z%) · verstreken ... · nog ongeveer ..." moet meebewegen (test dit met een
   groot aantal, bv. 15000, anders is de run te snel voorbij om te zien); de
   knop moet tijdens het rekenen uitgeschakeld zijn en de balk moet na afloop
   weer verdwijnen. Wijzig je de indeling (Genereer indeling) terwijl er nog
   gerekend wordt, dan moet die lopende reeks stilletjes afbreken — de
   "indeling gewijzigd"-melding mag NIET later alsnog overschreven worden door
   de verouderde run (`simRunId` in `95-simulate.js` bewaakt dit). 4
   startposities laten allemaal winst zien, "vastgelopen potjes" is 0 of bijna
   0. In "Eindklassering per startpositie" moet elke kolom (1e/2e/3e/4e) over
   de vier startposities optellen tot 100% en de gemiddelde plaats over alle
   vier precies 2,50 zijn — dat is een rekenkundige controle op de
   klassering, geen balanstest.
7. Onderaan de simulatie: tabel "koudste tegels" — geen enkele tegel mag op
   0,0% verkeer staan. Gebeurt dat toch, dan is er een dode lus ontstaan en
   klopt `deadTileCount` in `70-generator.js` niet meer.
8. Tabblad "Stap voor stap" → "Simulatie starten" → de pionnen lopen zichtbaar,
   de dobbelstenen rollen, en het potje eindigt met "Speler x wint vanaf 3.y"
   (of, bij een gelijke stand, "X en Y delen de winst") plus een eindklassering
   1e t/m 4e; de pion van wie binnen is verdwijnt, die van de verliezer blijft
   staan. Wie zijn 6e opdracht haalt krijgt eerst de log-melding "... wacht op
   de rest van deze ronde" — pas als de hele ronde is afgemaakt volgt de
   definitieve plaatsing (en bij een tie: "X en Y delen de Ne plaats").
   Tempo moet je tijdens het lopen kunnen wijzigen; "Stoppen" moet de pionnen
   echt stilzetten (geen achtergrondlus die doorloopt). "⏸ Pauze" bevriest alles
   (pionnen, dobbelsteen, log) en "▶ Hervatten" gaat verder waar hij was;
   stoppen vanuit pauze mag niet blijven hangen.
9. In "Welke energie-actie wint?" liggen Stuwstoot rond de 31%, Noodtransport
   rond de 34%, Herprioritering rond de 27% (lager dan zonder kaarten:
   Herkalibratie geeft nu iedereen af en toe hetzelfde gratis, wat specifiek
   Herprioritering's voorsprong opeet) en de speler die nooit uitgeeft rond de
   8%. Loopt één actie ver weg van dit patroon, dan is de balans stuk.
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
   (Aantal spelers/Aantal bots/per-mens startpositie-keuze/Potje starten/Nieuw
   potje) mag zichtbaar zijn, niet de automatische besturing (Energie-inzet/
   Tempo/Simulatie starten) — en andersom bij "Automatisch". Wisselen van modus
   of het bord bewerken (Genereer indeling) terwijl een solo-potje loopt moet
   dat potje stilletjes afbreken (`stopSoloGame()`), niet laten hangen of
   crashen. Aantal bots loopt van 0 t/m (aantal spelers − 1); de resterende
   plekken zijn mens (hotseat, om de beurt achter hetzelfde scherm) — dus zowel
   1 speler solo, 1-tegen-3-bots als 1-tegen-1-tegen-een-vriend (2 spelers,
   0 bots) moeten werken. Elke menselijke plek krijgt vóór "Potje starten" een
   eigen startpositie-keuze mét voorproefje van de eerste opdrachtkaart; kiezen
   twee mensen dezelfde plek, dan wisselen die twee eenvoudig om. Een potje
   uitspelen: dobbelen → per worp een aangrenzend vakje aanklikken (geen-U-turn-
   vakjes en bezette vakjes van andere spelers zijn niet aanklikbaar) **of** een
   van de vier richtingsknoppen boven het bord gebruiken (die alleen
   ingeschakeld zijn in een toegestane richting) → bij 6/6 een winmelding. Beide
   manieren van bewegen moeten door elkaar blijven werken binnen dezelfde beurt.
   Bot-beurten spelen zichzelf meteen door (geen animatie/wachttijd), mens-
   beurten blijven volledig interactief. Met 1 speler staan Kortsluiting/Blinde
   Vlek/Duwstoot/Prioriteitspas nog altijd permanent uitgeschakeld (geen
   tegenstanders); met 2+ spelers werken Kortsluiting/Duwstoot/Prioriteitspas
   via een klikbare doelwit-kiezer (een kaart-knop per tegenstander), en Blinde
   Vlek wordt vanzelf aangeboden (ja/nee) zodra je route door een tegenstander
   geblokkeerd wordt — nooit los klikbaar in het actiepaneel. Bij een gedeelde
   score op het eind (gelijke energie én evenveel actiekaarten) moet de melding
   "delen de winst/Ne plaats" tonen, net als in "Automatisch".

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
  - `runSimulationBatch()` rekent in brokken (`SIM_CHUNK_BUDGET_MS` = 30ms per
    brok) i.p.v. één ononderbroken lus, en toont ondertussen een
    voortgangsbalk (`#simProgress`). Zonder dit bevriest de pagina bij grote
    aantallen potjes tot de hele run klaar is. Omdat de pagina nu tussentijds
    wél reageert, kan de gebruiker de indeling wijzigen terwijl er nog wordt
    gerekend — `simRunId` (verhoogd in zowel `runSimulationBatch()` als
    `clearSimResults()`) zorgt dat zo'n verouderde run zichzelf stilletjes
    afbreekt in plaats van straks de nieuwere "indeling gewijzigd"-melding te
    overschrijven met cijfers die niet meer bij het bord horen.
  - Kaart-illustraties (`95-simulate.js`, `ACTION_CARD_ICONS`/`ACTION_CARD_TINTS`/
    `renderActionCardFace`): elke kaart is een klein lijntekening-icoon in inline
    SVG (geen losse plaatjes — dat zou het éénbestands-HTML flink opblazen),
    gedeeld tussen de badges in de bot-standenbalk (`size:'sm'`) en de klikbare
    kaarten in de solo-modus (`size:'lg'`, `interactive:true`). Nieuwe kaart
    toevoegen? Voeg 'm toe aan `ACTION_CARDS`/`ACTION_CARD_IDS` in `95-simulate.js`
    én teken een icoon in `ACTION_CARD_ICONS` — zonder icoon crasht de render.
- **Stap voor stap, zelf spelen** (`97-solo.js`): tabblad-modusje voor **1 t/m 4
  spelers, mens én bot gemengd** (gebruikersverzoek: "ik wil een 1 tegen 1
  potje kunnen spelen tegen een vriend, maar ook een potje 1 tegen 3 bots").
  Twee losse keuzevelden boven het bord: "Aantal spelers" (1-4) en "Aantal
  bots" (0 t/m spelers−1, `soloSyncBotOptions()` vult de opties en zet 'm
  standaard op "alle overige plekken zijn bot"). De eerste `spelers−bots`
  plekken zijn altijd mens (hotseat, om de beurt achter hetzelfde scherm,
  generiek "Speler N" — geen aparte "jij"/"vriend"-styling nodig want beide
  gebruiken dezelfde interactieve UI); de rest is bot met een `ENERGY_STRATEGIES`-
  strategie, round-robin toegewezen. Bot-beurten spelen zichzelf **meteen**
  door zonder animatie (`soloResolveBotTurn()`) — dat was expliciet de wens
  ("meteen doorspelen"), mens-beurten blijven volledig interactief via de
  bestaande dobbel/klik/actiepaneel-UI.
  - **Startpositie kiezen, mét voorproefje**: vóór "Potje starten" toont
    `soloRenderSetupUI()` per menselijke plek een dropdown met startpositie
    én "eerste opdracht: X — naam" ernaast — dat voorproefje was een expliciete
    eis ("voordat je start mag je je eigen eerste opdrachtkaart bekijken").
    Om dat kloppend te houden schudt `soloRebuildSetup()` bij het intekenen van
    het scherm ieders opdrachtstapel al met een eigen `soloSetupRand`, en die
    ZELFDE stapels/objecten (niet opnieuw geschud) worden hergebruikt zodra het
    potje echt start — anders zou het voorproefje kunnen liegen. Kiezen twee
    mensen dezelfde plek, dan wisselt een simpele paarsgewijze swap ze om (geen
    cascaderende resolutie nodig bij hooguit 4 plekken).
  - **Doelwit zelf kiezen** (expliciete eis, i.p.v. auto-selectie zoals de
    bot-AI): Kortsluiting/Duwstoot/Prioriteitspas openen een nieuwe fase
    `'target-pick'` (`soloEnterTargetPicker()`) met een knop per in aanmerking
    komende tegenstander (Duwstoot alleen aangrenzende, de andere twee alle
    nog-niet-binnen spelers) — dezelfde `.action-card--lg.action-card--plain`-
    stijl als de bestaande richtingskiezer voor Zwaartekracht-laarzen.
    `soloResolveTargetCard()` voert 'm daarna uit; Duwstoot hergebruikt niet
    letterlijk `pickShoveMove()` (die kiest zelf een willekeurige tegenstander)
    maar dezelfde "welke lege buur vergroot zijn afstand tot zijn eigen doel het
    meest"-berekening, toegepast op precies het gekozen doelwit.
  - **Blinde Vlek is puur reactief**, nooit los klikbaar: staat in het gewone
    actiepaneel altijd uitgeschakeld met tooltip "wordt vanzelf aangeboden
    zodra je route geblokkeerd wordt". `soloAdvanceMovePhase()` biedt 'm pas
    aan (nieuwe fase `'blind-offer'`, ja/nee-knoppen) op het exacte moment dat
    de volgende stap alleen geblokkeerd wordt door een tegenstander (niet door
    een muur) én de kaart nog in de hand zit én er deze beurt nog geen andere
    actie gebruikt is. Bewuste vereenvoudiging t.o.v. de bot-AI: bezette
    vakjes tellen na een "ja" alleen voor de REST van deze beurt niet meer mee
    (herberekend vanaf de huidige positie), geen volledige herstart van de hele
    beurt vanaf het startpunt — dat sluit aan bij de eigen hint-tekst van de
    kaart ("bezette vakjes tellen deze beurt niet mee").
  - **Ronde-lus deelt dezelfde eerlijkheidslogica als de batch/animatie**:
    `soloFinishRound()`/`soloContinueLoop()`/`soloAdvanceLoop()` roepen dezelfde
    `resolveRoundFinishers()`/`simFinishTarget()` aan als `95-simulate.js` en
    `96-walk.js` — een ronde wordt altijd afgemaakt vóórdat rangen definitief
    worden, gedeelde plekken bij gelijke energie én evenveel actiekaarten. Een
    derde, niet-geanimeerde kopie van de bot-beurt-logica (`soloResolveBotTurn`)
    was hier nodig naast de al bestaande twee in `95-simulate.js`/`96-walk.js`
    — bewust geaccepteerde duplicatie, zie de noot hierboven bij "Beloningskaarten"
    over de `target.order || target.deck`-valkuil.
  - **Gevonden en gefixt tijdens het bouwen**: `soloResolveBotTurn()` riep
    `energyReorderTarget()` eerst rechtstreeks aan met het bot-spelerobject,
    maar die functie leest hardcoded `player.order[player.nextIdx]` terwijl
    solo-spelers alleen `.deck` hebben (dezelfde valkuil als hierboven bij
    Duwstoot) — crashte meteen zodra een bot Herkalibratie
    of de Herprioritering-strategie probeerde te gebruiken. Fix: een `shim =
    { order: player.deck, nextIdx: player.nextIdx }` doorgeven in plaats van
    `player` — omdat arrays by reference gaan, lopen mutaties gewoon terug in
    de echte `.deck`. Ook `soloRenderActionPanel()` liet Blinde Vlek aanvankelijk
    klikbaar-maar-inert staan i.p.v. 'm hard uit te schakelen — beide gevonden
    en gefixt vóór het testen, niet erna.
  - **Gevonden en gefixt ná oplevering — "Nieuw potje" hergebruikte vervuilde
    spelerobjecten** (gebruikersmelding: "Speler 1 krijgt telkens energie erbij,
    ook de startposities staan op de verkeerde plek"). Oorzaak: `btnWalkSoloReset`
    was verkeerd bedraad op `startSoloGame` — dezelfde handler als "Potje
    starten" — en die functie doet `soloPlayers = soloSetupPlayers` (dezelfde
    objecten, geen kopie). Bij een tweede potje waren dat dus nog steeds de
    objecten van het VORIGE potje: energie, voltooide opdrachten, handkaarten
    en positie stonden nog op de eindstand, en werden nooit teruggezet. Fix:
    `btnWalkSoloReset` roept nu `soloRebuildSetup()` aan (bouwt frisse
    spelerobjecten met energie/voortgang op 0, nieuw geschudde stapels via een
    nieuwe RNG, en toont het startpositie-scherm opnieuw) in plaats van
    `startSoloGame()` nogmaals. `stopSoloGame()` verbergt daarbij nu ook
    `#walkSoloPanel` weer (deed dat nog niet), anders bleef er een lege
    bordered box zichtbaar op het setup-scherm.
  Elke mens dobbelt zelf (knop), kiest na elke worp zelf een aangrenzend vakje
  om naartoe te lopen (klikbare vakjes krijgen de `.walk-clickable`-klasse, en
  zijn bezette vakjes van andere spelers uitgesloten). Boven
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
  - Met **1 speler** (geen bots, geen medespelers) hebben Kortsluiting, Blinde
    Vlek, Duwstoot en Prioriteitspas nooit een doelwit; ze staan dan permanent
    uitgeschakeld in het actiepaneel (`WALK_SOLO_NO_OPPONENT_CARDS`), met een
    tooltip die uitlegt waarom — niet stilzwijgend verbergen, dat oogt als een
    bug. Met 2+ spelers werken ze wél, via de doelwit-kiezer/reactieve
    aanbieding hierboven.
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
