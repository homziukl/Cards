# Card Sandbox 0.3.8 — Siódemki Mobile

Lokalny proof-of-concept karcianego sandboxa z presetem **Siódemki**, botem korzystającym ze stołu i solverem podpowiadającym, ilu kart można się jeszcze pozbyć. Nie wymaga instalacji ani serwera — otwórz `index.html` w nowoczesnej przeglądarce albo opublikuj katalog przez GitHub Pages.

## Zasady presetu

- domyślnie 2 talie i **2 jokery łącznie** (1 joker na talię),
- 7 kart na rękę,
- na początku tury dobierana jest 1 karta,
- sekwens: minimum 3 kolejne karty jednego koloru,
- grupa: 3 lub 4 takie same rangi, wszystkie w różnych kolorach,
- może istnieć kilka osobnych grup tej samej rangi,
- joker jest dziki,
- wejście wymaga minimum 30 punktów z własnych kart,
- 2–10 liczą się według numeru, J/Q/K = 10, A = 11,
- A-2-3 jest legalne i As liczy się wtedy jako 1,
- Q-K-A jest legalne i As liczy się wtedy jako 11,
- K-A-2 jest nielegalne,
- po wejściu można przebudowywać cały stół,
- karta, która była na stole przed turą, musi na nim pozostać,
- joker ze stołu może zostać uwolniony i użyty gdzie indziej, jeśli końcowy stół pozostaje legalny,
- `PROSZĘ →` zatwierdza całą turę transakcyjnie,
- `Cofnij turę` wraca do stanu sprzed dobrania.

## 0.3.7 — telefon, dotyk i orientacja

- edytor konfiguracji jest **domyślnie zamknięty**,
- na telefonie edytor otwiera się jako pełnoekranowy panel i ma własny przycisk `Zamknij`,
- zaawansowany edytor wartości oraz reguły rund są domyślnie zwinięte,
- karty można przeciągać **palcem** z ręki na stół, między układami oraz z powrotem do ręki, jeśli pozwalają na to zasady,
- przeciąganie palcem działa również do ręcznego układania kolejności kart w ręce,
- przy przeciąganiu pojawia się karta-duch i podświetlenie celu,
- ręka i stół automatycznie przewijają się przy przeciąganiu przy krawędzi,
- osobny layout dla telefonu **pionowo**,
- osobny, bardziej płaski layout dla telefonu **poziomo**,
- w pionie ręka jest przyklejona przy dolnej części stołu i karty są kompaktowe,
- w poziomie ograniczono wysokość przeciwników, talii i ręki, aby zostawić więcej miejsca na układy,
- kapsułkę `↘ X` można stuknąć na telefonie — opis podpowiedzi pokaże się jako komunikat.

## Przykład przebudowy stołu

Jeżeli na stole leży `3♦ 4♦ 5♦`, a gracz ma `3♠ 3♣ 6♦`, po wejściu może przebudować stół na:

- `4♦ 5♦ 6♦`
- `3♦ 3♠ 3♣`

Bot potrafi szukać takich przebudów i może korzystać z kart, które już leżą na stole.

## Publikacja

Do repozytorium GitHub wrzuć zawartość tego katalogu tak, aby `index.html`, `app.js`, `engine-core.js` i `style.css` leżały obok siebie w katalogu publikowanym przez GitHub Pages.


## 0.3.7
- Usunięto osobny przycisk/pole „Nowy układ”. Upuszczenie karty w wolnym miejscu stołu tworzy nowy układ automatycznie.
- Poprawiono poziomy overflow na telefonach.
- Ręka automatycznie zmniejsza i zagęszcza karty przy większej liczbie kart.

## 0.3.7 — mobilny stół w rzędach

- Na telefonie układy są ustawiane pionowo, po jednym na rząd — bez poziomego przewijania stołu.
- Pomiędzy układami są subtelne strefy upuszczania; przeciągnięcie tam karty tworzy nowy rząd.
- Działa w pionie i poziomie; w landscape przewijanie stołu jest pionowe.
- Naprawiono CSS z 0.3.6 tak, aby reguły dopasowania szerokości i skalowania ręki były rzeczywiście stosowane.


## 0.3.8 — wejście natychmiastowe
- Nowy meld może być chwilowo niepełny podczas układania; pełna walidacja następuje przy PROSZĘ.
- Osiągnięcie minimum wejścia (domyślnie 30 pkt) odblokowuje stół od razu w tej samej turze.
- Karty użyte do potwierdzenia wejścia muszą pozostać na stole do końca tej tury, ale można je przestawiać pomiędzy układami.
- Kliknięcie karty przed wejściem nie próbuje już wrzucać jej do starego układu stołu; tworzy nowy układ roboczy.
