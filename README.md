[README.md](https://github.com/user-attachments/files/32698153/README.md)
# Family Friends

Eine kleine Web-App zum Verwalten privater Darlehen im Familien- und Freundeskreis: wer hat wem wie viel geliehen, wie viele Raten sind schon bezahlt, wie hoch ist der Zins.

## Funktionen

- **Übersicht**: im Umlauf befindliches Geld, Anzahl Mitglieder und laufender Darlehen auf einen Blick
- **Geldfluss**: wie viel Geld jeden Monat reinkommt und rausgeht, was übrig bleibt, wie viel du durch Zinsen beim Verleihen schon verdient hast und noch verdienst (gesamt und pro Darlehen), Diagramm + Tabelle für die nächsten 6 Monate
- **Verleih-Topf** (Seite Geldfluss): einen Betrag zum Verleihen bereitstellen; zurückgezahlte Raten fließen zurück in den Topf, mit „Zinsen wieder verleihen“ auch die Zinsen (Zinseszins). Zeigt freies und verliehenes Geld, verdiente Zinsen und eine Schätzung, wie der Topf in 1–10 Jahren wachsen kann (mit/ohne Wiederverleihen). Beim Verleihen kann man „Aus deinem Verleih-Topf nehmen“ einschalten; mehr als frei ist, geht nicht.
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
- **Minimalistisches Design** (angelehnt an Trade Republic): viel Weißraum, große Zahlen, schwarze Pill-Buttons, Grün = Geld kommt zu dir, Rot = Geld geht weg oder etwas ist zu spät, keine Animationen
- **Einstellungen** (Zahnrad oben rechts): helle oder dunkle Darstellung oder automatisch wie das Gerät; die Wahl wird auf dem Gerät gespeichert

## Handy & Computer

- **Handy**: volle Bildschirmbreite, Navigation unten, große Tipp-Flächen. Über „Zum Home-Bildschirm hinzufügen“ lässt sich die App wie eine normale App mit eigenem Symbol starten.
- **Computer (z. B. MacBook)**: Navigation links als Seitenleiste, breiterer Inhalt mit Karten in zwei Spalten, Fenster mittig. Mit den Tasten 1–6 wechselst du die Seite, mit Esc schließt du ein Fenster.

Hinweis: Raten enthalten jetzt auch den Zinsanteil (Gesamtbetrag inkl. Zinsen ÷ Anzahl Raten).

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
