[README.md](https://github.com/user-attachments/files/32698153/README.md)
# Family Friends

Eine kleine Web-App zum Verwalten privater Darlehen im Familien- und Freundeskreis: wer hat wem wie viel geliehen, wie viele Raten sind schon bezahlt, wie hoch ist der Zins.

## Funktionen

- **Übersicht**: im Umlauf befindliches Geld, Anzahl Mitglieder und laufender Darlehen auf einen Blick
- **Darlehen**: neue Darlehen anlegen (verliehen oder geliehen) inklusive Verwendungszweck, Gesamtsumme nach Richtung (verliehen/geliehen/netto), Raten mit einem Klick verbuchen, Fortschritt als Balken, nach Richtung filterbar
- **Genaue Rateninfos**: pro Darlehen aufklappbar — Gesamtbetrag, bereits gezahlt, offener Betrag, monatliche Rate, Startdatum, Gesamtbetrag inkl. Zins; zusätzlich "Rate X von Y abbezahlt" und Fälligkeits-/Überfälligkeitsdatum direkt auf der Karte
- **Gruppen**: Personen im Kreis lassen sich Gruppen zuordnen (z. B. Familie, Freunde, Uni, Schule oder frei benannte eigene Gruppen)
- **Anfragen in Gruppen**: eine Person aus einer Gruppe stellt eine Anfrage mit gewünschtem Betrag, Zweck, Raten und Zins — sichtbar für alle in der Gruppe; andere Mitglieder können mit einem Angebot antworten (wie viel sie geben wollen und zu welchen eigenen Bedingungen); angenommene Angebote werden automatisch zu Darlehen zwischen genau diesen beiden Personen, ein Fortschrittsbalken zeigt den finanzierten Anteil
- **Kreis**: Mitglieder und Gruppen verwalten, jede Person zeigt einen berechneten Kreditscore (300–850) mit Einstufung (niedrig/mittel/gut/sehr gut) basierend auf ihrem Rückzahlungsverhalten als Kreditnehmerin
- **Aktivität**: chronologischer Verlauf aller Buchungen, Anfragen und Entscheidungen

Alle Daten werden lokal im Browser gespeichert (`localStorage`) — es gibt kein Backend und keinen Server.

## Bedienung & Design

Die App ist bewusst einfach und vorhersehbar aufgebaut, damit sie auch für Menschen gut verständlich ist, die klare Strukturen brauchen (z. B. Autist:innen):

- **Klare, wörtliche Sprache**: „Andere schulden dir“ / „Du schuldest anderen“ statt Fachbegriffen
- **Gleicher Aufbau auf jeder Seite**: Titel, ein Satz „was du hier siehst“, dann die Inhalte
- **Navigation mit Text unter jedem Symbol**, große Tipp-Flächen, Hilfe-Seite oben rechts
- **Nummerierte Schritte in Formularen** mit kurzen Erklärungen und einer Zusammenfassung vor dem Speichern
- **Sicherheitsfrage vor wichtigen Aktionen** (Rate eintragen, Angebot annehmen/ablehnen)
- **Ruhiges, helles Banking-Design** (angelehnt an N26, ING, Revolut): dunkles Blau als Hauptfarbe, Grün = Geld kommt zu dir, Rot = Geld geht weg oder etwas ist zu spät, keine Animationen

## Nutzung

Einfach `index.html` im Browser öffnen, es sind keine Build-Schritte oder Abhängigkeiten nötig.

Für GitHub Pages: Repo-Einstellungen → Pages → Branch `main`, Ordner `/ (root)` — danach ist die App unter `https://<username>.github.io/<repo>/` erreichbar.

## Struktur

```
index.html   Struktur & Screens
styles.css   Design (Farben, Typografie, Layout)
app.js       Logik & State-Management
```

## Technisch

Reines HTML/CSS/JavaScript ohne Frameworks oder Build-Tools. Schriften werden von Google Fonts geladen (Fraunces, Inter), alles andere ist selbstenthalten.
