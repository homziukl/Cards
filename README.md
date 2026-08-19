# Card Sandbox 0.3.1 — preset „Układanka”

Lokalny proof-of-concept karcianego sandboxa z silnikiem reguł i botem. Nie wymaga instalacji ani serwera — otwórz `index.html` w nowoczesnej przeglądarce.

## Zasady zaimplementowanego presetu

- domyślnie 2 talie + 2 jokery na talię,
- 7 kart na rękę,
- na początku każdej tury dobierana jest 1 karta,
- legalny **sekwens**: minimum 3 kolejne karty w jednym kolorze,
- legalna **grupa**: 3 lub 4 takie same rangi, wszystkie w różnych kolorach,
- może istnieć kilka osobnych grup tej samej rangi,
- joker jest dziki,
- wejście do gry wymaga minimum 30 punktów z własnych kart,
- 2–10 liczą się według numeru, J/Q/K = 10, A = 11,
- A może wystąpić przed 2; w takim sekwensie liczy się jako 1,
- A może wystąpić po K i wtedy liczy się jako 11,
- nie ma zawijania `K-A-2`,
- po wejściu można przebudowywać cały stół,
- karta, która była na stole przed turą, nie może wrócić do ręki ani zniknąć,
- joker ze stołu może zostać odzyskany/przeniesiony, jeżeli końcowy stół pozostaje w 100% poprawny,
- `PROSZĘ →` jest transakcyjnym zatwierdzeniem tury: cały stół jest walidowany dopiero wtedy,
- `Cofnij turę` wraca do stanu sprzed dobrania.

## Przykład przebudowy stołu

Jeżeli na stole leży `3♦ 4♦ 5♦`, a gracz ma `3♠ 3♣ 6♦`, po wejściu może przebudować stół na:

- `4♦ 5♦ 6♦`
- `3♦ 3♠ 3♣`

Ponieważ oba końcowe układy są legalne i żadna stara karta stołu nie zniknęła, `PROSZĘ →` zatwierdzi turę.

## Obsługa stołu

1. Dobierz kartę.
2. Kliknij `+ Nowy układ` albo wybierz istniejący układ.
3. Klikaj karty z ręki, aby przenosić je do aktywnego układu, albo użyj drag & drop.
4. Po własnym wejściu możesz przeciągać karty pomiędzy układami.
5. Nowo wyłożoną w tej turze kartę możesz przeciągnąć z powrotem do ręki. Karty, które były już na stole przed turą, muszą na nim zostać.
6. Kliknij `PROSZĘ →`.

## Stan projektu

Bot potrafi dobierać, szukać wejścia ≥30, tworzyć własne meldy i dokładać karty do istniejących legalnych układów. Nie robi jeszcze pełnego kombinatorycznego „przemeblowania” całego stołu tak dobrze jak człowiek — to naturalny następny etap AI/search engine.

## 0.3.1 – układanie ręki

- Karty w ręce można ręcznie przestawiać metodą drag & drop.
- Kolejność pozostaje zachowana po dobraniu kolejnych kart.
- Ten sam gest nadal służy do przeciągania kart z ręki do układów na stole.


## 0.3.3 — podpowiedź „ile jeszcze wyłożysz”

Przy liczniku ręki pojawia się mała kapsułka `↘ X`. Po najechaniu pokazuje tooltip z liczbą kart, które solver potrafi jeszcze legalnie wyłożyć z aktualnej ręki. Po wejściu do gry kalkulacja bierze pod uwagę także przebudowę kart już leżących na stole; przed wejściem respektuje minimum wejścia. Przeliczanie jest opóźnione o krótki debounce, żeby przeciąganie kart pozostało płynne.
