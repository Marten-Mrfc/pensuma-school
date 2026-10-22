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
| `bun run test` | Unittests (geen database nodig) |
| `bun run test:integration` | Integratietests tegen een aparte `*_test`-database |
| `bun run test:e2e` / `bun run test:a11y` | Playwright end-to-end / toegankelijkheid (axe) |
| `bun run audit` | Bekende kwetsbaarheden in afhankelijkheden (high en hoger) |
| `bun run check` | lint + typecheck + unittests |
| `bun run db:generate` | SQL-migratie maken na een wijziging in `src/server/db/schema` |
| `bun run db:migrate` | Migraties uitvoeren |
| `bun run db:seed` | Demodata |
| `bun run admin:create -- --email … --name "…"` | Docentaccount maken of herstellen (zie hieronder) |
| `bun run privacy:retention` | Bewaartermijnen nu toepassen (`-- --dry-run` voor een proefrun) |

## Installeren op Dokploy

De repository bevat een productie-`Dockerfile` (Next.js standalone) en een geharde
`docker-compose.yml` met een eigen PostgreSQL. Databasemigraties worden automatisch uitgevoerd
als de container start.

**Aanbevolen: servicetype Docker Compose.** Alleen dan gelden de beveiligingsopties uit
`docker-compose.yml` (alleen-lezen bestandssysteem, geen extra rechten, geheugen- en
proceslimieten, een database die niet op het Dokploy-netwerk staat).

1. Dokploy → **Create Service → Compose**, bron: deze Git-repository, pad `docker-compose.yml`.
2. **Environment:** zet minstens

   ```env
   POSTGRES_PASSWORD=<openssl rand -hex 24>
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://toetsen.jouwschool.nl
   SETUP_TOKEN=<openssl rand -base64 32>
   TRUSTED_PROXIES=<subnet van dokploy-network, zie hieronder>
   ```

3. **Domains:** koppel het domein aan service `app`, poort **3000**, met HTTPS (Let's Encrypt).
4. Deploy, open `https://<jouw-domein>/setup`, vul de installatiecode (`SETUP_TOKEN`) in en maak
   het eerste docentaccount aan. Verwijder `SETUP_TOKEN` daarna en deploy opnieuw.

Alle variabelen staan met uitleg in `.env.example`.

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
  Traefik dat zet), anders `X-Real-IP`.
- **Gebruik het Compose-servicetype** van Dokploy voor de beveiligingsopties (zie hierboven). Met
  het servicetype "Application" werkt de app ook, maar zonder alleen-lezen bestandssysteem en
  limieten.
- **PostgreSQL staat nooit op `dokploy-network` en wordt nooit gepubliceerd.** In
  `docker-compose.yml` zit de database alleen op het interne netwerk `internal`. Publiceer ook
  poort 3000 van de app niet: Traefik bereikt de app via het netwerk, en een gepubliceerde poort
  omzeilt TLS en laat clients `X-Forwarded-For` vervalsen.
- **Blokkeer de cloud-metadataservice** op de host (de app heeft geen uitgaand verkeer nodig):

  ```bash
  iptables -I DOCKER-USER -d 169.254.169.254/32 -j DROP
  ```

  Maak de regel blijvend (bijvoorbeeld met `iptables-persistent`). Een allowlist voor uitgaand
  verkeer is nog beter.
- **Geen andere diensten zonder inlog op hetzelfde Docker-netwerk** (geen open Redis, admin-
  panelen of databases op `dokploy-network`).
- **Voor elke deploy:** `bun run audit` (bekende kwetsbaarheden in afhankelijkheden).
- **Restrisico nakijken op de server:** leerlingcode draait in Pyodide in een apart Node-proces
  met het Node-permissiemodel (geen bestanden schrijven, geen child processes, geen
  `eval`-achtige codegeneratie), een geheugen- en tijdslimiet en zonder geheimen in de omgeving.
  Het permissiemodel van Node 22 dekt het **netwerk niet af**: wie uit WebAssembly en de sandbox
  weet te breken, kan verbindingen openen vanuit de container. De afscherming hierboven
  (interne database, metadata geblokkeerd, alleen-lezen bestanden) beperkt dat. Een volgende stap
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
  sessietokens nooit in JSON, inlogblokkade per account (8 pogingen) en per netwerk
  (`LOGIN_IP_MAX_FAILURES`), rate limits per gebruiker, een wachtwoordbeleid voor docenten
  (minstens 12 tekens, geen veelgebruikte wachtwoorden) en een logboek van beheeracties.
- **Beveiligingscontact:** `public/.well-known/security.txt` bevat een voorbeeldadres
  (`ict@school.example`). Vervang het door het adres van de ICT-afdeling en vernieuw `Expires`
  elk jaar.

## Privacy & AVG (beheer)

- **Rollen:** de school is **verwerkingsverantwoordelijke**; wie Pensuma host en beheert, is
  **verwerker**. Leg dat vast in een verwerkersovereenkomst volgens het model van het
  Privacyconvenant Onderwijs.
- **Hosting in de EU:** server, database en back-ups staan in de EU. De app gebruikt geen
  diensten van derden (geen analytics, fonts of CDN's van buiten).
- **Back-ups:** maak versleutelde back-ups van PostgreSQL in een EU-regio en bewaar ze **30 dagen**.
  Die termijn moet overeenkomen met "Back-ups worden bewaard (dagen)" bij **Privacy & gegevens →
  Register & schoolgegevens** (`processor.backupDays`): dat getal staat in de privacyverklaring.
- **Logrotatie:** `docker-compose.yml` beperkt containerlogs tot 5 × 10 MB per service. Logs
  bevatten geen invoer van gebruikers; tRPC-fouten staan er als één JSON-regel met foutcode.
- **Automatisch opschonen:** de server past de bewaartermijnen elke `RETENTION_INTERVAL_HOURS`
  uur toe (standaard 6) zolang `RETENTION_SCHEDULER` niet `false` is. Handmatig:
  `bun run privacy:retention` (met `-- --dry-run` voor een proefrun).
- **Incident:** het roteren van `BETTER_AUTH_SECRET` logt iedereen uit **en maakt de opgeslagen
  pincodes onleesbaar** (ze zijn met een sleutel uit dit geheim versleuteld). Vernieuw daarna per
  klas de pincodes en druk de inlogkaarten opnieuw af.
- **Documenten voor de school:** in `docs/privacy/` staan de privacybijsluiter
  (`privacybijsluiter.md`), het verwerkingsregister (`verwerkingsregister.md`), bouwstenen voor een
  DPIA (`dpia-bouwstenen.md`) en het datalekprotocol (`datalekprotocol.md`).
- **Productie-instellingen:** zet `NEXT_TELEMETRY_DISABLED=1` (staat al in de image) en draai in
  productie nooit de demodata (`SEED_DEMO=false` als je `db:seed` gebruikt).

## Toegankelijkheid

- De toegankelijkheidsverklaring staat op `/toegankelijkheid`.
- Het contactadres in de verklaring stel je in bij **Privacy & gegevens → Register &
  schoolgegevens**.
- Controleer pagina's automatisch met `bun run test:a11y` (Playwright + axe, WCAG 2.2 AA).

## Tests en kwaliteit

| Commando | Wat |
| --- | --- |
| `bun run lint` | Biome (lint + opmaak) |
| `bun run typecheck` | TypeScript |
| `bun run test` | Unittests (pure logica; geen database) |
| `bun run test:integration` | tRPC-procedures tegen een aparte `*_test`-database |
| `bun run test:e2e` | Playwright-scenario's (docent, leerling, toets maken) |
| `bun run test:a11y` | Toegankelijkheidscontroles met axe |
| `bun run audit` | Kwetsbaarheden in afhankelijkheden |

De CI (GitHub Actions) draait lint, typecheck, unit-, integratie-, grader- en end-to-endtests, een
controle op ontbrekende migraties en een Docker-build.

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
    auth.ts, session.ts   better-auth-configuratie en servercontroles
drizzle/                  SQL-migraties
scripts/                  seed, beheer (admin:create), privacy
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
