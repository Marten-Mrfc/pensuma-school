# Privacybijsluiter Pensuma

_Versie 1.0 · [[datum]] · ingevuld door [[naam beheerder]] voor [[naam school]]_

Deze privacybijsluiter beschrijft hoe Pensuma omgaat met persoonsgegevens. Hij volgt de opzet van het
Model Privacybijsluiter uit het Convenant Digitale Onderwijsmiddelen en Privacy. Vul de velden tussen
`[[ ]]` in en laat het document controleren door de functionaris gegevensbescherming (FG) van de school.

> Dit document is technische ondersteuning, geen juridisch advies. De school (het bevoegd gezag) stelt de
> grondslag, de bewaartermijnen en de afspraken met de beheerder vast.

## 1. Het product

Pensuma is een toetsplatform voor het vak informatica in het voortgezet onderwijs. Docenten maken
toetsen met Python-programmeervragen, meerkeuzevragen en open vragen en zetten die klaar voor een klas
(een "afname"). Leerlingen loggen in met hun leerlingnummer en een pincode en maken de toets in de
browser. Pensuma kijkt programmeervragen automatisch na met testgevallen; de docent controleert de
resultaten en beslist over het cijfer.

- **Leverancier van de software:** open source, beheerd door [[naam beheerder]].
- **Installatie:** op een server van [[de school / de beheerder]], via Docker (Dokploy).
- **Adres van de installatie:** [[https://pensuma.school.nl]]

## 2. Rollen

| Rol | Wie | Toelichting |
| --- | --- | --- |
| Verwerkingsverantwoordelijke | [[naam bevoegd gezag]] | Bepaalt doel en middelen. |
| Verwerker | [[naam beheerder]] | Beheert de server in opdracht van de school. Bij een externe partij hoort een verwerkersovereenkomst (AVG art. 28). Is de ICT-afdeling van de school zelf beheerder, dan is er geen aparte verwerker. |
| Subverwerkers | [[hostingpartij]], [[opslag voor back-ups]] | Moeten in de EU gevestigd zijn en de gegevens in de EU opslaan. |
| Functionaris gegevensbescherming | [[naam FG]], [[e-mail FG]] | |

Draait een docent Pensuma op eigen initiatief op een eigen server, zonder afspraken met de school, dan
is dat niet toegestaan. Regel het gebruik altijd via de school en de FG.

## 3. Categorieën van persoonsgegevens

Deze indeling komt overeen met het verwerkingsregister in Pensuma zelf (Privacy & gegevens → Register
& schoolgegevens), dat uit dezelfde broncode wordt opgebouwd (`src/lib/privacy/register.ts`).

| Categorie | Betrokkenen | Gegevens |
| --- | --- | --- |
| Accountgegevens leerling | Leerlingen | Naam, leerlingnummer, gehashte pincode, account actief of geblokkeerd |
| Accountgegevens docent | Docenten | Naam, e-mailadres van school, gehasht wachtwoord |
| Inlogcodes leerlingen | Leerlingen | Pincode, versleuteld met AES-256-GCM, om inlogkaarten opnieuw af te drukken |
| Klassen en klasindeling | Leerlingen | Klasnaam, schooljaar, klaslidmaatschap |
| Antwoorden en resultaten | Leerlingen | Ingeleverde code en antwoorden, testresultaten, scores, cijfers, feedback, start- en inlevertijd |
| Logboek tijdens toetsen | Leerlingen | Altijd: code uitvoeren en testen (vraag, duur, soort fout, aantal geslaagde tests; nooit de code zelf). Alleen als de docent het aanzet: venster/tabblad verlaten, volledig scherm verlaten, plakpogingen (zonder inhoud). Kopiëren wordt niet bijgehouden |
| Inlog- en beveiligingsgegevens | Leerlingen, docenten | Sessies met IP-adres en browser, tellers van mislukte inlogpogingen en verzoeken, laatste keer inloggen |
| Technische foutmeldingen (serverlogboek) | Leerlingen, docenten | Tijdstip, functie en foutcode; bij een storing ook de gebruikers-id (een willekeurige code) en de foutcode die de gebruiker ziet; nooit invoer, antwoorden, pincodes of wachtwoorden |
| Logboek docenthandelingen | Docenten, leerlingen | Wie wanneer een leerling, een poging of pincodes bekeek, code vergeleek, en leerlinggegevens wijzigde, exporteerde of verwijderde, met ingekort IP-adres; nooit de inhoud van antwoorden, wel de oude en nieuwe score bij een scorewijziging; opschoonrapporten |
| Privacy-instellingen en bewaarblokkades | Leerlingen, docenten | Contactgegevens, bewaartermijnen, bewaarblokkades met reden |
| Faciliteiten bij toetsen | Leerlingen | Alleen een percentage verlengde tijd en twee schakelaars (plakken toegestaan, vensterwissels niet registreren); nooit een reden of diagnose |
| Weergave-instellingen | Leerlingen, docenten | Thema, lettergrootte en andere weergavekeuzes |
| Lesmateriaal en planning | Docenten, leerlingen | Toetsen, vragen, afnames, inhaaltoetsen per leerling, feedbackzinnen |

Pensuma verwerkt **geen** bijzondere persoonsgegevens (gezondheid, afkomst, geloof), geen BSN, geen
adres- of oudergegevens en geen foto's.

## 4. Doelen

1. Toetsen en oefenopdrachten afnemen in het vak informatica.
2. Antwoorden nakijken (automatisch en door de docent) en terugkoppelen aan de leerling.
3. Een eerlijke toetsafname ondersteunen: vensterwissels, volledig scherm en plakpogingen alleen als de
   docent dat aanzet; code uitvoeren en testen altijd (zonder de code zelf).
4. Het systeem beveiligen en verantwoording afleggen over toegang tot leerlinggegevens.

De gegevens worden niet gebruikt voor andere doelen: geen profilering, geen reclame, geen verkoop en
geen training van AI-modellen.

## 5. Grondslag

- Onderwijs en toetsing: **taak van algemeen belang** (AVG art. 6 lid 1 sub e), in samenhang met de
  WVO 2020. Er wordt geen toestemming gevraagd.
- Beveiliging en logboek van docenthandelingen: **wettelijke verplichting** (AVG art. 6 lid 1 sub c, in
  samenhang met art. 5 lid 2 en art. 32).

Automatisch nakijken leidt niet tot een besluit zonder menselijke tussenkomst (AVG art. 22): de docent
controleert en kan elke score aanpassen. Een melding in het logboek leidt nooit automatisch tot een
lager cijfer.

## 6. Bewaartermijnen (standaard)

De school stelt de termijnen vast in Pensuma (Privacy & gegevens → Bewaartermijnen). Pensuma verwijdert
automatisch, elke 6 uur.

| Gegevens | Standaard | Instelbaar | Automatisch |
| --- | --- | --- | --- |
| Sessies, verificatiecodes | bij verlopen (leerlingen: 12 uur na het inloggen, of eerder bij uitloggen; docenten: 12 uur na het laatste gebruik) | nee | altijd |
| Tellers voor afremmen en mislukte inlogpogingen | 24 uur | nee | altijd |
| Logboek tijdens toetsen | 90 dagen na de poging | 7–730 dagen | altijd |
| Pogingen en antwoorden (ook nooit ingeleverde) | 24 maanden na sluiten afname (of na de laatste activiteit als de afname niet sluit) | 6–120 maanden | na vaststelling door de school, als automatisch verwijderen aanstaat |
| Leerlingaccounts zonder actieve klas | 12 maanden zonder inloggen | 3–60 maanden | na vaststelling door de school, als automatisch verwijderen aanstaat |
| Logboek docenthandelingen | 24 maanden | 6–84 maanden | altijd |
| Verlopen bewaarblokkades (met reden) | 30 dagen na de einddatum | nee | altijd |
| Back-ups | [[30]] dagen | bij de beheerder | buiten de applicatie |
| Technische foutmeldingen (serverlogboek) | tot de logrotatie ze overschrijft (meegeleverde `docker-compose.yml`: hoogstens 5 × 10 MB per container) | bij de beheerder | buiten de applicatie |

Werk van schoolexamens (PTA) wordt minstens 6 maanden na het vaststellen van de uitslag bewaard
(Eindexamenbesluit VO, art. 55). Het officiële cijfer staat in de leerlingadministratie (bijvoorbeeld
Magister of SOMtoday). Met een **bewaarblokkade** sluit de school gegevens uit van verwijdering, bijvoorbeeld
tijdens een bezwaarprocedure. Stelt de school de termijnen vast met automatisch verwijderen uit, dan
verwijdert zij pogingen en oude accounts zelf (bijvoorbeeld bij het afsluiten van het schooljaar); de
privacyverklaring en Mijn gegevens zeggen dat dan ook.

## 7. Subverwerkers en locatie

| Subverwerker | Dienst | Locatie |
| --- | --- | --- |
| [[hostingpartij]] | Virtuele server | [[Nederland (EU)]] |
| [[opslag back-ups]] | Versleutelde database-back-ups | [[Nederland (EU)]] |

Er worden **geen gegevens doorgegeven buiten de EU**. Pensuma gebruikt **geen diensten van derden**: geen
analytics, geen advertenties, geen CDN, geen externe lettertypen (die worden bij het bouwen in de
applicatie opgenomen) en geen externe foutrapportage. Python draait voor het zelf testen in de browser
van de leerling en voor het nakijken op de eigen server. Een geautomatiseerde test
(`src/lib/privacy/no-third-party.test.ts`) en een browsercontrole (`bun run privacy:check-requests`)
bewaken dat dit zo blijft.

## 8. Beveiligingsmaatregelen

Deze maatregelen zijn in de software gebouwd:

- **Versleutelde verbinding (TLS)** via de reverse proxy; strikte beveiligingsheaders, waaronder een
  Content Security Policy die verbindingen naar andere domeinen blokkeert.
- **Wachtwoorden en pincodes alleen gehasht** opgeslagen (scrypt). De pincode staat daarnaast
  **versleuteld met AES-256-GCM** opgeslagen (sleutel afgeleid van het serversecret), zodat docenten
  inlogkaarten opnieuw kunnen afdrukken.
- **Afgeschermd nakijken (sandbox):** leerlingcode draait in een apart proces zonder netwerk, zonder
  schrijfrechten en zonder geheimen, met tijd- en geheugenlimieten.
- **Blokkade na mislukte inlogpogingen** (8 pogingen → 15 minuten) en afremmen van te veel verzoeken.
- **Rollen:** leerlingen zien alleen hun eigen gegevens; alleen docenten hebben beheerrechten.
- **Logboek van docenthandelingen** dat niet via de applicatie kan worden aangepast, met ingekort
  IP-adres (geen volledig IP). Het legt vast wie een leerling, een poging of pincodes bekijkt (bij een
  hele klas per leerling), code vergelijkt en leerlinggegevens wijzigt, exporteert of verwijdert. Alleen
  bij het verwijderen van een leerling wist Pensuma zelf de scores en faciliteiten uit eerdere regels.
- **Automatische verwijdering** volgens de bewaartermijnen, met respect voor bewaarblokkades.
- **Dataminimalisatie:** het logboek van vensterwissels, volledig scherm en plakpogingen staat standaard
  uit en slaat nooit geplakte of gekopieerde tekst op; kopiëren wordt niet bijgehouden. Code uitvoeren en
  testen wordt altijd vastgelegd, zonder de code zelf. Met de faciliteit "vensterwissels niet registreren"
  wordt per leerling het verlaten van het venster of tabblad niet bijgehouden en telt een verlaten
  volledig scherm niet als focusverlies; als de toets erom vraagt worden het verlaten van het volledige
  scherm en geblokkeerde plakpogingen wel vastgelegd (de faciliteit "plakken toegestaan" heft het
  blokkeren van plakken op).
- **Faciliteiten in het logboek van docenthandelingen:** alleen welke soort faciliteit is gewijzigd,
  nooit het percentage of de schakelaars zelf.

Organisatorische maatregelen van de beheerder: [[updatebeleid, toegang tot de server, back-upbeleid,
geheimhouding]].

## 9. Rechten van betrokkenen

- **Inzage en overdraagbaarheid:** leerlingen downloaden hun gegevens zelf (Mijn gegevens). Docenten
  downloaden alle gegevens van een leerling als JSON (Privacy & gegevens → Inzage & verwijderen). Het
  bestand bevat ook de gebruikte hints (en de aftrek daarvoor), bewaarblokkades met hun reden, inhaal- en
  herkansingsafnames en wie de gegevens heeft ingezien (zonder namen van docenten).
- **Verbetering:** docenten passen naam, klas en scores aan.
- **Verwijdering:** docenten verwijderen een leerling met alle gegevens. Eerdere regels in het logboek
  van docenthandelingen (wie wat wanneer bekeek of wijzigde, met leerlingnummer, zonder naam) blijven
  staan tot de bewaartermijn van het logboek voorbij is; scores en faciliteiten worden daaruit meteen
  gewist. Een nieuwe regel legt vast dat de leerling is verwijderd.
- **Beperking (art. 18):** docenten blokkeren inloggen en automatische verwijdering tot de beperking is
  opgeheven. Zolang de beperking geldt, weigert Pensuma het wijzigen van naam, leerlingnummer en
  faciliteiten (een bewuste uitzondering, bijvoorbeeld om gegevens te verbeteren, wordt in het logboek
  vastgelegd). Docenten zien de beperking onder Privacy & gegevens (bewaarblokkades); de school spreekt af
  dat scores en exports tot het einde van de procedure blijven zoals ze zijn.
- **Bezwaar:** via de school.

Verzoeken komen binnen bij de school ([[e-mail privacy]]). De school beantwoordt ze binnen een maand.
De verwerker helpt de school daarbij. Voor leerlingen jonger dan 16 oefenen ouders of verzorgers de
rechten uit.

## 10. Datalekken

De verwerker meldt een (vermoed) datalek **zonder onredelijke vertraging**, uiterlijk binnen
[[24 uur]], bij de school. De school beoordeelt of het lek binnen 72 uur bij de Autoriteit
Persoonsgegevens gemeld moet worden en of betrokkenen geïnformeerd moeten worden. Zie
`datalekprotocol.md`.

## 11. Contact

- School: [[naam school]], [[e-mail privacy]]
- FG: [[naam FG]], [[e-mail FG]]
- Beheerder: [[naam beheerder]], [[e-mail beheerder]]
