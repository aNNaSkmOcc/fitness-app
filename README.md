# Training

Kleine Trainings-App (PWA) fürs Handy. Plan, Coach-Vorgaben und Einheiten liegen nicht hier, sondern in einem privaten Repo und werden über die GitHub-API mit einem Token gelesen und geschrieben, den man auf dem Gerät einträgt. Dieses Repo enthält nur den App-Code.

- Offline nutzbar: laufende Einheit, Plan und Verlauf liegen im `localStorage`, fertige Einheiten warten in einer Warteschlange, bis wieder Netz da ist.
- Zielgewichte pro Satz (Gewicht + Wdh. je Satz): Coach-Vorgabe (wenn neuer als die letzte Einheit), sonst Double Progression pro Satz (obere Wdh.-Grenze geschafft → mehr Gewicht, deutlich verfehlt → leichter), sonst Startgewicht aus dem Plan.
- Tagesform vor dem Start: bei „Müde / Muskelkater“ eine Gewichtsstufe leichter.
- Echtzeit-Anpassung: Nach jedem abgehakten Satz werden die restlichen Sätze der Übung neu gesetzt (≥ 2 Wdh. über Ziel → eine Stufe schwerer, ≥ 2 Wdh. unter Ziel oder unter der Mindest-Wdh. → eine Stufe leichter, selbst geändertes Gewicht → Folgesätze ziehen mit). Selbst angepasste Sätze bleiben unangetastet.
