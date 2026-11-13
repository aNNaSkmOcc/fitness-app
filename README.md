# Training

Kleine Trainings-App (PWA) fürs Handy. Plan, Coach-Vorgaben und Einheiten liegen nicht hier, sondern in einem privaten Repo und werden über die GitHub-API mit einem Token gelesen und geschrieben, den man auf dem Gerät einträgt. Dieses Repo enthält nur den App-Code.

- Offline nutzbar: laufende Einheit, Plan und Verlauf liegen im `localStorage`, fertige Einheiten warten in einer Warteschlange, bis wieder Netz da ist.
- Zielgewichte: Coach-Vorgabe (wenn neuer als die letzte Einheit), sonst Double Progression, sonst Startgewicht aus dem Plan.
