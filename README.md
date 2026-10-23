# Pensuma

Een toetsplatform voor Python bij informatica in het voortgezet onderwijs. Docenten maken
toetsen met programmeervragen; leerlingen maken ze in de browser en worden eerlijk en
flexibel nagekeken.

> De app is volledig Nederlandstalig. Code, namen in de code en commentaar zijn Engels.
> Deze README is geschreven voor de ICT-beheerders van de school en voor ontwikkelaars.

## Waarom

Het oude toetsprogramma van de school vergeleek de uitvoer **letterlijk**, dus

```python
naam = input("Wat is je naam? ")
print("Hallo " + naam)
```

werd fout gerekend, omdat de vraagtekst van `input()` in de uitvoer terechtkwam. Pensuma
lost dat op:

- **De tekst van `input()` telt nooit mee.** Alleen wat het programma `print`, wordt nagekeken.
- **Flexibel vergelijken per testgeval:** `flexibel` (hoofdletters en spaties maken niet uit,
  extra labels mogen), `exact`, `bevat`, `alleen getallen` (met marge, ook `108,50`) en
  reguliere expressies.
- **Functietests:** de functie van de leerling wordt aangeroepen (bijvoorbeeld
  `gemiddelde([1, 2, 3])`) en de returnwaarde wordt vergeleken.
- **Codecontroles:** constructies verplichten of verbieden ("gebruik een for-lus",
  "`max()` mag niet").
- **Verborgen tests**, zodat leerlingen geen antwoorden kunnen inbakken.

## Functies

**Docenten (`/docent`, e-mailadres + wachtwoord)**
- Klassen en leerlingen: importeren uit Excel/Magister/SOMtoday (plakken of CSV), automatische
  pincodes van 6 cijfers, printbare inlogkaarten met QR-code, pincode vernieuwen.
- Toetsen bouwen met 10–50 vragen: code (testgevallen, modeloplossing, verwachte uitvoer
  invullen vanuit de modeloplossing, valideren met één klik), meerkeuze en open vragen.
- Afnames voor een klas: toets- of oefenmodus, tijdvak, tijdslimiet, toegangscode op het bord,
  vragen husselen, volledig scherm, plakken blokkeren, wanneer resultaten zichtbaar zijn.
- Live meekijken tijdens een toets, resultaten per vraag, pogingen nakijken, scores aanpassen,
  opnieuw nakijken na een correctie, CSV-export met cijfer.

**Leerlingen (`/leerling`, leerlingnummer + pincode)**
- Een rustig toetsscherm met code-editor, "Uitvoeren" met interactieve `input()`, zelf testen
  met de zichtbare testgevallen, automatisch opslaan en een timer.
- Resultaten met begrijpelijke Nederlandse uitleg bij Python-fouten.
- Een vrije oefenomgeving (`/leerling/oefenen`).

## Techniek

- [Next.js 16](https://nextjs.org) (App Router, Cache Components, React Compiler, Turbopack)
- [tRPC v11](https://trpc.io) + TanStack Query
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL
- [better-auth](https://better-auth.com) (inloggen; alleen sign-in, sign-out en de sessie zijn
  bereikbaar, al het andere loopt via tRPC)
- Tailwind CSS v4 + [uipkge](https://uipkge.dev)-componenten
- [Pyodide](https://pyodide.org) (Python in WebAssembly): in een Web Worker in de browser, en in
  afgeschermde, kortlevende processen op de server voor het officiële nakijken

## Aan de slag (ontwikkeling)

Nodig: [Bun](https://bun.sh) 1.4, Node.js 22+ en PostgreSQL 16 (of Docker).

```bash
bun install                      # kopieert ook de Pyodide-runtime naar public/pyodide
cp .env.example .env             # vul eventueel DATABASE_URL aan
bun run db:migrate               # tabellen aanmaken
bun run db:seed                  # optioneel: demodocent, demoklas, leerlingen en toets
bun run dev                      # http://localhost:3000
```

Een lokale database met Docker: zie de "dev override" onderaan `docker-compose.yml`.

De seed toont de demo-accounts:

- Docent: `docent@pensuma.local` / `welkom-docent` (aan te passen met `SEED_ADMIN_EMAIL`,
  `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`)
- Leerlingen in klas "4H2 (demo)": leerlingnummers `17053`, `17023`, … met hun pincodes

Zonder seed maak je het eerste docentaccount aan op `/setup`.

### Scripts

| Script | Wat het doet |
| --- | --- |
| `bun run dev` | Ontwikkelserver |
| `bun run build` / `bun run start` | Productiebuild / productieserver |
| `bun run lint` / `bun run lint:fix` | Biome: lint en opmaak controleren / herstellen |
| `bun run typecheck` | TypeScript |
| `bun run check` | lint + typecheck + unittests |
| `bun run test` … `bun run test:grader` | Tests, zie [Testen](#testen) |
| `bun run audit` | Bekende kwetsbaarheden in afhankelijkheden (high en hoger) |
| `bun run db:generate` | SQL-migratie maken na een wijziging in `src/server/db/schema` |
| `bun run db:migrate` | Migraties uitvoeren |
| `bun run db:seed` | Demodata |
| `bun run admin:create -- --email … --name "…"` | Docentaccount maken of herstellen (zie hieronder) |
| `bun run privacy:retention` | Bewaartermijnen nu toepassen (`-- --dry-run` voor een proefrun), zie [Privacy](#privacy) |
| `bun run privacy:check-requests` | Controleren dat de browser geen verzoeken naar derden doet |

## Installeren op Dokploy

De repository bevat een productie-`Dockerfile` (Next.js standalone, draait als gebruiker zonder
rechten) en een geharde `docker-compose.yml`. Databasemigraties worden automatisch uitgevoerd als
de container start (`src/instrumentation.ts`; uit te zetten met `RUN_MIGRATIONS=false`).

### Zo draait de productie-installatie

De productie-installatie is een Dokploy-**Application** die uit de `Dockerfile` wordt gebouwd,
met een PostgreSQL-database van Dokploy ernaast. Voorbeeld:
<https://pensuma-school.178.104.17.124.sslip.io>.

1. **Database:** Dokploy → project → **Create Service → Database → PostgreSQL** (versie 16). Zet
   geen externe poort open. Kopieer de **Internal Connection URL**.
2. **App:** **Create Service → Application**, bron: deze GitHub-repository, **Build Type:
   Dockerfile** (pad `Dockerfile`, build-context de root van de repository).
3. **Environment** van de app, minstens:

   ```env
   DATABASE_URL=<Internal Connection URL van de database>
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://pensuma-school.178.104.17.124.sslip.io
   SETUP_TOKEN=<openssl rand -base64 32>
   TRUSTED_PROXIES=<subnet van dokploy-network, zie Beveiliging>
   ```

   Alle variabelen staan met uitleg in `.env.example`.
4. **Domains:** voeg een domein toe met **container-poort 3000** en HTTPS (Let's Encrypt). Zonder
   eigen domein kun je een gratis [sslip.io](https://sslip.io)-naam gebruiken:
   `<naam>.<ip-adres-server>.sslip.io` wijst vanzelf naar dat IP-adres, zoals
   `pensuma-school.178.104.17.124.sslip.io` hierboven. `BETTER_AUTH_URL` moet precies de
   publieke URL zijn: inloggen en tRPC-verzoeken vanaf een andere hostnaam worden geweigerd.
5. **Deploy** (knop in Dokploy, of `scripts/deploy-dokploy.sh`, zie hieronder). Open daarna
   `https://<jouw-domein>/setup`, vul de installatiecode (`SETUP_TOKEN`) in en maak het eerste
   docentaccount aan. Verwijder `SETUP_TOKEN` daarna en deploy opnieuw.

### Eigen domein

1. Maak bij je DNS-provider een **A-record** aan, bijvoorbeeld `toetsen.jouwschool.nl` → het
   IP-adres van de Dokploy-server (in het voorbeeld `178.104.17.124`). Voor IPv6 ook een
   AAAA-record.
2. Dokploy → app → **Domains**: voeg `toetsen.jouwschool.nl` toe, container-poort 3000, HTTPS met
   Let's Encrypt (het certificaat wordt aangevraagd zodra het A-record werkt).
3. Zet `BETTER_AUTH_URL=https://toetsen.jouwschool.nl` en deploy opnieuw. De app vertrouwt alleen
   die ene origin, dus de oude sslip.io-naam werkt daarna niet meer om in te loggen; verwijder
   hem uit Domains.

### Deployen vanaf de opdrachtregel

`scripts/deploy-dokploy.sh` start een deploy via de Dokploy-API, wacht op het resultaat en doet
desgewenst een rooktest op `/api/auth/ok`:

```bash
DOKPLOY_URL=https://dokploy.jouwschool.nl \
DOKPLOY_API_KEY=<API-sleutel uit je Dokploy-profiel> \
DOKPLOY_APP_ID=<applicationId van de app> \
APP_URL=https://pensuma-school.178.104.17.124.sslip.io \
scripts/deploy-dokploy.sh "Titel van de deploy"
```

`APP_URL` is optioneel. Zonder titel heet de deploy `Deploy <korte commit-hash>`.

### Extra afscherming: Docker Compose

Met het Dokploy-servicetype **Compose** (pad `docker-compose.yml`, met een eigen PostgreSQL)
gelden ook de beveiligingsopties uit dat bestand: alleen-lezen bestandssysteem, geen extra
rechten, geheugen- en proceslimieten en een database die alleen op een intern netwerk staat (niet
op `dokploy-network`). Zet dan `POSTGRES_PASSWORD` (`openssl rand -hex 24`) in plaats van
`DATABASE_URL` en koppel het domein aan service `app`, poort 3000. De stappen voor domein, `/setup`
en `BETTER_AUTH_URL` zijn verder gelijk.

### Capaciteit

Elke Python-sandbox op de server gebruikt ongeveer 170–210 MB geheugen zolang hij bestaat. Een
hele poging wordt in één sandbox-job nagekeken (~50 ms als hij warm is), jobs staan in een wachtrij
en sandboxen starten in ~0,5 s vanuit een snapshot. Een klas van 30 die tegelijk inlevert, past op
een machine met 2 vCPU en 2–4 GB met de standaardinstellingen (`mem_limit: 4g`,
`GRADER_POOL_SIZE=2`, `GRADER_MAX_CONCURRENCY=3`). Verhoog die waarden op grotere machines.

## Beveiliging bij installatie

- **HTTPS is verplicht.** In productie start de app niet als `BETTER_AUTH_URL` niet met
  `https://` begint. Alleen voor een proef op een afgesloten schoolnetwerk zonder TLS bestaat
  `ALLOW_INSECURE_HTTP=true`; nooit op internet.
- **Geheimen genereren:**
  - `BETTER_AUTH_SECRET`: `openssl rand -base64 32` (minstens 32 tekens; de ontwikkelwaarde en de
    voorbeeldwaarde uit `.env.example` worden geweigerd).
  - `SETUP_TOKEN`: `openssl rand -base64 32`. Zonder deze code kan in productie niemand `/setup`
    gebruiken, zodat een verse installatie niet door een buitenstaander kan worden "geclaimd".
  - `POSTGRES_PASSWORD`: `openssl rand -hex 24` (hex, dus geen tekens die in `DATABASE_URL`
    escaping nodig hebben).
- **`TRUSTED_PROXIES`:** het subnet van de reverse proxy (Traefik), zodat inlogpogingen en
  het logboek het echte IP-adres van de gebruiker zien. Vind het met

  ```bash
  docker network inspect dokploy-network --format '{{(index .IPAM.Config 0).Subnet}}'
  ```

  Zonder deze instelling gebruikt de app alleen een `X-Forwarded-For` met één adres (zoals
  Traefik dat zet), anders `X-Real-IP`. Dezelfde regel geldt voor de inlogblokkade, de rate
  limits en het ingekorte IP-adres in het logboek, zodat een vervalst `X-Forwarded-For` nergens
  meetelt.
- **Servicetype:** de productie-installatie is een "Application" (zie hierboven). De image draait
  daar ook als gebruiker zonder rechten met alleen-leesbare app-bestanden, maar zonder
  alleen-lezen bestandssysteem en limieten; stel in Dokploy bij **Advanced → Resources** minstens
  een geheugenlimiet in (bijvoorbeeld 4 GB). Het Compose-servicetype zet dit allemaal zelf.
- **PostgreSQL wordt nooit gepubliceerd.** Geef de Dokploy-database geen externe poort en een
  sterk wachtwoord; hij is dan alleen via `dokploy-network` bereikbaar. In `docker-compose.yml`
  zit de database zelfs alleen op het interne netwerk `internal`. Publiceer ook poort 3000 van de
  app niet: Traefik bereikt de app via het netwerk, en een gepubliceerde poort omzeilt TLS en laat
  clients `X-Forwarded-For` vervalsen.
- **Blokkeer de cloud-metadataservice** op de host (de app heeft geen uitgaand verkeer nodig):

  ```bash
  iptables -I DOCKER-USER -d 169.254.169.254/32 -j DROP
  ```

  Maak de regel blijvend (bijvoorbeeld met `iptables-persistent`). Een allowlist voor uitgaand
  verkeer is nog beter.
- **Geen andere diensten zonder inlog op hetzelfde Docker-netwerk** (geen open Redis, admin-
  panelen of databases op `dokploy-network`).
- **Voor elke deploy:** `bun run audit` (bekende kwetsbaarheden in afhankelijkheden, high en
  hoger; hoort zonder meldingen te slagen). De shadcn-CLI is bewust geen afhankelijkheid meer
  (hij trok een kwetsbare `braces` mee, GHSA-vfj7-8cjw-p6xm); `components.json` blijft staan
  voor wie hem eenmalig met `bunx shadcn@<versie>` gebruikt.
- **Restrisico nakijken op de server:** leerlingcode draait in Pyodide in een apart Node-proces
  met het Node-permissiemodel (geen bestanden schrijven, geen child processes, geen
  `eval`-achtige codegeneratie), een geheugen- en tijdslimiet en zonder geheimen in de omgeving.
  Het permissiemodel van Node 22 dekt het **netwerk niet af**: wie uit WebAssembly en de sandbox
  weet te breken, kan verbindingen openen vanuit de container. De afscherming hierboven
  (database zonder externe poort, metadata geblokkeerd, alleen-leesbare app-bestanden en met
  Compose ook een intern databasenetwerk en een alleen-lezen bestandssysteem) beperkt dat. Een volgende stap
  is een aparte grader-container met `network_mode: none`.
- **Toegang kwijt?** `/setup` gaat na de eerste docent nooit meer open. Maak een (nieuw)
  docentaccount of geef een docent een nieuw tijdelijk wachtwoord met

  ```bash
  bun run admin:create -- --email docent@school.nl --name "Marieke de Vries"
  ```

  vanaf een checkout met `DATABASE_URL` en `BETTER_AUTH_SECRET` van de server (bijvoorbeeld via
  een SSH-tunnel naar de database). Het tijdelijke wachtwoord wordt één keer getoond; bij de
  eerste keer inloggen moet de docent een eigen wachtwoord kiezen.
- **Wat de app zelf doet:** een Content-Security-Policy die alleen bronnen van de eigen server
  toestaat, HSTS, cross-origin-isolatie, `no-store` op alle API-antwoorden, alleen de nodige
  better-auth-endpoints,
  sessietokens nooit in JSON, inlogblokkade per account (8 verkeerde pogingen), rate limits per
  gebruiker, een wachtwoordbeleid voor docenten (minstens 12 tekens, geen veelgebruikte
  wachtwoorden) en een logboek van beheeracties.
- **Veel mislukte inlogpogingen vanaf één netwerk:** komen er binnen 10 minuten
  `LOGIN_IP_MAX_FAILURES` (standaard 100) mislukte pogingen van één IP-adres, dan worden
  leerlingaccounts die vanaf dat adres inloggen al na 5 verkeerde pincodes geblokkeerd in plaats
  van na 8 (tot 10 minuten na de laatste mislukte poging boven de grens). Het adres zelf wordt
  nooit geblokkeerd, want een hele school logt vaak in vanaf één IP-adres, en docenten worden
  nooit beperkt door het netwerk.
- **Beveiligingscontact:** `public/.well-known/security.txt` bevat een voorbeeldadres
  (`ict@school.example`). Vervang het door het adres van de ICT-afdeling en vernieuw `Expires`
  elk jaar.

## Privacy

### Documenten voor de school

In `docs/privacy/` staan sjablonen die de school (verwerkingsverantwoordelijke) en de beheerder
(verwerker) invullen; de plekken met `[[…]]` zijn de invulvelden:

- [Privacybijsluiter](docs/privacy/privacybijsluiter.md): wat Pensuma verwerkt, waarom en hoe lang
  (voor de verwerkersovereenkomst volgens het Privacyconvenant Onderwijs)
- [Verwerkingsregister](docs/privacy/verwerkingsregister.md) (AVG art. 30); een actuele versie
  met de ingestelde bewaartermijnen staat in de app bij **Privacy & gegevens → Register &
  schoolgegevens**
- [DPIA-bouwstenen](docs/privacy/dpia-bouwstenen.md) (AVG art. 35)
- [Datalekprotocol](docs/privacy/datalekprotocol.md)

In de app zelf: de privacyverklaring op `/privacy`, voor leerlingen **Mijn gegevens**
(`/leerling/mijn-gegevens`, inzage en download) en voor docenten **Privacy & gegevens**
(`/docent/privacy`: bewaartermijnen, inzage en export per leerling, verwijderen, beperken
(AVG art. 18), bewaarblokkades, schooljaar afsluiten en het logboek).

### Bewaartermijnen toepassen

- **Automatisch:** de productieserver past de bewaartermijnen voor het eerst ongeveer vijf
  minuten na het starten toe en daarna elke `RETENTION_INTERVAL_HOURS` uur (standaard `6`). Met
  meerdere replica's draait er steeds maar één tegelijk (advisory lock). Zet
  `RETENTION_SCHEDULER=false` om dat uit te zetten (bijvoorbeeld als een cronjob
  `privacy:retention` draait). Wat onder een actieve bewaarblokkade valt (ook een beperking
  volgens AVG art. 18), wordt overgeslagen.
- **Handmatig**, vanaf een checkout met de `DATABASE_URL` van de server in `.env`:

  ```bash
  bun run privacy:retention -- --dry-run   # alleen tonen wat er weg zou gaan
  bun run privacy:retention                # nu verwijderen
  ```

  Of in de app: **Privacy & gegevens → Bewaartermijnen → Nu opschonen**.

### Geen verzoeken naar derden

`bun run privacy:check-requests` opent Pensuma in Chromium als bezoeker, leerling (inclusief
Python uitvoeren) en docent, en faalt zodra de browser iets ophaalt bij een andere partij dan
Pensuma zelf. Standaard tegen `http://localhost:3100` met de demo-accounts; instelbaar met
`BASE_URL`, `CHECK_STUDENT`, `CHECK_PIN`, `CHECK_TEACHER_EMAIL`, `CHECK_TEACHER_PASSWORD` en
`PLAYWRIGHT_CHROMIUM_PATH`. Er wordt niets in de database veranderd.

### Beheer

- **Rollen:** de school is **verwerkingsverantwoordelijke**; wie Pensuma host en beheert, is
  **verwerker**. Leg dat vast in een verwerkersovereenkomst volgens het model van het
  Privacyconvenant Onderwijs.
- **Hosting in de EU:** server, database en back-ups staan in de EU. De app gebruikt geen
  diensten van derden (geen analytics, fonts of CDN's van buiten).
- **Back-ups:** maak versleutelde back-ups van PostgreSQL in een EU-regio en bewaar ze **30 dagen**.
  Die termijn moet overeenkomen met "Back-ups worden bewaard (dagen)" bij **Privacy & gegevens →
  Register & schoolgegevens** (`processor.backupDays`): dat getal staat in de privacyverklaring.
- **Logrotatie:** `docker-compose.yml` beperkt containerlogs tot 5 × 10 MB per service (stel bij
  een Application hetzelfde in via de Docker-daemon). Logs bevatten geen invoer van gebruikers;
  tRPC-fouten staan er als één JSON-regel met foutcode.
- **Incident:** het roteren van `BETTER_AUTH_SECRET` logt iedereen uit **en maakt de opgeslagen
  pincodes onleesbaar** (ze zijn met een sleutel uit dit geheim versleuteld). Vernieuw daarna per
  klas de pincodes en druk de inlogkaarten opnieuw af. Volg verder het
  [datalekprotocol](docs/privacy/datalekprotocol.md).
- **Productie-instellingen:** zet `NEXT_TELEMETRY_DISABLED=1` (staat al in de image) en draai in
  productie nooit de demodata (`SEED_DEMO=false` als je `db:seed` gebruikt).

## Toegankelijkheid

- De toegankelijkheidsverklaring staat op `/toegankelijkheid`.
- Het contactadres in de verklaring stel je in bij **Privacy & gegevens → Register &
  schoolgegevens**.
- Controleer pagina's automatisch met `bun run test:a11y` (Playwright + axe, WCAG 2.2 AA; zie
  [Testen](#testen)).

## Testen

| Commando | Wat |
| --- | --- |
| `bun run test` | Unittests in `src/` (pure logica, componenten; geen database) |
| `bun run test:integration` | tRPC-procedures en services tegen PostgreSQL (`tests/integration` en `tests/security`) |
| `bun run test:security` | Alleen `tests/security`: autorisatiematrix, IDOR, datalekken, build-context, HTTP |
| `bun test --todo tests` | Draait ook de tests die als "wacht op …" (`test.todo`) gemarkeerd staan |
| `bun run test:e2e` | Playwright-scenario's (docent, leerling, toets maken, headers) |
| `bun run test:a11y` | Alleen `e2e/a11y`: axe (WCAG 2.2 AA), toetsenbord, reflow, beweging |
| `bun run test:grader` | De echte Python-sandbox: voorbeeldvragen, aanvallen en prestaties |
| `bun run audit` | Kwetsbaarheden in afhankelijkheden |

**Database voor integratie- en securitytests.** De tests gebruiken nooit de database uit `.env`,
maar `TEST_DATABASE_URL` (standaard
`postgresql://pensuma:pensuma@localhost:5432/pensuma_test`). De naam moet op `_test` eindigen,
anders weigeren de tests te starten, want ze legen alle tabellen. De database wordt aangemaakt
als hij nog niet bestaat en krijgt de migraties uit `drizzle/` via dezelfde code als in productie,
dus een vergeten migratie laat de tests falen. De Python-grader is in deze tests vervangen door
een voorspelbare nep-grader; de echte sandbox test je met `bun run test:grader`.

```bash
bun run test:integration
TEST_DATABASE_URL=postgresql://user:pw@db:5432/mijn_test bun run test:security
```

`tests/security/http-surface.test.ts` test bovendien een draaiende server
(`SECURITY_BASE_URL`, standaard `http://localhost:3100`) en wordt overgeslagen als die niet
bereikbaar is.

**Nog niet gebouwd gedrag** staat als `test.todo` met "[wacht op …]" in de naam
(`tests/support/pending.ts`). Een gewone run slaat ze over; `bun test --todo tests` draait ze en
meldt elke todo-test die nu slaagt als fout: maak daar dan een gewone `test(...)` van.

**End-to-end (Playwright).** Twee manieren (zie `e2e/support/env.ts`):

- **Zelfstandig (standaard, ook in CI):** `bun run test:e2e` bouwt de app, start hem op
  `http://localhost:3210` met een eigen database `pensuma_e2e_test` (aangemaakt, gemigreerd en
  gevuld met vaste pincodes; andere database met `E2E_DATABASE_URL`).
  - `E2E_SKIP_BUILD=1`: geen `next build`, gebruik de bestaande build (CI bouwt in een eerdere
    stap).
  - `E2E_DEV=1`: `next dev` in plaats van een productiebuild, voor snelle lokale runs;
    `E2E_PORT=3150` zet hem op een andere poort dan 3210.
- **Tegen een draaiende server:** `E2E_BASE_URL=http://localhost:3100 bunx playwright test
  --project=desktop`. Er wordt geen server gestart en niets geseed: de tests gebruiken de
  demo-seed en maken (en verwijderen) zelf tijdelijke leerlingen.

Projecten: `desktop` draait alles; `dark` herhaalt de axe-controles per pagina en `mobile`
herhaalt die, de controle op bedekte focus en de oefenflow van de leerling. `bun run test:a11y`
draait alleen `e2e/a11y`. Rapporten komen in `playwright-report/` en `test-results/`.

De CI (GitHub Actions) draait lint, typecheck, een controle op ontbrekende migraties, unit-,
integratie- en securitytests, de grader-tests, de end-to-endtests en een Docker-build.

## Projectstructuur

```
src/
  app/                    routes (Nederlandse URL's)
    (docent)/docent/…     docentomgeving
    (leerling)/leerling/… leerlingomgeving
    inloggen, setup       inloggen en eerste installatie
    api/auth, api/trpc    better-auth (allowlist) + tRPC
  components/
    ui/                   uipkge-componenten
    app/                  gedeelde app-componenten (PageHeader, CodeEditor, Markdown, …)
    python/               Python-runtime-UI (console, testresultaten, foutkaarten)
    docent/, leerling/    featurecomponenten
  lib/
    questions/schema.ts   contracten voor vragen, antwoorden en nakijken (zod)
    security/             CSP en headers, wachtwoordbeleid
    grading/              uitvoer vergelijken en scoren
    python/               Python in de browser (Pyodide-worker) + harness
  server/
    api/                  tRPC-routers
    db/                   Drizzle-schema, client, migraties
    grader/               afgeschermd nakijken op de server
    security/             rate limits, inlogblokkade, foutafhandeling, client-IP
    services/             accounts, nakijken, afnames, logboek
    privacy/              bewaartermijnen, verwijderen, logboekschrijver
    auth.ts, session.ts   better-auth-configuratie en servercontroles
  instrumentation.ts      bij het starten: migraties, grader opwarmen, opschonen
  instrumentation-client.ts  in de browser vóór hydration (zod zonder eval, voor de CSP)
drizzle/                  SQL-migraties
grader/                   sandbox-script van de servergrader
scripts/                  seed, beheer (admin:create), privacy, deploy-dokploy.sh
tests/                    integratie- en securitytests (bun test)
e2e/                      Playwright end-to-end- en toegankelijkheidstests
docs/privacy/             privacydocumenten voor de school
```

## Woordenlijst (UI ↔ code)

| Nederlands (UI) | Code |
| --- | --- |
| docent | admin |
| leerling | student |
| klas | class |
| toets | test |
| vraag | question |
| afname | assignment |
| poging | attempt |
| antwoord | answer |
