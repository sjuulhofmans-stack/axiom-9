# Ontwerpbron van de acht nieuwe actiekaarten

Werkbestanden van het canvas met de acht kaarten die nog geen Canva-ontwerp
hadden (Vergrendeling, Stroomonderbreking, Noodbarrière, Terugtrekbevel,
Signaalstoring, Kaartenruil, Snelroute, Herinnering).

- `*.dc.html`  één kaart per bestand; `Main.dc.html` is Vergrendeling
- `canvas.json` de indeling van de acht artboards op het canvas
- `icons.json`  de icoontekeningen, overgenomen uit `ACTION_CARD_ICONS`
                in `src/js/95-simulate.js` zodat kaart en tool hetzelfde tonen
- `fonts.json`  Barlow Condensed 500/700 + Space Mono 400, versmald tot alleen
                de tekens die op deze kaarten staan (samen 18 KB) en als
                data-URI in elke kaart ingebakken. Dat moet, want de
                PNG/PDF-export bakt Google Fonts niet mee — zonder dit zou de
                export terugvallen op een systeemletter en niet matchen met de
                eerste set.

Kaart aanpassen: bewerk het `.dc.html`-bestand en bouw het canvas opnieuw met
de seed-helper van de `design`-skill; of pas het rechtstreeks aan in het
gepubliceerde canvas en sla daar op.

Maat: 630 x 880 px op het canvas, pokerverhouding 63:88.
