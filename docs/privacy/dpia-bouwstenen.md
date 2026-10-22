# DPIA-bouwstenen Pensuma

_Bouwstenen voor een gegevensbeschermingseffectbeoordeling (DPIA, AVG art. 35) door [[naam school]].
De school voert de DPIA uit en neemt de besluiten; dit document levert de feiten over de software._

## Waarom een DPIA?

Pensuma verwerkt gegevens van kinderen (een kwetsbare groep). Het optionele logboek tijdens toetsen is
een vorm van systematische monitoring. Daarmee voldoet de verwerking aan twee criteria van de EDPB-lijst,
en wordt een DPIA sterk aangeraden. Zonder het logboek (alleen oefenen en toetsen nakijken) is het risico
duidelijk lager; de school kan besluiten het logboek niet te gebruiken.

## 1. Systematische beschrijving

- **Wat:** een webapplicatie waarin leerlingen informatica-toetsen maken (Python, meerkeuze, open vragen)
  en docenten toetsen maken, klaarzetten en nakijken.
- **Wie:** leerlingen (12–18 jaar) en docenten informatica van de school.
- **Gegevens:** zie het verwerkingsregister (`verwerkingsregister.md`) en de privacybijsluiter §3.
- **Gegevensstromen:** browser ↔ eigen server (TLS) ↔ eigen database. Geen externe diensten, geen
  doorgifte buiten de EU. Back-ups bij [[partij]] in [[land]].
- **Levenscyclus:** aanmaken door de docent (import) → gebruik in afnames → automatische verwijdering na
  de bewaartermijn of bij het afsluiten van het schooljaar → back-ups verlopen na [[30]] dagen.

## 2. Noodzaak en evenredigheid

- **Doelbinding:** alleen onderwijs, toetsing, beveiliging en verantwoording; geen profilering, reclame
  of verkoop.
- **Dataminimalisatie:** geen adres, BSN, foto, ouders of bijzondere gegevens. Leerlingen hebben een
  e-mailadres-placeholder, geen echt e-mailadres. Faciliteiten zonder reden of diagnose. Het logboek
  slaat geen inhoud op.
- **Subsidiariteit:** papieren toetsen zijn mogelijk, maar programmeren hoort bij het vak en wordt
  digitaal getoetst; het logboek is optioneel en er zijn minder ingrijpende alternatieven (surveillance in
  het lokaal).
- **Bewaartermijnen:** instelbaar, met verstandige standaardwaarden en automatische verwijdering.
- **Transparantie:** openbare privacyverklaring in begrijpelijke taal (`/privacy`), pagina "Mijn
  gegevens" voor leerlingen, melding vóór de start van elke toets met logboek.

## 3. Risico's voor betrokkenen

| Risico | Toelichting | Kans · impact |
| --- | --- | --- |
| Stigmatiserende focusgegevens | Een leerling krijgt het stempel "fraudeur" op basis van focusmeldingen | [[ ]] |
| Valse positieven | Focusverlies door een melding, pop-up, trage computer of een faciliteit, niet door fraude | [[ ]] |
| Function creep | Logboeken of resultaten gebruikt voor andere doelen (gedrag, beoordeling van docenten) | [[ ]] |
| Te ruime toegang | Elke docent met een account kan alle klassen zien; er is nog geen koppeling klas–docent | [[ ]] |
| Automatisch nakijken | Een fout in testgevallen geeft een te lage score die zonder controle het cijfer wordt | [[ ]] |
| Datalek | Ongeautoriseerde toegang tot antwoorden en resultaten | [[ ]] |
| Te lang bewaren | Gegevens blijven staan nadat ze niet meer nodig zijn | [[ ]] |

## 4. Maatregelen in Pensuma

- **Logboek opt-in per afname**; bij oefenen standaard uit.
- **Vooraf zichtbaar** op het startscherm, plus een indicator tijdens de toets.
- **Geen inhoud vastgelegd:** geen toetsaanslagen, scherm, camera, microfoon of klembordinhoud; bij
  plakken alleen de lengte.
- **Faciliteit "geen logboek"** per leerling, bijvoorbeeld bij een aandoening die tot veel focusverlies
  leidt (zonder de reden vast te leggen).
- **Korte bewaartermijn** voor het logboek (standaard 90 dagen), automatisch verwijderd.
- **Geen automatische gevolgen:** een melding verandert nooit een score; de interface vraagt docenten
  het gesprek aan te gaan.
- **Menselijke controle bij nakijken:** de docent kan elke score aanpassen en geeft resultaten pas vrij
  als de toets is gesloten (instelbaar).
- **Export alleen op verzoek** (opt-in) en gelogd.
- **Logboek van docenthandelingen** (inzien, wijzigen, exporteren, verwijderen) met ingekort IP-adres.
- **Bewaarblokkades** voor bezwaar- en beroepsprocedures en examendossiers.
- **Beveiliging:** zie privacybijsluiter §8.

## 5. Openstaande besluiten voor de school

- Gebruiken we het logboek tijdens toetsen, en zo ja bij welke toetsen (alleen PTA)?
- Welke bewaartermijnen stellen we vast? Wie stelt ze vast in Pensuma?
- Mag elke docent informatica alle klassen zien, of is een koppeling klas–docent nodig?
- Wie is beheerder (verwerker) en is er een verwerkersovereenkomst?
- Hoe informeren we leerlingen en ouders (bijvoorbeeld via de schoolgids)?
- Hoe gaan docenten om met focusmeldingen (protocol: eerst het gesprek)?

## 6. Medezeggenschap

Leg de DPIA, het gebruik van het logboek tijdens toetsen en het logboek van docenthandelingen voor aan
de medezeggenschapsraad (MR). De MR heeft op grond van de WMS instemmingsrecht over het
privacyreglement en over regelingen die het volgen van personeel mogelijk maken.

## 7. Conclusie (door de school in te vullen)

[[Restrisico, besluit, datum, ondertekening, datum volgende evaluatie]]
