# Online-Konto mit Bestätigungs-E-Mail einrichten (Supabase)

Damit Family Friends **Bestätigungs-E-Mails** verschicken kann und deine Daten auf **Handy und MacBook gleich** sind, braucht die App ein kostenloses Supabase-Projekt. Das dauert ca. 5–10 Minuten. Solange das nicht eingerichtet ist, funktioniert die App mit der Anmeldung nur auf dem Gerät.

## Schritt 1: Konto und Projekt anlegen
1. Gehe auf **https://supabase.com** und tippe auf **„Start your project“**.
2. Melde dich an (z. B. mit deinem GitHub-Konto).
3. Tippe auf **„New project“**.
   - **Name:** `family-friends`
   - **Database Password:** ein sicheres Passwort (gut aufheben, wird für die App nicht gebraucht)
   - **Region:** `Central EU (Frankfurt)` – dann liegen die Daten in Deutschland
4. Tippe auf **„Create new project“** und warte ca. 1–2 Minuten.

## Schritt 2: Datenbank-Tabelle anlegen
1. Links im Menü: **„SQL Editor“** → **„New query“**.
2. Den kompletten Inhalt der Datei [`supabase-setup.sql`](supabase-setup.sql) hineinkopieren.
3. Auf **„Run“** tippen. Es sollte „Success“ erscheinen.

Damit gibt es eine Tabelle, in der **jede Person nur ihre eigenen Daten** sehen und ändern kann.

## Schritt 3: Adresse der App eintragen
Damit der Link in der E-Mail zurück zu deiner App führt:
1. Links: **„Authentication“** → **„URL Configuration“**.
2. **Site URL:** die Adresse deiner Web-App, z. B. `https://filodeno555.github.io/Family-Friends-/`
3. Unter **„Redirect URLs“** dieselbe Adresse noch einmal hinzufügen.
4. Speichern.

## Schritt 4: E-Mail-Bestätigung prüfen
1. **„Authentication“** → **„Sign In / Providers“** → **„Email“**.
2. **„Confirm email“** muss **eingeschaltet** sein (ist normalerweise schon so).

## Schritt 5: Die 2 Werte für die App
1. Links unten: **„Project Settings“** → **„API“** (bzw. „Data API“ / „API Keys“).
2. Kopiere:
   - **Project URL** (z. B. `https://abcdefgh.supabase.co`)
   - **anon public** Key (ein langer Text, beginnt meist mit `eyJ…`)
3. Trage beide in [`config.js`](config.js) ein – oder schick sie mir, dann mache ich das.

Der **anon**-Key darf öffentlich sein: Die Daten werden von der Datenbank selbst geschützt (Row Level Security aus Schritt 2). Den **service_role**-Key bitte **niemals** weitergeben oder eintragen.

## Optional: E-Mails auf Deutsch
Unter **„Authentication“** → **„Emails“** (bzw. „Email Templates“) kannst du die Texte ändern:

**Confirm signup** – Betreff: `Bitte bestätige deine E-Mail für Family Friends`
```html
<h2>Willkommen bei Family Friends!</h2>
<p>Bitte bestätige deine E-Mail-Adresse. Tippe dazu auf diesen Link:</p>
<p><a href="{{ .ConfirmationURL }}">E-Mail bestätigen</a></p>
<p>Wenn du dich nicht bei Family Friends angemeldet hast, kannst du diese E-Mail ignorieren.</p>
```

**Reset password** – Betreff: `Neues Passwort für Family Friends`
```html
<h2>Passwort zurücksetzen</h2>
<p>Tippe auf diesen Link, um ein neues Passwort festzulegen:</p>
<p><a href="{{ .ConfirmationURL }}">Neues Passwort festlegen</a></p>
<p>Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
```

## Gut zu wissen
- Supabase verschickt mit dem eingebauten E-Mail-Dienst nur **wenige E-Mails pro Stunde** (zum Testen und für die Familie reicht das meist). Für mehr kann man unter „Authentication“ → „SMTP Settings“ einen eigenen E-Mail-Anbieter eintragen.
- Kostenlose Projekte werden nach ca. einer Woche ohne Nutzung pausiert und lassen sich im Dashboard mit einem Klick wieder starten.
- Beim **ersten Anmelden** werden Daten, die schon auf dem Gerät liegen, automatisch in das Online-Konto übernommen (lokales Konto mit derselben E-Mail und demselben Passwort).
