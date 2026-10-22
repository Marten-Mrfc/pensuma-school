# Datalekprotocol Pensuma

_Voor [[naam school]] en [[naam beheerder]]. Sluit aan op het datalekprotocol van de school._

Een datalek is een inbreuk op de beveiliging waardoor persoonsgegevens verloren gaan of onrechtmatig
worden ingezien, gewijzigd of verstrekt. Ook een vermoeden telt: meld liever één keer te veel.

## 1. Ontdekken

Voorbeelden bij Pensuma:

- Een leerling kan in het account of de resultaten van een ander.
- Inlogkaarten met pincodes zijn kwijtgeraakt of gefotografeerd en gedeeld.
- Een docentaccount is gebruikt door iemand anders (gedeeld of geraden wachtwoord).
- Een export (JSON of CSV met resultaten) is naar de verkeerde persoon gestuurd.
- De server of een back-up is gehackt of onbedoeld openbaar.
- Opvallende regels in het logboek: veel "Toegang geweigerd" of "Verdacht veel mislukte
  inlogpogingen" (Privacy & gegevens → Logboek, soort handeling "Beveiliging").

## 2. Intern melden

1. **Direct** melden bij de functionaris gegevensbescherming (FG) van de school: [[e-mail FG]],
   [[telefoon]]. Op de pagina Privacy & gegevens staat het adres ook in het blok "Datalek of vermoeden
   van een datalek?".
2. De **beheerder (verwerker)** informeert de school zonder onredelijke vertraging, uiterlijk binnen de
   termijn uit de verwerkersovereenkomst ([[24 uur]]), ook als nog niet alles bekend is.
3. Leg vast: wanneer ontdekt, door wie, wat er is gebeurd, welke gegevens en hoeveel leerlingen.

## 3. Beperken (checklist)

Doe wat past bij het incident; noteer wat je doet en wanneer.

- [ ] **Alle sessies beëindigen:** Privacy & gegevens → Overzicht → "Alle sessies beëindigen" (vraagt je
      wachtwoord; tRPC `privacy.revokeAllSessions`). Iedereen behalve jij wordt uitgelogd.
- [ ] **Pincodes vernieuwen** voor de betrokken klas(sen): Klassen → klas → pincodes vernieuwen, en nieuwe
      inlogkaarten afdrukken.
- [ ] **Wachtwoorden** van betrokken docentaccounts opnieuw instellen (Docenten → wachtwoord resetten).
- [ ] **Geheimen roteren** bij een vermoeden van servertoegang: `BETTER_AUTH_SECRET` (maakt alle sessies
      én opgeslagen pincodes ongeldig, dus daarna alle pincodes vernieuwen en kaarten opnieuw afdrukken),
      het databasewachtwoord en `SETUP_TOKEN`. Herstart de applicatie.
- [ ] **Logboek exporteren** voor de periode van het incident: Privacy & gegevens → Logboek → filter op
      periode → "Exporteren (CSV)" (maximaal 31 dagen per export). Bewaar de export veilig bij het dossier.
- [ ] **Bewaarblokkade** instellen op betrokken afnames of leerlingen, zodat bewijs niet automatisch
      wordt verwijderd (Privacy & gegevens → Inzage & verwijderen → Bewaarblokkades).
- [ ] Server- en containerlogs veiligstellen (Dokploy) voordat ze roteren.
- [ ] Lek dichten (update, configuratie, toegang intrekken) en controleren dat het werkt.

## 4. Beoordelen en melden aan de AP

- De **school** (niet de verwerker) beoordeelt of het lek een risico is voor de betrokkenen.
- Is dat zo, dan meldt de school het **binnen 72 uur** na ontdekking bij de Autoriteit Persoonsgegevens
  (via het meldloket op autoriteitpersoonsgegevens.nl). Niet alles bekend? Meld toch en vul later aan.
- Bij een **hoog risico** informeert de school ook de betrokken leerlingen en, bij leerlingen jonger dan
  16, hun ouders of verzorgers, in begrijpelijke taal: wat er is gebeurd, de gevolgen en wat ze zelf
  kunnen doen.

## 5. Incidentregister

Elk (vermoed) datalek komt in het incidentregister van de school, ook als het niet gemeld hoeft te worden
(AVG art. 33 lid 5).

| Veld | Invulling |
| --- | --- |
| Nummer en datum ontdekking | |
| Gemeld door / gemeld aan | |
| Omschrijving | |
| Soort gegevens en aantal betrokkenen | |
| Oorzaak | |
| Genomen maatregelen (met tijden) | |
| Gemeld bij AP (ja/nee, datum, meldnummer, motivering) | |
| Betrokkenen geïnformeerd (ja/nee, datum) | |
| Evaluatie en verbeteringen | |

## 6. Evalueren

Bespreek elk incident na met de FG en de beheerder. Pas dit protocol, de instellingen in Pensuma of de
werkafspraken aan waar nodig.
